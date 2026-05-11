import { load as loadHtml } from "cheerio";
import type { Page } from "playwright";
import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { nowIso, sanitizePrice } from "../../shared/utils";
import { createShopeeExtractor } from "../scraping/extractors/shopeeExtractor";
import {
  detectCaptchaHtml,
  parsePrimaryPriceText,
  parsePriceText,
  toAbsoluteUrl,
} from "../scraping/parserUtils";
import { getStealthBrowser, StealthBrowser, StealthPageSession } from "../scraping/stealthBrowser";
import { ScraperError, ScraperErrorCode } from "../scraping/types";
import { AddressInput, MarketplaceProductCandidate } from "../types";
import { BaseSearchAdapter } from "./baseSearchAdapter";

type ShopeeSourceName =
  | "feed_configured"
  | "api_node"
  | "api_browser_session"
  | "html_node"
  | "html_browser_session"
  | "stealth_grid_session";

interface ShopeeSourceAttempt {
  source: ShopeeSourceName;
  run: () => Promise<MarketplaceProductCandidate[]>;
}

interface ShopeeRawItem {
  shopId: string;
  itemId: string;
  title: string;
  productUrl: string;
  price: number;
  referencePrice: number | null;
  imageUrl: string | null;
}

const SHOPEE_FALLBACK_ERROR_CODES = new Set<ScraperErrorCode>([
  "timeout",
  "blocked",
  "captcha",
  "parse_error",
  "headless_error",
  "network_error",
  "empty_result",
]);

export class ShopeeSearchAdapter extends BaseSearchAdapter {
  constructor(config: AppConfig, logger: AppLogger) {
    super({
      store: "shopee",
      extractor: createShopeeExtractor(config.store.shopee.searchUrlTemplate),
      config,
      logger,
    });
  }

  async searchProducts(query: string, address: AddressInput): Promise<MarketplaceProductCandidate[]> {
    const attempts: ShopeeSourceAttempt[] = [];

    if (this.config.store.shopee.feedUrl.trim()) {
      attempts.push({
        source: "feed_configured",
        run: () => this.fetchConfiguredFeedCandidates(query),
      });
    }

    attempts.push(
      {
        source: "api_node",
        run: () => this.fetchApiCandidates(query, "node"),
      },
      {
        source: "api_browser_session",
        run: () => this.fetchApiCandidates(query, "browser"),
      },
      {
        source: "html_node",
        run: () => this.fetchHtmlCandidates(query, "node"),
      },
      {
        source: "html_browser_session",
        run: () => this.fetchHtmlCandidates(query, "browser"),
      },
      {
        source: "stealth_grid_session",
        run: () => super.searchProducts(query, address),
      },
    );
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
          "Fonte da Shopee retornou candidatos.",
        );

