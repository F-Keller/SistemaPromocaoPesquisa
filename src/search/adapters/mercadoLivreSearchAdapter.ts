import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { load as loadHtml } from "cheerio";
import { nowIso, sanitizePrice } from "../../shared/utils";
import { isSuspiciousMarketplacePrice } from "../priceGuards";
import { createMercadoLivreExtractor } from "../scraping/extractors/mercadoLivreExtractor";
import { parsePrimaryPriceText, parsePriceText, toAbsoluteUrl } from "../scraping/parserUtils";
import { getStealthBrowser } from "../scraping/stealthBrowser";
import { ScraperError, ScraperErrorCode } from "../scraping/types";
import { AddressInput, MarketplaceProductCandidate } from "../types";
import { BaseSearchAdapter } from "./baseSearchAdapter";

interface MercadoLivreApiItem {
  id?: unknown;
  title?: unknown;
  permalink?: unknown;
  price?: unknown;
  original_price?: unknown;
  currency_id?: unknown;
  thumbnail?: unknown;
  secure_thumbnail?: unknown;
}

interface MercadoLivreApiResponse {
  results?: MercadoLivreApiItem[];
}

interface MercadoLivreSourceAttempt {
  source: MercadoLivreSourceName;
  run: () => Promise<MarketplaceProductCandidate[]>;
}

type MercadoLivreSourceName = "api_node" | "api_browser" | "html_node" | "html_browser";

interface MercadoLivreCatalogWinner {
  price?: unknown;
  original_price?: unknown;
  currency_id?: unknown;
  permalink?: unknown;
  thumbnail?: unknown;
  secure_thumbnail?: unknown;
  pictures?: Array<{
    url?: unknown;
    secure_url?: unknown;
  }>;
}

interface MercadoLivreCatalogResponse extends MercadoLivreCatalogWinner {
  buy_box_winner?: MercadoLivreCatalogWinner | null;
}

interface ResolvedMercadoLivrePrice {
  basePrice: number;
  referencePrice: number | null;
  productUrl: string | null;
  imageUrl: string | null;
}

const STEALTH_FALLBACK_ERROR_CODES = new Set<ScraperErrorCode>([
  "timeout",
  "blocked",
  "captcha",
  "parse_error",
  "headless_error",
  "network_error",
  "empty_result",
]);

export class MercadoLivreSearchAdapter extends BaseSearchAdapter {
  constructor(config: AppConfig, logger: AppLogger) {
    super({
      store: "mercadolivre",
      extractor: createMercadoLivreExtractor(config.store.mercadolivre.searchUrlTemplate),
      config,
      logger,
    });
  }

  async searchProducts(query: string, address: AddressInput): Promise<MarketplaceProductCandidate[]> {
    const attempts: MercadoLivreSourceAttempt[] = [
      {
        source: "api_node",
        run: () => this.fetchPublicApiCandidates(query, "node"),
      },
      {
        source: "api_browser",
        run: () => this.fetchPublicApiCandidates(query, "browser"),
      },
      {
        source: "html_node",
        run: () => this.fetchHtmlListingCandidates(query, "node"),
      },
      {
        source: "html_browser",
        run: () => this.fetchHtmlListingCandidates(query, "browser"),
      },
    ];
    let lastError: ScraperError | null = null;

    for (const attempt of attempts) {
      try {
        const candidates = await attempt.run();

        this.logger.debug(
          {
            store: this.store,
            source: attempt.source,
            fetched: candidates.length,
          },
          "Fonte do Mercado Livre retornou candidatos.",
        );

        return candidates;
      } catch (error) {
        if (!this.shouldUseStealthFallback(error)) {
          throw error;
        }

        const scraperError = error instanceof ScraperError
          ? error
          : new ScraperError("network_error", "Fonte do Mercado Livre indisponivel.", this.store);
        lastError = scraperError;

        this.logger.debug(
          {
            store: this.store,
            source: attempt.source,
            code: scraperError.code,
          },
          "Fonte do Mercado Livre indisponivel; tentando proxima.",
        );
      }
    }

    throw lastError ?? new ScraperError("empty_result", "Mercado Livre nao retornou produtos validos.", this.store);
  }

