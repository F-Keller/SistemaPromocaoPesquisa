import crypto from "node:crypto";
import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { nowIso, sanitizePrice, sleep } from "../../shared/utils";
import { AddressInput, MarketplaceProductCandidate, MarketplaceSearchAdapter } from "../types";
import { ScraperClient } from "../scraping/scraperClient";
import { detectCaptchaHtml } from "../scraping/parserUtils";
import {
  ScraperError,
  ScrapedProductDetails,
  ScraperFetchResult,
  SearchCandidateLink,
  StoreScraperExtractor,
} from "../scraping/types";

interface AdapterOptions {
  store: "amazon" | "mercadolivre" | "shopee";
  extractor: StoreScraperExtractor;
  config: AppConfig;
  logger: AppLogger;
}

const PRODUCT_HTTP_RETRY_ATTEMPTS = 1;
const PRODUCT_HTTP_RETRY_BACKOFF_MS = 350;

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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const safeLimit = Math.max(1, limit);
  const output = new Array<R>(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) return;
      output[index] = await worker(items[index]);
    }
  };

  const workers = Array.from({ length: Math.min(safeLimit, items.length) }, () => runWorker());
  await Promise.all(workers);

  return output;
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
    return withTimeout(
      this.scrapeStore(query, address),
      this.config.scraperTimeoutTotalMs,
      `Timeout total na loja ${this.store}`,
    );
  }

  private async scrapeStore(query: string, address: AddressInput): Promise<MarketplaceProductCandidate[]> {
    const searchUrl = this.extractor.buildSearchUrl(query);
    const searchHtml = await this.fetchSearchPage(searchUrl);
    let headlessAttemptsRemaining = Math.max(0, this.config.scraperMaxHeadlessAttemptsPerStore);

    const claimHeadlessAttempt = (): boolean => {
      if (headlessAttemptsRemaining <= 0) return false;
      headlessAttemptsRemaining -= 1;
      return true;
    };

    const candidateLinks = this.extractor
      .extractSearchCandidates(searchHtml, searchUrl)
      .filter((item) => item.url)
      .slice(0, this.config.searchMaxItemsPerStore);

    if (candidateLinks.length === 0) {
      throw new ScraperError("empty_result", `Nenhum candidato encontrado em ${this.store}.`, this.store);
    }

    const scraped = await mapWithConcurrency(
      candidateLinks,
      this.config.scraperProductConcurrency,
      async (candidate) => {
        try {
          return await this.scrapeProduct(candidate, address, claimHeadlessAttempt);
        } catch (error) {
          this.logger.debug(
            {
              store: this.store,
              productUrl: candidate.url,
              err: error,
            },
            "Falha nao tratada ao extrair produto; item sera ignorado.",
          );
          return null;
        }
      },
    );

    const results = scraped.filter((item): item is MarketplaceProductCandidate => item !== null);

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
    claimHeadlessAttempt: () => boolean,
  ): Promise<MarketplaceProductCandidate | null> {
    try {
      const http = await this.fetchProductHttpWithRetry(candidate.url);

      if (http.blocked) {
        throw new ScraperError(
          "blocked",
          `Acesso bloqueado ao buscar detalhe do produto ${candidate.url}`,
          this.store,
        );
      }

      const details = this.extractor.extractProductDetails(http.html, candidate.url, address);
      if (!details || !this.hasMinimumDetails(details)) {
        return null;
      }

      return this.toMarketplaceCandidate(candidate, details);
    } catch (error) {
      const headlessRecovered = await this.tryHeadlessRecovery(
        candidate,
        address,
        error,
        claimHeadlessAttempt,
      );

      if (headlessRecovered) return headlessRecovered;

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

  private async fetchProductHttpWithRetry(url: string): Promise<ScraperFetchResult> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= PRODUCT_HTTP_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await this.scraper.fetchHttp(url, this.config.scraperTimeoutHttpMs);
      } catch (error) {
        lastError = error;

        const isLastAttempt = attempt >= PRODUCT_HTTP_RETRY_ATTEMPTS;
        const isRetryable =
          error instanceof ScraperError &&
          (error.code === "timeout" || error.code === "network_error");

        if (!isRetryable || isLastAttempt) {
          throw error;
        }

        await sleep(PRODUCT_HTTP_RETRY_BACKOFF_MS);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Falha desconhecida ao buscar produto.");
  }

  private async tryHeadlessRecovery(
    candidate: SearchCandidateLink,
    address: AddressInput,
    error: unknown,
    claimHeadlessAttempt: () => boolean,
  ): Promise<MarketplaceProductCandidate | null> {
    if (!this.config.scraperUseHeadlessFallback) return null;
    if (!this.shouldUseHeadlessForError(error)) return null;
    if (!claimHeadlessAttempt()) return null;

    try {
      const headless = await this.scraper.fetchHeadless(
        candidate.url,
        this.config.scraperTimeoutHeadlessMs,
      );

      if (headless.blocked) return null;

      const details = this.extractor.extractProductDetails(headless.html, candidate.url, address);
      if (!details || !this.hasMinimumDetails(details)) return null;

      return this.toMarketplaceCandidate(candidate, details);
    } catch {
      return null;
    }
  }

  private shouldUseHeadlessForError(error: unknown): boolean {
    if (error instanceof ScraperError) {
      return (
        error.code === "timeout" ||
        error.code === "blocked" ||
        error.code === "network_error"
      );
    }

    return false;
  }

  private hasMinimumDetails(details: ScrapedProductDetails): boolean {
    return Boolean(
      details.title &&
      Number.isFinite(details.basePrice) &&
      Number(details.basePrice) > 0,
    );
  }

  private toMarketplaceCandidate(
    link: SearchCandidateLink,
    details: ScrapedProductDetails,
  ): MarketplaceProductCandidate {
    const basePrice = sanitizePrice(Number(details.basePrice ?? 0));
    const referencePrice = details.referencePrice ?? null;

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
}
