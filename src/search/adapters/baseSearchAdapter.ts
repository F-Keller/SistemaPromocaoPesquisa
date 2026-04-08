import crypto from "node:crypto";
import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { nowIso, sanitizePrice } from "../../shared/utils";
import { AddressInput, MarketplaceProductCandidate, MarketplaceSearchAdapter } from "../types";
import { ScraperClient } from "../scraping/scraperClient";
import { detectCaptchaHtml } from "../scraping/parserUtils";
import { ScraperError, ScrapedProductDetails, SearchCandidateLink, StoreScraperExtractor } from "../scraping/types";

interface AdapterOptions {
  store: "amazon" | "mercadolivre" | "shopee";
  extractor: StoreScraperExtractor;
  config: AppConfig;
  logger: AppLogger;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ScraperError("timeout", message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export abstract class BaseSearchAdapter implements MarketplaceSearchAdapter {
  readonly store: "amazon" | "mercadolivre" | "shopee";

  protected readonly extractor: StoreScraperExtractor;
  protected readonly config: AppConfig;
  protected readonly logger: AppLogger;
  protected scraper: ScraperClient;

  constructor(options: AdapterOptions) {
    this.store = options.store;
    this.extractor = options.extractor;
    this.config = options.config;
    this.logger = options.logger;
    this.scraper = new ScraperClient(options.config, options.logger);
  }

  async searchProducts(query: string, address: AddressInput): Promise<MarketplaceProductCandidate[]> {
    const runScrape = this.scrapeStore(query, address);

    try {
      return await withTimeout(
        runScrape,
        this.config.scraperTimeoutTotalMs,
        `Timeout total na loja ${this.store}`,
      );
    } catch (error) {
      if (this.config.enableMockSources) {
        this.logger.warn(
          {
            store: this.store,
            err: error,
          },
          "Scraping falhou; usando fallback mock por configuracao.",
        );
        return this.buildMockCandidates(query, address);
      }
      throw error;
    }
  }

  private async scrapeStore(query: string, address: AddressInput): Promise<MarketplaceProductCandidate[]> {
    const searchUrl = this.extractor.buildSearchUrl(query);
    const searchHtml = await this.fetchSearchPage(searchUrl);

    const candidateLinks = this.extractor
      .extractSearchCandidates(searchHtml, searchUrl)
      .filter((item) => item.url)
      .slice(0, this.config.searchMaxItemsPerStore);

    if (candidateLinks.length === 0) {
      throw new ScraperError("empty_result", `Nenhum candidato encontrado em ${this.store}.`, this.store);
    }

    const settled = await Promise.allSettled(
      candidateLinks.map((candidate) => this.scrapeProduct(candidate, address)),
    );

    const results = settled
      .filter((item): item is PromiseFulfilledResult<MarketplaceProductCandidate | null> => item.status === "fulfilled")
      .map((item) => item.value)
      .filter((item): item is MarketplaceProductCandidate => item !== null);

    if (results.length === 0) {
      throw new ScraperError("parse_error", `Falha ao parsear produtos da loja ${this.store}.`, this.store);
    }

    return this.dedupeByProductUrl(results);
  }

  private async fetchSearchPage(searchUrl: string): Promise<string> {
    const http = await this.scraper.fetchHttp(searchUrl, this.config.scraperTimeoutHttpMs);

    if (!http.blocked) {
      return http.html;
    }

    if (detectCaptchaHtml(http.html)) {
      throw new ScraperError("captcha", `CAPTCHA detectado na busca de ${this.store}.`, this.store);
    }

    if (!this.config.scraperUseHeadlessFallback) {
      throw new ScraperError("blocked", `Acesso bloqueado na busca de ${this.store}.`, this.store);
    }

    const headless = await this.scraper.fetchHeadless(searchUrl, this.config.scraperTimeoutHeadlessMs);
    if (headless.blocked) {
      throw new ScraperError("blocked", `Bloqueio persistente na busca de ${this.store}.`, this.store);
    }

    return headless.html;
  }

  private async scrapeProduct(
    candidate: SearchCandidateLink,
    address: AddressInput,
  ): Promise<MarketplaceProductCandidate | null> {
    const hintDetails = this.buildHintDetails(candidate);

    try {
      const http = await this.scraper.fetchHttp(candidate.url, this.config.scraperTimeoutHttpMs);
      let details = this.extractor.extractProductDetails(http.html, candidate.url, address);

      if (!details || !this.hasMinimumDetails(details)) {
        if (hintDetails) {
          return this.toMarketplaceCandidate(candidate, hintDetails);
        }

        if (this.config.scraperUseHeadlessFallback) {
          const headless = await this.scraper.fetchHeadless(candidate.url, this.config.scraperTimeoutHeadlessMs);
          details = this.extractor.extractProductDetails(headless.html, candidate.url, address);
        }
      }

      if (!details || !this.hasMinimumDetails(details)) {
        return hintDetails ? this.toMarketplaceCandidate(candidate, hintDetails) : null;
      }

      return this.toMarketplaceCandidate(candidate, details);
    } catch (error) {
      if (hintDetails) {
        return this.toMarketplaceCandidate(candidate, hintDetails);
      }

      this.logger.debug(
        {
          store: this.store,
          productUrl: candidate.url,
          err: error,
        },
        "Falha ao extrair produto individual; item sera ignorado.",
      );
      return null;
    }
  }

  private buildHintDetails(candidate: SearchCandidateLink): ScrapedProductDetails | null {
    if (!candidate.title || candidate.basePriceHint === null || candidate.basePriceHint === undefined) {
      return null;
    }

    return {
      title: candidate.title,
      basePrice: candidate.basePriceHint,
      referencePrice: candidate.referencePriceHint ?? null,
      coupons: [],
      shippingOptions: [],
      taxAmount: null,
      category: null,
      storeItemId: candidate.storeItemIdHint ?? null,
      sku: null,
      gtin: null,
      brand: null,
      model: null,
    };
  }

  private hasMinimumDetails(details: ScrapedProductDetails): boolean {
    return Boolean(details.title && Number.isFinite(details.basePrice));
  }

  private toMarketplaceCandidate(
    link: SearchCandidateLink,
    details: ScrapedProductDetails,
  ): MarketplaceProductCandidate {
    const basePrice = sanitizePrice(
      details.basePrice ?? link.basePriceHint ?? 0,
    );

    const referencePrice =
      details.referencePrice ??
      link.referencePriceHint ??
      null;

    const storeItemId =
      details.storeItemId ??
      link.storeItemIdHint ??
      this.hashStoreItem(link.url);

    return {
      store: this.store,
      storeItemId,
      title: String(details.title ?? link.title ?? "Produto sem titulo"),
      category: details.category ?? null,
      productUrl: link.url,
      affiliateUrl: link.url,
      basePrice,
      referencePrice: referencePrice === null ? null : sanitizePrice(referencePrice),
      sku: details.sku ?? null,
      gtin: details.gtin ?? null,
      brand: details.brand ?? null,
      model: details.model ?? null,
      coupons: details.coupons ?? [],
      shippingOptions: details.shippingOptions ?? [],
      taxAmount: details.taxAmount ?? null,
      capturedAt: nowIso(),
    };
  }

  private hashStoreItem(url: string): string {
    return crypto.createHash("sha1").update(`${this.store}|${url}`).digest("hex").slice(0, 16);
  }

  private dedupeByProductUrl(candidates: MarketplaceProductCandidate[]): MarketplaceProductCandidate[] {
    const unique = new Map<string, MarketplaceProductCandidate>();

    for (const candidate of candidates) {
      if (!unique.has(candidate.productUrl)) {
        unique.set(candidate.productUrl, candidate);
      }
    }

    return [...unique.values()];
  }

  private buildMockCandidates(query: string, address: AddressInput): MarketplaceProductCandidate[] {
    const normalizedQuery = query.trim();
    const zipPrefix = address.zipCode.replace(/\D/g, "").slice(0, 5) || "00000";

    return Array.from({ length: this.config.searchMaxItemsPerStore }).map((_, index) => {
      const seed = crypto
        .createHash("sha1")
        .update(`${this.store}|${normalizedQuery}|${zipPrefix}|${index}`)
        .digest("hex");

      const priceBase = Number.parseInt(seed.slice(0, 4), 16);
      const current = sanitizePrice(120 + (priceBase % 2000));
      const reference = sanitizePrice(current * 1.2);

      return {
        store: this.store,
        storeItemId: `${this.store}-${seed.slice(0, 10)}`,
        title: `${normalizedQuery} ${this.store.toUpperCase()} ${index + 1}`,
        category: "marketplace",
        productUrl: `${this.extractor.buildSearchUrl(query)}#item-${index + 1}`,
        affiliateUrl: `${this.extractor.buildSearchUrl(query)}#item-${index + 1}`,
        basePrice: current,
        referencePrice: reference,
        sku: null,
        gtin: null,
        brand: this.store.toUpperCase(),
        model: null,
        coupons: [],
        shippingOptions: [],
        taxAmount: null,
        capturedAt: nowIso(),
      };
    });
  }
}