        return candidates;
      } catch (error) {
        if (!this.shouldTryNextSource(error)) {
          throw error;
        }

        const scraperError = error instanceof ScraperError
          ? error
          : new ScraperError("network_error", "Fonte da Shopee indisponivel.", this.store);
        lastError = scraperError;

        this.logger.debug(
          {
            store: this.store,
            source: attempt.source,
            code: scraperError.code,
          },
          "Fonte da Shopee indisponivel; tentando proxima.",
        );
      }
    }

    throw lastError ?? new ScraperError("empty_result", "Shopee nao retornou produtos validos.", this.store);
  }

  protected override async withSearchPage<T>(
    browser: StealthBrowser,
    worker: (session: StealthPageSession) => Promise<T>,
  ): Promise<T> {
    return browser.withPersistentPage(
      {
        label: "shopee",
        profileDir: this.config.shopeeBrowserProfileDir,
        blockResources: false,
      },
      worker,
    );
  }

  private shouldTryNextSource(error: unknown): boolean {
    return error instanceof ScraperError && SHOPEE_FALLBACK_ERROR_CODES.has(error.code);
  }

  private async fetchConfiguredFeedCandidates(query: string): Promise<MarketplaceProductCandidate[]> {
    const url = this.buildConfiguredFeedUrl(query);
    if (!url) {
      throw new ScraperError("empty_result", "Feed da Shopee nao configurado.", this.store);
    }

    const rawPayload = await this.fetchText(url, "Feed configurado da Shopee", {
      accept: "application/json,text/html,application/xhtml+xml",
      referer: "https://shopee.com.br/",
    });
    const rawItems = this.extractItemsFromTextPayload(rawPayload, url);
    const candidates = this.toCandidates(rawItems).slice(0, this.storeResultLimit());

    if (candidates.length === 0) {
      throw new ScraperError("empty_result", "Feed configurado da Shopee nao retornou produtos validos.", this.store);
    }

    return candidates;
  }

  private async fetchApiCandidates(
    query: string,
    transport: "node" | "browser",
  ): Promise<MarketplaceProductCandidate[]> {
    const url = this.buildApiUrl(query);
    const payload = transport === "browser"
      ? await this.fetchJsonWithBrowser<unknown>(url, "API publica da Shopee")
      : await this.fetchJson<unknown>(url, "API publica da Shopee");
    const rawItems = this.extractItemsFromUnknown(payload);
    const candidates = this.toCandidates(rawItems).slice(0, this.storeResultLimit());

    if (candidates.length === 0) {
      throw new ScraperError("empty_result", "API publica da Shopee nao retornou produtos validos.", this.store);
    }

    return candidates;
  }

  private async fetchHtmlCandidates(
    query: string,
    transport: "node" | "browser",
  ): Promise<MarketplaceProductCandidate[]> {
    const searchUrl = this.buildSearchUrl(query);
    const html = transport === "browser"
      ? await this.fetchHtmlWithBrowser(searchUrl)
      : await this.fetchHtml(searchUrl, "Listagem HTML da Shopee");
    const rawItems = this.extractItemsFromHtml(html, searchUrl);
    const candidates = this.toCandidates(rawItems).slice(0, this.storeResultLimit());

    if (candidates.length === 0) {
      if (detectCaptchaHtml(html)) {
        throw new ScraperError("captcha", "Captcha detectado na listagem HTML da Shopee.", this.store);
      }

      throw new ScraperError("empty_result", "Listagem da Shopee nao retornou produtos validos.", this.store);
    }

    return candidates;
  }

  private buildApiUrl(query: string): string {
    const endpoint = new URL("https://shopee.com.br/api/v4/search/search_items");
    endpoint.searchParams.set("by", "relevancy");
    endpoint.searchParams.set("keyword", query);
    endpoint.searchParams.set("limit", String(this.publicApiLimit()));
    endpoint.searchParams.set("newest", "0");
    endpoint.searchParams.set("order", "desc");
    endpoint.searchParams.set("page_type", "search");
    endpoint.searchParams.set("scenario", "PAGE_GLOBAL_SEARCH");
    endpoint.searchParams.set("version", "2");
    return endpoint.toString();
  }

  private buildSearchUrl(query: string): string {
    return this.config.store.shopee.searchUrlTemplate.replaceAll("{query}", encodeURIComponent(query.trim()));
  }

  private buildConfiguredFeedUrl(query: string): string | null {
    const template = this.config.store.shopee.feedUrl.trim();
    if (!template) return null;

    const normalizedQuery = query.trim();
    const encodedQuery = encodeURIComponent(normalizedQuery);
    const replaced = template
      .replaceAll("{query}", encodedQuery)
      .replaceAll("{queryRaw}", normalizedQuery)
      .replaceAll("{limit}", String(this.publicApiLimit()));

    try {
      const url = new URL(replaced);
      if (!template.includes("{query") && !url.searchParams.has("q") && !url.searchParams.has("keyword")) {
        url.searchParams.set("q", normalizedQuery);
      }
      if (!template.includes("{limit}") && !url.searchParams.has("limit")) {
        url.searchParams.set("limit", String(this.publicApiLimit()));
      }
      return url.toString();
    } catch {
      return null;
    }
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

  private async fetchJson<T>(url: string, label: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.externalRequestTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          referer: "https://shopee.com.br/",
          "user-agent": this.config.scraperUserAgent,
          "x-api-source": "pc",
          "x-shopee-language": "pt-BR",
          "x-requested-with": "XMLHttpRequest",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ScraperError("network_error", `${label} retornou status ${response.status}.`, this.store);
      }

      return (await response.json()) as T;
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

  private async fetchJsonWithBrowser<T>(url: string, label: string): Promise<T> {
    try {
      const result = await this.withShopeeSession(async (page) => {
        return page.evaluate(
          async ({ targetUrl, timeoutMs }) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
              const response = await fetch(targetUrl, {
                headers: {
                  accept: "application/json",
                  "x-api-source": "pc",
                  "x-shopee-language": "pt-BR",
                  "x-requested-with": "XMLHttpRequest",
                },
                credentials: "include",
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
        );
      });

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

  private async fetchHtml(url: string, label: string): Promise<string> {
    return this.fetchText(url, label, {
      accept: "text/html,application/xhtml+xml",
    });
  }

  private async fetchText(
    url: string,
    label: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.externalRequestTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          accept: extraHeaders.accept ?? "text/html,application/xhtml+xml",
          "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          referer: extraHeaders.referer ?? "https://shopee.com.br/",
          "user-agent": this.config.scraperUserAgent,
          ...extraHeaders,
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
    try {
      return await this.withShopeeSession(async (page) => {
        await page.goto(url, {
          timeout: this.config.scraperTimeoutHeadlessMs,
          waitUntil: "domcontentloaded",
        });
        await page.waitForLoadState("networkidle", { timeout: this.config.scraperTimeoutHeadlessMs }).catch(
          () => undefined,
        );
        return await page.content();
      });
    } catch (error) {
      const message = (error as Error)?.message?.toLowerCase() ?? "";
      throw new ScraperError(
        message.includes("timeout") || message.includes("timed out") ? "timeout" : "headless_error",
        "Falha ao consultar listagem HTML da Shopee pelo browser.",
        this.store,
      );
    }
  }

  private async withShopeeSession<T>(worker: (page: Page) => Promise<T>): Promise<T> {
    const browser = getStealthBrowser(this.config, this.logger);

    return browser.withPersistentPage(
      {
        label: "shopee",
        profileDir: this.config.shopeeBrowserProfileDir,
        blockResources: false,
      },
      async ({ page }) => {
        await this.warmupShopee(page);
        return worker(page);
      },
    );
  }

  private async warmupShopee(page: Page): Promise<void> {
    await page.goto("https://shopee.com.br/", {
      timeout: this.config.scraperTimeoutHeadlessMs,
      waitUntil: "domcontentloaded",
    }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: this.config.scraperTimeoutHeadlessMs }).catch(
      () => undefined,
    );
  }

  private extractItemsFromTextPayload(payload: string, sourceUrl: string): ShopeeRawItem[] {
    const trimmed = payload.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed = this.parseJson(trimmed);
      if (parsed !== null) return this.extractItemsFromUnknown(parsed);
    }

    return this.extractItemsFromHtml(payload, sourceUrl);
  }

  private extractItemsFromHtml(html: string, searchUrl: string): ShopeeRawItem[] {
    const fromJson = this.extractItemsFromEmbeddedJson(html, searchUrl);
    if (fromJson.length > 0) return fromJson;

    return this.extractItemsFromHtmlCards(html, searchUrl);
  }

  private extractItemsFromEmbeddedJson(html: string, searchUrl: string): ShopeeRawItem[] {
    const $ = loadHtml(html);
    const items: ShopeeRawItem[] = [];

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
    const clean = raw.trim();
    const candidates: string[] = [];

    if (clean.startsWith("{") || clean.startsWith("[")) {
      candidates.push(clean);
    }

    const assignmentMatch = clean.match(
      /(?:window\.__INITIAL_STATE__|window\.__INITIAL_STATE__\s*=|__INITIAL_STATE__|__NEXT_DATA__)\s*=\s*({[\s\S]+?})\s*;?\s*$/,
    );
    if (assignmentMatch?.[1]) candidates.push(assignmentMatch[1]);

    return candidates;
  }

  private parseJson(raw: string): unknown | null {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private extractItemsFromUnknown(value: unknown): ShopeeRawItem[] {
    const output: ShopeeRawItem[] = [];
    this.collectItemsFromUnknown(value, output, "https://shopee.com.br/");
    return this.dedupeRawItems(output).slice(0, this.publicApiLimit());
  }

  private collectItemsFromUnknown(value: unknown, output: ShopeeRawItem[], searchUrl: string): void {
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

  private toRawItemFromRecord(record: Record<string, unknown>, searchUrl: string): ShopeeRawItem | null {
    const itemBasic = record.item_basic && typeof record.item_basic === "object"
      ? record.item_basic as Record<string, unknown>
      : null;
    const source = itemBasic ?? record;

    const shopId = this.readId(source.shopid ?? source.shop_id ?? record.shopid ?? record.shop_id);
    const itemId = this.readId(source.itemid ?? source.item_id ?? record.itemid ?? record.item_id);
    const title = this.readString(source.name ?? source.title ?? record.name ?? record.title);
    const basePrice =
      this.readShopeePrice(source.price) ??
      this.readShopeePrice(source.price_min) ??
      this.readShopeePrice(source.price_min_before_discount) ??
      this.readShopeePrice(source.price_before_discount) ??
      this.readShopeePrice(source.display_price);

    if (!shopId || !itemId || !title || basePrice === null) return null;

    const rawUrl = this.readString(
      source.url ??
      source.product_url ??
      source.productUrl ??
      source.link ??
      record.url ??
      record.href,
    );
    const productUrl = this.normalizeProductUrl(
      rawUrl ? toAbsoluteUrl(rawUrl, searchUrl) : null,
      title,
      shopId,
      itemId,
    );
    if (!productUrl) return null;

    return {
      shopId,
      itemId,
      title,
      productUrl,
      price: basePrice,
      referencePrice:
        this.readShopeePrice(source.price_before_discount) ??
        this.readShopeePrice(source.price_max_before_discount) ??
        null,
        imageUrl: this.normalizeShopeeImageUrl(
        this.readString(source.image_url) ??
        this.readString(source.image) ??
        this.readString(source.cover) ??
        this.firstString(source.images),
      ),
    };
  }

  private extractItemsFromHtmlCards(html: string, searchUrl: string): ShopeeRawItem[] {
    const $ = loadHtml(html);
    const items: ShopeeRawItem[] = [];
    const cards = $(
      "[data-testid='product-card'], li[data-sqe='item'], div[data-sqe='item'], a[data-sqe='link'], a.shopee-search-item-result__item, a[href*='-i.'], a[href*='product-i.']",
    ).toArray();

    for (const card of cards) {
      const root = $(card);
      const link = root.is("a")
        ? root
        : root.find("a[data-sqe='link'], a.shopee-search-item-result__item, a[href*='-i.'], a[href*='product-i.']").first();
      const productUrl = this.normalizeProductUrl(toAbsoluteUrl(this.readString(link.attr("href")) ?? "", searchUrl));
      if (!productUrl) continue;

      const itemIds = this.extractIdsFromUrl(productUrl);
      if (!itemIds) continue;

      const title = this.readString(
        root.find("[data-testid='product-card-name'], [class*='line-clamp'], [class*='product-card-name'], [class*='name']").first().text() ||
        link.attr("title") ||
        link.text(),
      );
      const price = this.extractCardPrice($, root, false);
      if (!title || price === null) continue;

      items.push({
        shopId: itemIds.shopId,
        itemId: itemIds.itemId,
        title,
        productUrl,
        price,
        referencePrice: this.extractCardPrice($, root, true),
        imageUrl: this.extractCardImage(root, searchUrl),
      });

      if (items.length >= this.publicApiLimit()) break;
    }

    return this.dedupeRawItems(items);
  }

  private extractCardPrice($: ReturnType<typeof loadHtml>, root: any, reference: boolean): number | null {
    const selectors = reference
      ? [
          "[class*='origin']",
          "[class*='before']",
          "s",
          "del",
        ]
      : [
          "[data-testid='product-card-price']",
          "[data-testid='price']",
          "[class*='price']",
          "[class*='Price']",
          "span",
          "div",
        ];

    for (const selector of selectors) {
      const elements = root.find(selector).toArray();

      for (const element of elements) {
        const node = $(element);
        const text = this.readString(node.text() || node.attr("aria-label") || node.attr("content"));
        if (!text || !this.hasPriceSignal(text)) continue;
        if (!reference && this.isInstallmentNode(node)) continue;
        if (!reference && this.isReferenceNode(node)) continue;

        const parsed = this.parseListingPrice(text);
        if (parsed !== null) return parsed;
      }
    }

    return null;
  }

  private parseListingPrice(text: string | null | undefined): number | null {
    const primary = parsePrimaryPriceText(text);
    if (primary !== null) return primary;
    if (this.isInstallmentText(text)) return null;
    return parsePriceText(text);
  }

  private hasPriceSignal(value: string): boolean {
    return /r\$\s*\d|\d+[,.]\d{2}/i.test(value);
  }

  private isInstallmentNode(node: any): boolean {
    const contexts = [
      node,
      node.parent(),
      node.parent().parent(),
      node.closest("[class*='installment']"),
      node.closest("[class*='parcel']"),
    ];

    for (const context of contexts) {
      if (!context || context.length === 0) continue;
      const text = this.readString(context.text()) ?? "";
      if (this.isInstallmentText(text)) return true;
    }

    return false;
  }

  private isReferenceNode(node: any): boolean {
    return node.closest("s, del, [class*='origin'], [class*='before'], [class*='old'], [class*='strike']").length > 0;
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
      const absolute = this.normalizeShopeeImageUrl(toAbsoluteUrl(value, searchUrl) ?? value);
      if (absolute) return absolute;
    }

    return null;
  }

  private pickBestSrcset(value: string): string {
    const entries = value.split(",").map((item) => item.trim()).filter(Boolean);
    const last = entries[entries.length - 1] ?? value;
    return last.split(/\s+/)[0] ?? value;
  }

  private toCandidates(items: ShopeeRawItem[]): MarketplaceProductCandidate[] {
    return this.dedupeRawItems(items).map((item) => ({
      store: this.store,
      storeItemId: `${item.shopId}.${item.itemId}`,
      title: item.title,
      category: null,
      imageUrl: item.imageUrl,
      productUrl: item.productUrl,
      affiliateUrl: item.productUrl,
      basePrice: item.price,
      referencePrice: item.referencePrice,
      sku: null,
      gtin: null,
      brand: null,
      model: null,
      coupons: [],
      shippingOptions: [],
      taxAmount: null,
      capturedAt: nowIso(),
      priceSource: "listing",
    }));
  }

  private dedupeRawItems(items: ShopeeRawItem[]): ShopeeRawItem[] {
    const unique = new Map<string, ShopeeRawItem>();

    for (const item of items) {
      const key = `${item.shopId}.${item.itemId}`;
      if (!unique.has(key)) unique.set(key, item);
    }

    return [...unique.values()];
  }

  private normalizeProductUrl(
    value: string | null,
    title?: string,
    shopId?: string,
    itemId?: string,
  ): string | null {
    const ids = value ? this.extractIdsFromUrl(value) : null;
    const targetShopId = ids?.shopId ?? shopId;
    const targetItemId = ids?.itemId ?? itemId;

    if (!targetShopId || !targetItemId) return null;

    if (value) {
      try {
        const url = new URL(value);
        if (!url.hostname.toLowerCase().includes("shopee.")) return null;
        url.hash = "";
        url.search = "";
        return url.toString();
      } catch {
        return null;
      }
    }

    return `https://shopee.com.br/${this.slugify(title ?? "produto")}-i.${targetShopId}.${targetItemId}`;
  }

  private extractIdsFromUrl(productUrl: string): { shopId: string; itemId: string } | null {
    try {
      const url = new URL(productUrl);
      const match = url.pathname.match(/(?:product-i\.|-i\.)(\d+)\.(\d+)/i);
      if (!match) return null;
      return {
        shopId: match[1],
        itemId: match[2],
      };
    } catch {
      return null;
    }
  }

  private normalizeShopeeImageUrl(value: string | null): string | null {
    const raw = this.readString(value);
    if (!raw) return null;

    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("//")) return `https:${raw}`;
    if (/^[a-z0-9_-]{16,}$/i.test(raw)) return `https://down-br.img.susercontent.com/file/${raw}`;
    return null;
  }

  private firstString(value: unknown): string | null {
    if (!Array.isArray(value)) return null;
    for (const entry of value) {
      const text = this.readString(entry);
      if (text) return text;
    }
    return null;
  }

  private readShopeePrice(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;

    if (typeof value === "string") {
      const trimmed = value.trim();
      const looksLikeDisplayPrice = /r\$|,|\.\d{2}\b|reais/i.test(trimmed);
      if (looksLikeDisplayPrice) {
        const parsedText = parsePrimaryPriceText(trimmed) ?? parsePriceText(trimmed);
        if (parsedText !== null) return parsedText;
      }
    }

    const numeric = typeof value === "number"
      ? value
      : Number(String(value).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) return null;

    const scaled = numeric >= 100000 ? numeric / 100000 : numeric >= 10000 ? numeric / 100 : numeric;
    const sanitized = sanitizePrice(scaled);
    return Number.isFinite(sanitized) && sanitized > 0 ? sanitized : null;
  }

  private readId(value: unknown): string | null {
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).replace(/[^\d]/g, "");
    return normalized || null;
  }

  private readString(value: unknown): string | null {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    return normalized || null;
  }

  private slugify(value: string): string {
    const slug = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || "produto";
  }
}