  private shouldUseStealthFallback(error: unknown): boolean {
    return error instanceof ScraperError && STEALTH_FALLBACK_ERROR_CODES.has(error.code);
  }

  private async fetchPublicApiCandidates(
    query: string,
    transport: "node" | "browser",
  ): Promise<MarketplaceProductCandidate[]> {
    const endpoint = new URL("https://api.mercadolibre.com/sites/MLB/search");
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("limit", String(this.publicApiLimit()));

    const payload = transport === "browser"
      ? await this.fetchJsonWithBrowser<MercadoLivreApiResponse>(endpoint.toString(), "API publica do Mercado Livre")
      : await this.fetchJson<MercadoLivreApiResponse>(endpoint.toString(), "API publica do Mercado Livre");
    const mapped = await Promise.all(
      (payload.results ?? []).map((item) => this.toCandidate(item, query)),
    );
    const candidates = mapped
      .filter((item): item is MarketplaceProductCandidate => item !== null)
      .slice(0, this.storeResultLimit());

    if (candidates.length === 0) {
      throw new ScraperError("empty_result", "API publica do Mercado Livre nao retornou produtos validos.", this.store);
    }

    return candidates;
  }

  private publicApiLimit(): number {
    return Math.max(
      1,
      this.config.searchMaxItemsPerStore,
      this.config.searchMaxResultsPerStore * 3,
    );
  }

  private storeResultLimit(): number {
    return Math.max(1, this.config.searchMaxResultsPerStore);
  }

  private async toCandidate(item: MercadoLivreApiItem, query: string): Promise<MarketplaceProductCandidate | null> {
    const storeItemId = this.readString(item.id);
    const title = this.readString(item.title);
    const productUrl = this.normalizeUrl(this.readString(item.permalink));
    const basePrice = this.readPrice(item.price);

    if (!storeItemId || !title || !productUrl || basePrice === null || !this.isSupportedCurrency(item.currency_id)) {
      return null;
    }

    const referencePrice = this.readPrice(item.original_price);
    let trustedPrice: ResolvedMercadoLivrePrice = {
      basePrice,
      referencePrice,
      productUrl,
      imageUrl: this.readString(item.secure_thumbnail) ?? this.readString(item.thumbnail),
    };

    if (isSuspiciousMarketplacePrice({ store: this.store, price: basePrice, query, title })) {
      const resolved = await this.resolveCatalogPrice(productUrl, query, title);

      if (!resolved) {
        this.logSuspiciousPrice(storeItemId);
        return null;
      }

      trustedPrice = {
        basePrice: resolved.basePrice,
        referencePrice: resolved.referencePrice ?? referencePrice,
        productUrl: resolved.productUrl ?? productUrl,
        imageUrl: resolved.imageUrl ?? trustedPrice.imageUrl,
      };
    }

    return {
      store: this.store,
      storeItemId,
      title,
      category: null,
      imageUrl: trustedPrice.imageUrl,
      productUrl: trustedPrice.productUrl ?? productUrl,
      affiliateUrl: trustedPrice.productUrl ?? productUrl,
      basePrice: trustedPrice.basePrice,
      referencePrice: trustedPrice.referencePrice,
      sku: null,
      gtin: null,
      brand: null,
      model: null,
      coupons: [],
      shippingOptions: [],
      taxAmount: null,
      capturedAt: nowIso(),
      priceSource: "listing",
    };
  }

  private async fetchJson<T>(url: string, label: string): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = Math.min(this.config.externalRequestTimeoutMs, 10000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": this.config.scraperUserAgent,
        },
        signal: controller.signal,
      });
    } catch (error) {
      const isAbort = (error as Error)?.name === "AbortError";
      throw new ScraperError(
        isAbort ? "timeout" : "network_error",
        isAbort ? `Timeout ao consultar ${label}.` : `Falha ao consultar ${label}.`,
        this.store,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ScraperError("network_error", `${label} retornou status ${response.status}.`, this.store);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ScraperError("parse_error", `Resposta invalida de ${label}.`, this.store);
    }
  }

  private async fetchJsonWithBrowser<T>(url: string, label: string): Promise<T> {
    const browser = getStealthBrowser(this.config, this.logger);

    try {
      const result = await browser.withPage(async ({ page }) =>
        page.evaluate(
          async ({ targetUrl, timeoutMs }) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
              const response = await fetch(targetUrl, {
                headers: {
                  accept: "application/json",
                },
                signal: controller.signal,
              });
              const text = await response.text();
              return {
                ok: response.ok,
                status: response.status,
                text,
              };
            } finally {
              clearTimeout(timeout);
            }
          },
          {
            targetUrl: url,
            timeoutMs: this.config.externalRequestTimeoutMs,
          },
        ),
      );

      if (!result.ok) {
        throw new ScraperError("network_error", `${label} retornou status ${result.status}.`, this.store);
      }

      return JSON.parse(result.text) as T;
    } catch (error) {
      if (error instanceof ScraperError) throw error;

      const message = (error as Error)?.message?.toLowerCase() ?? "";
      throw new ScraperError(
        message.includes("abort") || message.includes("timeout") ? "timeout" : "network_error",
        `Falha ao consultar ${label} pelo browser.`,
        this.store,
      );
    }
  }

  private async fetchHtmlListingCandidates(
    query: string,
    transport: "node" | "browser",
  ): Promise<MarketplaceProductCandidate[]> {
    const searchUrl = this.buildListingUrl(query);
    const html = transport === "browser"
      ? await this.fetchHtmlWithBrowser(searchUrl)
      : await this.fetchHtml(searchUrl, "Listagem HTML do Mercado Livre");
    const rawItems = this.extractItemsFromListingHtml(html, searchUrl);
    const mapped = await Promise.all(rawItems.map((item) => this.toCandidate(item, query)));
    const candidates = this.dedupeCandidates(
      mapped.filter((item): item is MarketplaceProductCandidate => item !== null),
    ).slice(0, this.storeResultLimit());

    if (candidates.length === 0) {
      throw new ScraperError("empty_result", "Listagem do Mercado Livre nao retornou produtos validos.", this.store);
    }

    return candidates;
  }

  private async fetchHtml(url: string, label: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.externalRequestTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "user-agent": this.config.scraperUserAgent,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ScraperError("network_error", `${label} retornou status ${response.status}.`, this.store);
      }

      return await response.text();
    } catch (error) {
      if (error instanceof ScraperError) throw error;

      const isAbort = (error as Error)?.name === "AbortError";
      throw new ScraperError(
        isAbort ? "timeout" : "network_error",
        isAbort ? `Timeout ao consultar ${label}.` : `Falha ao consultar ${label}.`,
        this.store,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchHtmlWithBrowser(url: string): Promise<string> {
    const browser = getStealthBrowser(this.config, this.logger);

    try {
      return await browser.withPage(async ({ page }) => {
        await page.goto(url, {
          timeout: this.config.scraperTimeoutHeadlessMs,
          waitUntil: "domcontentloaded",
        });
        return await page.content();
      });
    } catch (error) {
      const message = (error as Error)?.message?.toLowerCase() ?? "";
      throw new ScraperError(
        message.includes("timeout") || message.includes("timed out") ? "timeout" : "headless_error",
        "Falha ao consultar listagem HTML do Mercado Livre pelo browser.",
        this.store,
      );
    }
  }

  private buildListingUrl(query: string): string {
    const slug = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => encodeURIComponent(token))
      .join("-");

    return this.config.store.mercadolivre.searchUrlTemplate.replaceAll(
      "{query}",
      slug,
    );
  }

  private extractItemsFromListingHtml(html: string, searchUrl: string): MercadoLivreApiItem[] {
    const fromJson = this.extractItemsFromEmbeddedJson(html, searchUrl);
    if (fromJson.length > 0) return fromJson;

    return this.extractItemsFromHtmlCards(html, searchUrl);
  }

  private extractItemsFromEmbeddedJson(html: string, searchUrl: string): MercadoLivreApiItem[] {
    const $ = loadHtml(html);
    const items: MercadoLivreApiItem[] = [];

    $("script").each((_index, element) => {
      const raw = $(element).text().trim();
      if (!raw) return;

      for (const candidate of this.extractJsonCandidates(raw)) {
        const parsed = this.parseJson(candidate);
        if (parsed === null) continue;
        this.collectItemsFromUnknown(parsed, items, searchUrl);
      }
    });

    return this.dedupeRawItems(items).slice(0, this.publicApiLimit());
  }

  private extractJsonCandidates(raw: string): string[] {
    const candidates: string[] = [];
    const clean = raw.trim();

    if (clean.startsWith("{") || clean.startsWith("[")) {
      candidates.push(clean);
    }

    const stateMatch = clean.match(/(?:__PRELOADED_STATE__|__PRELOADED_STATE__\s*=|window\.__PRELOADED_STATE__)\s*=\s*({[\s\S]+?})\s*;?\s*(?:<\/script>)?$/);
    if (stateMatch?.[1]) {
      candidates.push(stateMatch[1]);
    }

    return candidates;
  }

  private parseJson(raw: string): unknown | null {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private collectItemsFromUnknown(value: unknown, output: MercadoLivreApiItem[], searchUrl: string): void {
    if (!value || output.length >= this.publicApiLimit()) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectItemsFromUnknown(item, output, searchUrl);
        if (output.length >= this.publicApiLimit()) break;
      }
      return;
    }

    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const direct = this.toRawItemFromRecord(record, searchUrl);
    if (direct) {
      output.push(direct);
      return;
    }

    for (const nested of Object.values(record)) {
      this.collectItemsFromUnknown(nested, output, searchUrl);
      if (output.length >= this.publicApiLimit()) break;
    }
  }

  private toRawItemFromRecord(record: Record<string, unknown>, searchUrl: string): MercadoLivreApiItem | null {
    const title = this.readString(record.title ?? record.name);
    const rawUrl = this.readString(record.permalink ?? record.url ?? record.link ?? record.href);
    const productUrl = this.normalizeUrl(toAbsoluteUrl(rawUrl ?? "", searchUrl));
    const price =
      this.readPrice(record.price) ??
      this.readPrice(record.amount) ??
      this.readPrice(record.value);
    const id = this.readString(record.id) ?? (productUrl ? this.extractItemIdFromUrl(productUrl) : null);

    if (!id || !title || !productUrl || price === null) return null;

    return {
      id,
      title,
      permalink: productUrl,
      price,
      original_price: this.readPrice(record.original_price ?? record.originalPrice ?? record.previous_price),
      currency_id: record.currency_id ?? record.currencyId ?? "BRL",
      thumbnail:
        this.readString(record.thumbnail) ??
        this.readString(record.image) ??
        this.readString(record.picture),
      secure_thumbnail:
        this.readString(record.secure_thumbnail) ??
        this.readString(record.secureThumbnail) ??
        this.readString(record.image_url),
    };
  }

  private extractItemsFromHtmlCards(html: string, searchUrl: string): MercadoLivreApiItem[] {
    const $ = loadHtml(html);
    const items: MercadoLivreApiItem[] = [];
    const cards = $(".ui-search-layout__item, .poly-card, .ui-search-result").toArray();

    for (const card of cards) {
      const root = $(card);
      const link = root.find("a.poly-component__title, a.ui-search-link, a[href*='MLB']").first();
      const rawHref = link.attr("href");
      const productUrl = this.normalizeUrl(toAbsoluteUrl(rawHref ?? "", searchUrl));
      if (!productUrl) continue;

      const id = this.extractItemIdFromUrl(productUrl);
      const title = this.readString(
        link.text() ||
        link.attr("title") ||
        root.find("h2, .poly-component__title, .ui-search-item__title").first().text(),
      );
      const price = this.extractCardPrice($, root, false);
      if (!id || !title || price === null) continue;

      items.push({
        id,
        title,
        permalink: productUrl,
        price,
        original_price: this.extractCardPrice($, root, true),
        currency_id: "BRL",
        secure_thumbnail: this.extractCardImage(root, searchUrl),
      });

      if (items.length >= this.publicApiLimit()) break;
    }

    return this.dedupeRawItems(items);
  }

  private extractCardPrice($: ReturnType<typeof loadHtml>, root: any, reference: boolean): number | null {
    const selectors = reference
      ? [
          ".andes-money-amount--previous",
          ".andes-money-amount--previous .andes-money-amount__fraction",
          "[class*='previous'] .andes-money-amount",
          "[class*='old-price'] .andes-money-amount",
        ]
      : [
          "[itemprop='offers'] .andes-money-amount",
          ".poly-price__current .andes-money-amount",
          ".poly-component__price .andes-money-amount",
          ".ui-search-price__second-line .andes-money-amount",
          ".andes-money-amount[aria-label]",
          ".andes-money-amount",
        ];

    for (const selector of selectors) {
      const elements = root.find(selector).toArray();

      for (const element of elements) {
        const node = $(element);
        if (!reference && this.isInstallmentNode($, node, root)) continue;
        if (!reference && this.isReferenceNode(node)) continue;

        const text = this.readMoneyText(node);
        if (!text || this.isInstallmentText(text)) continue;

        const parsed = parsePrimaryPriceText(text) ?? parsePriceText(text);
        if (parsed !== null) return parsed;
      }
    }

    return null;
  }

  private readMoneyText(node: any): string | null {
    const amount = node.is(".andes-money-amount") ? node : node.closest(".andes-money-amount");

    if (amount.length > 0) {
      const fraction = this.readString(amount.find(".andes-money-amount__fraction").first().text());
      const cents = this.readString(amount.find(".andes-money-amount__cents").first().text());
      if (fraction) return cents ? `R$ ${fraction},${cents}` : `R$ ${fraction},00`;

      const aria = this.readString(amount.attr("aria-label"));
      if (aria) return aria;
    }

    return this.readString(
      node.text() ||
      node.attr("aria-label") ||
      node.attr("content") ||
      node.attr("value"),
    );
  }

  private isInstallmentNode($: ReturnType<typeof loadHtml>, node: any, root: any): boolean {
    const contexts = [
      node,
      node.closest(".poly-price__installments"),
      node.closest(".ui-search-installments"),
      node.parent(),
      node.parent().parent(),
    ];

    for (const context of contexts) {
      if (!context || context.length === 0) continue;
      const text = this.readString(context.text()) ?? "";
      const amountCount = context.find(".andes-money-amount").length;
      if (this.isInstallmentText(text) && amountCount <= 1) return true;
    }

    const rootText = this.readString(root.text()) ?? "";
    return this.isInstallmentText(rootText) && root.find(".andes-money-amount").length <= 1;
  }

  private isReferenceNode(node: any): boolean {
    return node.closest(
      ".andes-money-amount--previous, .andes-money-amount--strike, .andes-money-amount--discount, s, del, [class*='previous'], [class*='old-price'], [class*='original']",
    ).length > 0;
  }

  private isInstallmentText(value: string | null | undefined): boolean {
    return /\b\d{1,2}\s*x\b|\bem\s+\d{1,2}\s*x\b|\bparcel|sem\s+juros/i.test(String(value ?? ""));
  }

  private extractCardImage(root: any, searchUrl: string): string | null {
    const image = root.find("img").first();
    if (image.length === 0) return null;

    const attrs = ["data-src", "data-original", "data-image", "src", "srcset", "data-srcset"];
    for (const attr of attrs) {
      const raw = this.readString(image.attr(attr));
      if (!raw) continue;

      const value = attr.includes("srcset") ? this.pickBestSrcset(raw) : raw;
      const absolute = this.normalizeUrl(toAbsoluteUrl(value, searchUrl));
      if (absolute) return absolute;
    }

    return null;
  }

  private pickBestSrcset(value: string): string {
    const entries = value.split(",").map((item) => item.trim()).filter(Boolean);
    const last = entries[entries.length - 1] ?? value;
    return last.split(/\s+/)[0] ?? value;
  }

  private extractItemIdFromUrl(productUrl: string): string | null {
    try {
      const url = new URL(productUrl);
      const catalogMatch = url.pathname.match(/\/p\/(MLB\d+)/i);
      if (catalogMatch?.[1]) return catalogMatch[1].toUpperCase();

      const itemMatch = url.pathname.match(/(MLB-?\d+)/i);
      if (itemMatch?.[1]) return itemMatch[1].replace("-", "").toUpperCase();

      return null;
    } catch {
      return null;
    }
  }

  private dedupeRawItems(items: MercadoLivreApiItem[]): MercadoLivreApiItem[] {
    const unique = new Map<string, MercadoLivreApiItem>();

    for (const item of items) {
      const key = this.readString(item.id) ?? this.readString(item.permalink);
      if (!key || unique.has(key)) continue;
      unique.set(key, item);
    }

    return [...unique.values()];
  }

  private dedupeCandidates(candidates: MarketplaceProductCandidate[]): MarketplaceProductCandidate[] {
    const unique = new Map<string, MarketplaceProductCandidate>();

    for (const candidate of candidates) {
      const key = candidate.productUrl || candidate.storeItemId;
      if (!unique.has(key)) unique.set(key, candidate);
    }

    return [...unique.values()];
  }

  private async resolveCatalogPrice(
    productUrl: string,
    query: string,
    title: string,
  ): Promise<ResolvedMercadoLivrePrice | null> {
    const productId = this.extractCatalogProductId(productUrl);
    if (!productId) return null;

    try {
      const payload = await this.fetchJson<MercadoLivreCatalogResponse>(
        `https://api.mercadolibre.com/products/${encodeURIComponent(productId)}`,
        "API de catalogo do Mercado Livre",
      );
      const winner = payload.buy_box_winner ?? payload;
      if (!this.isSupportedCurrency(winner.currency_id)) return null;

      const basePrice = this.readPrice(winner.price);
      if (
        basePrice === null ||
        isSuspiciousMarketplacePrice({ store: this.store, price: basePrice, query, title })
      ) {
        return null;
      }

      const referencePrice = this.readPrice(winner.original_price);
      const productUrlFromWinner = this.normalizeUrl(this.readString(winner.permalink));
      const imageUrl =
        this.readString(winner.secure_thumbnail) ??
        this.readString(winner.thumbnail) ??
        this.firstCatalogPicture(winner.pictures);

      return {
        basePrice,
        referencePrice,
        productUrl: productUrlFromWinner,
        imageUrl,
      };
    } catch (error) {
      this.logger.debug(
        {
          store: this.store,
          productUrl,
          code: error instanceof ScraperError ? error.code : "network_error",
        },
        "Preco secundario do Mercado Livre indisponivel; item sera descartado se suspeito.",
      );

      return null;
    }
  }

  private extractCatalogProductId(productUrl: string): string | null {
    try {
      const url = new URL(productUrl);
      const match = url.pathname.match(/\/p\/(MLB\d+)/i);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  private firstCatalogPicture(pictures: MercadoLivreCatalogWinner["pictures"]): string | null {
    if (!Array.isArray(pictures)) return null;

    for (const picture of pictures) {
      const imageUrl = this.readString(picture.secure_url) ?? this.readString(picture.url);
      if (imageUrl) return imageUrl;
    }

    return null;
  }

  private isSupportedCurrency(value: unknown): boolean {
    const currency = this.readString(value);
    return !currency || currency.toUpperCase() === "BRL";
  }

  private readPrice(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;

    const raw = String(value).trim();
    const normalized = raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw;
    const numeric = typeof value === "number" ? value : Number(normalized);
    const sanitized = sanitizePrice(numeric);
    return Number.isFinite(sanitized) && sanitized > 0 ? sanitized : null;
  }

  private logSuspiciousPrice(storeItemId: string): void {
    this.logger.debug(
      {
        store: this.store,
        storeItemId,
        reason: "suspicious_price",
      },
      "Item descartado por preco suspeito.",
    );
  }

  private readString(value: unknown): string | null {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    return normalized || null;
  }

  private normalizeUrl(value: string | null): string | null {
    if (!value) return null;

    try {
      const url = new URL(value);
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }
}
