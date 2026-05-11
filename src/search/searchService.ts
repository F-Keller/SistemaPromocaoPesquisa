import crypto from "node:crypto";
import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { CachedSearchPayload, SearchRepository } from "../db/searchRepository";
import { nowIso } from "../shared/utils";
import { AffiliateService } from "./affiliateService";
import { isSuspiciousMarketplacePrice } from "./priceGuards";
import { ScraperError, ScraperErrorCode } from "./scraping/types";
import { MatchInfo, scoreCandidate, selectMatchingPool } from "./matching";
import { rankResults } from "./ranking";
import {
  MarketplaceProductCandidate,
  MarketplaceSearchAdapter,
  MarketplaceName,
  RankedSearchResult,
  SearchAudit,
  SearchInput,
  SearchSnapshot,
} from "./types";

const makeEmptyAudit = (): SearchAudit => ({
  totalCandidates: 0,
  matchedCandidates: 0,
  enrichedCandidates: 0,
  completeCandidates: 0,
  incompleteCandidates: 0,
  stores: [],
});

interface InFlightSnapshot {
  results: RankedSearchResult[];
  audit: SearchAudit;
}

interface StoreSearchResult {
  store: MarketplaceSearchAdapter["store"];
  candidates: MarketplaceProductCandidate[];
  errors: string[];
}

interface CreateSearchOptions {
  forceRefresh?: boolean;
}

const normalizeQuery = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeZipCode = (value: string) => value.replace(/\D/g, "");
const isValidPrice = (value: number) => Number.isFinite(value) && Number(value) > 0;
const PUBLIC_ANALYZING_MESSAGE = "Analisando ofertas...";
const PUBLIC_STORE_ERROR_MESSAGE = "Falha tecnica ao consultar loja.";

const DEV_STORE_ERROR_MESSAGES: Record<ScraperErrorCode, string> = {
  blocked: "Scraping bloqueado pela loja.",
  captcha: "Captcha detectado pela loja.",
  empty_result: "Nenhum card de produto encontrado.",
  headless_error: "Browser stealth indisponivel.",
  network_error: "Falha de rede ao consultar a loja.",
  parse_error: "Cards encontrados, mas nenhum produto foi validado.",
  timeout: "Tempo esgotado ao consultar a loja.",
};
const DEV_SHOPEE_CAPTCHA_MESSAGE =
  "Shopee bloqueada por captcha. Configure PROXY_URL ou SHOPEE_FEED_URL para estabilidade.";

const EXPECTED_SCRAPER_ERROR_CODES = new Set<ScraperErrorCode>([
  "blocked",
  "captcha",
  "empty_result",
  "headless_error",
  "network_error",
  "parse_error",
  "timeout",
]);
const DEV_VALIDATION_FILTER_MESSAGE = "Produtos coletados foram descartados por preco suspeito ou dados incompletos.";
const DEV_MATCHING_FILTER_MESSAGE = "Produtos coletados foram reinseridos por balanceamento de lojas.";
const SAFE_DEV_STORE_ERROR_MESSAGES = new Set([
  ...Object.values(DEV_STORE_ERROR_MESSAGES),
  DEV_SHOPEE_CAPTCHA_MESSAGE,
  DEV_VALIDATION_FILTER_MESSAGE,
  DEV_MATCHING_FILTER_MESSAGE,
]);

const TECHNICAL_ERROR_PATTERNS = [
  /playwright/i,
  /page\.goto/i,
  /timeout(?:error)?/i,
  /browsercontext/i,
  /locator/i,
  /target page/i,
  /net::/i,
  /chromium/i,
  /request blocked/i,
  /blocked/i,
  /captcha/i,
];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Erro desconhecido.";
};

const hasTechnicalFingerprint = (message: string): boolean =>
  TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));

const sanitizeLogMessage = (error: unknown): string => {
  const message = getErrorMessage(error).replace(/\s+/g, " ").trim();
  if (!message) return "Erro desconhecido.";
  if (hasTechnicalFingerprint(message)) return PUBLIC_ANALYZING_MESSAGE;
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
};

const hashCacheKey = (query: string, zipCode: string, cacheVersion: string): string =>
  crypto
    .createHash("sha256")
    .update(`${cacheVersion}|${normalizeQuery(query)}|${normalizeZipCode(zipCode)}`)
    .digest("hex");

export class SearchService {
  private readonly inFlight = new Map<string, InFlightSnapshot>();
  private readonly running = new Set<string>();
  private readonly affiliateService: AffiliateService;

  constructor(
    private readonly config: AppConfig,
    private readonly repository: SearchRepository,
    private readonly adapters: MarketplaceSearchAdapter[],
    private readonly logger: AppLogger,
  ) {
    this.affiliateService = new AffiliateService(config);
  }

  createSearch(input: SearchInput, options: CreateSearchOptions = {}): string {
    const searchId = this.repository.createSearch(input.query, this.config.searchTtlMinutes);
    this.repository.cleanupExpiredSearches();

    this.inFlight.set(searchId, {
      results: [],
      audit: makeEmptyAudit(),
    });

    setImmediate(() => {
      this.processSearch(searchId, input, options).catch((error) => {
        this.logger.error(
          { searchId, message: sanitizeLogMessage(error) },
          "Falha nao tratada na busca.",
        );
      });
    });

    return searchId;
  }

  getSearch(searchId: string): SearchSnapshot | null {
    const persisted = this.repository.getSearchSnapshot(searchId);
    if (!persisted) return null;

    const runtime = this.inFlight.get(searchId);
    if (!runtime) return this.toPublicSnapshot(persisted);

    if (persisted.status === "running" || persisted.status === "queued") {
      return this.toPublicSnapshot({
        ...persisted,
        audit: runtime.audit,
        results: runtime.results,
      });
    }

    return this.toPublicSnapshot(persisted);
  }

  getHealth() {
    return {
      runningSearches: this.running.size,
      adapters: this.adapters.map((adapter) => adapter.store),
      scraperMode: this.config.scraperDefaultMode,
      cacheTtlMinutes: this.config.scraperCacheTtlMinutes,
      cacheVersion: this.config.searchCacheVersion,
    };
  }

  cleanupExpired(): number {
    const deleted = this.repository.cleanupExpiredSearches();

    if (deleted > 0) {
      const existing = new Set([
        ...this.running.values(),
        ...Array.from(this.inFlight.keys()),
      ]);

      for (const searchId of existing) {
        const snapshot = this.repository.getSearchSnapshot(searchId);
        if (!snapshot) {
          this.running.delete(searchId);
          this.inFlight.delete(searchId);
        }
      }
    }

    return deleted;
  }

  private async processSearch(
    searchId: string,
    input: SearchInput,
    options: CreateSearchOptions = {},
  ): Promise<void> {
    this.running.add(searchId);

    const startedAt = nowIso();
    this.repository.updateSearch(searchId, {
      status: "running",
      stage: "collecting",
      progressPercent: 10,
      startedAt,
      errorMessage: null,
      audit: makeEmptyAudit(),
    });

    try {
      const cacheKey = hashCacheKey(input.query, input.address.zipCode, this.config.searchCacheVersion);
      const forceRefresh = options.forceRefresh === true;
      if (forceRefresh) {
        this.repository.deleteCachedSearch(cacheKey);
      }

      const cached = forceRefresh ? null : this.repository.getCachedSearch(cacheKey);

      if (
        cached &&
        cached.results.length > 0 &&
        cached.results.every((item) => this.isValidRankedResult(item, input.query)) &&
        this.hasRequiredStoreCoverage(cached.results)
      ) {
        this.finishFromCache(searchId, cached);
        return;
      }

      const storeResults = await Promise.all(
        this.adapters.map((adapter) => this.runStoreSearch(adapter, input)),
      );

      const collected: MarketplaceProductCandidate[] = [];
      const storeAudit: SearchAudit["stores"] = [];

      for (const result of storeResults) {
        const verifiedCandidates = result.candidates.filter((candidate) => {
          const isVerified = this.isVerifiedCandidate(candidate, input.query);
          if (!isVerified && this.isSuspiciousCandidatePrice(candidate, input.query)) {
            this.logger.debug(
              {
                store: candidate.store,
                storeItemId: candidate.storeItemId,
                reason: "suspicious_price",
              },
              "Candidato descartado por preco suspeito.",
            );
          }

          return isVerified;
        });

        this.logger.debug(
          {
            store: result.store,
            collected: result.candidates.length,
            verified: verifiedCandidates.length,
          },
          "Candidatos coletados e validados por loja.",
        );

        const errors = [...result.errors];
        if (
          this.config.nodeEnv === "development" &&
          result.candidates.length > 0 &&
          verifiedCandidates.length === 0
        ) {
          errors.push(DEV_VALIDATION_FILTER_MESSAGE);
        }

        collected.push(...verifiedCandidates);
        storeAudit.push({
          store: result.store,
          fetched: verifiedCandidates.length,
          errors,
        });
      }

      const baseAudit: SearchAudit = {
        ...makeEmptyAudit(),
        totalCandidates: collected.length,
        stores: storeAudit,
      };
      this.updateInFlight(searchId, baseAudit, []);

      this.repository.updateSearch(searchId, {
        stage: "matching",
        progressPercent: 45,
        audit: baseAudit,
      });

      const matched = selectMatchingPool(input.query, collected);
      const balancedMatched = this.balanceRequiredStoreMatches(input.query, collected, matched);
      this.annotateStoresFilteredByMatching(storeAudit, matched, balancedMatched);

      const afterMatchAudit: SearchAudit = {
        ...baseAudit,
        stores: storeAudit,
        matchedCandidates: balancedMatched.length,
      };
      this.updateInFlight(searchId, afterMatchAudit, []);

      this.repository.updateSearch(searchId, {
        stage: "enriching",
        progressPercent: 70,
        audit: afterMatchAudit,
      });

      const enriched = balancedMatched.map((candidate) => ({
        ...candidate,
        affiliateUrl: this.affiliateService.buildAffiliateUrl(candidate.store, candidate.productUrl),
      }));

      const ranked = rankResults(
        enriched,
        this.config.searchMaxResults,
        this.config.searchMaxResultsPerStore,
      );
      const completeCandidates = ranked.length;
      const incompleteCandidates = 0;

      const finalAudit: SearchAudit = {
        ...afterMatchAudit,
        enrichedCandidates: ranked.length,
        completeCandidates,
        incompleteCandidates,
      };
      this.updateInFlight(searchId, finalAudit, ranked);

      this.repository.updateSearch(searchId, {
        stage: "ranking",
        progressPercent: 90,
        audit: finalAudit,
      });

      this.repository.replaceSearchResults(searchId, ranked);
      if (ranked.length > 0 && this.hasRequiredStoreCoverage(ranked)) {
        this.repository.upsertCachedSearch(
          cacheKey,
          {
            createdAt: nowIso(),
            audit: finalAudit,
            results: ranked,
          },
          this.config.scraperCacheTtlMinutes,
        );
      }

      this.repository.updateSearch(searchId, {
        status: "completed",
        stage: "completed",
        progressPercent: 100,
        completedAt: nowIso(),
        audit: finalAudit,
      });
    } catch (error) {
      const message = this.toPublicErrorMessage(getErrorMessage(error), false) ?? PUBLIC_ANALYZING_MESSAGE;
      this.repository.updateSearch(searchId, {
        status: "failed",
        stage: "failed",
        progressPercent: 100,
        errorMessage: message,
        completedAt: nowIso(),
      });
      this.logger.error(
        { searchId, message: sanitizeLogMessage(error) },
        "Busca finalizada com falha.",
      );
    } finally {
      this.running.delete(searchId);
      this.inFlight.delete(searchId);
    }
  }

  private finishFromCache(searchId: string, payload: CachedSearchPayload): void {
    this.updateInFlight(searchId, payload.audit, payload.results);
    this.repository.replaceSearchResults(searchId, payload.results);

    this.repository.updateSearch(searchId, {
      stage: "ranking",
      progressPercent: 95,
      audit: payload.audit,
    });

    this.repository.updateSearch(searchId, {
      status: "completed",
      stage: "completed",
      progressPercent: 100,
      completedAt: nowIso(),
      audit: payload.audit,
    });
  }

  private async runStoreSearch(
    adapter: MarketplaceSearchAdapter,
    input: SearchInput,
  ): Promise<StoreSearchResult> {
    try {
      const candidates = await adapter.searchProducts(input.query, input.address);
      return {
        store: adapter.store,
        candidates,
        errors: [],
      };
    } catch (error) {
      const code = error instanceof ScraperError ? error.code : "parse_error";
      const isScraperError = error instanceof ScraperError;
      const isExpectedScraperFailure =
        (isScraperError && EXPECTED_SCRAPER_ERROR_CODES.has(code)) ||
        hasTechnicalFingerprint(getErrorMessage(error));

      if (isExpectedScraperFailure) {
        this.logger.debug(
          {
            store: adapter.store,
            code,
          },
          "Scraping da loja indisponivel; seguindo com as demais.",
        );

        return {
          store: adapter.store,
          candidates: [],
          errors: this.config.nodeEnv === "development"
            ? [this.toDevStoreErrorMessage(adapter.store, code, isScraperError)]
            : [],
        };
      }

      this.logger.warn(
        {
          store: adapter.store,
          code,
          message: sanitizeLogMessage(error),
        },
        "Falha no scraping da loja; seguindo com as demais.",
      );

      return {
        store: adapter.store,
        candidates: [],
        errors: [code, PUBLIC_STORE_ERROR_MESSAGE],
      };
    }
  }

  private updateInFlight(searchId: string, audit: SearchAudit, results: RankedSearchResult[]) {
    this.inFlight.set(searchId, {
      audit,
      results,
    });
  }

  private balanceRequiredStoreMatches(
    query: string,
    collected: MarketplaceProductCandidate[],
    matched: Array<MarketplaceProductCandidate & MatchInfo>,
  ): Array<MarketplaceProductCandidate & MatchInfo> {
    const balanced = [...matched];
    const seenProductUrls = new Set(balanced.map((item) => item.productUrl));

    for (const store of this.requiredStores()) {
      const storeCandidates = collected
        .filter((candidate) => candidate.store === store)
        .map((candidate) => ({
          candidate,
          match: scoreCandidate(query, candidate),
        }))
        .sort((a, b) => {
          const aScore = a.match?.matchScore ?? 0;
          const bScore = b.match?.matchScore ?? 0;
          if (aScore !== bScore) return bScore - aScore;
          return a.candidate.basePrice - b.candidate.basePrice;
        });

      const targetCount = Math.min(this.config.searchMaxResultsPerStore, storeCandidates.length);
      let currentCount = balanced.filter((item) => item.store === store).length;

      for (const { candidate, match } of storeCandidates) {
        if (currentCount >= targetCount) break;
        if (seenProductUrls.has(candidate.productUrl)) continue;

        balanced.push({
          ...candidate,
          matchType: match?.matchType ?? "similar",
          matchScore: match?.matchScore ?? 0.01,
        });
        seenProductUrls.add(candidate.productUrl);
        currentCount += 1;
      }
    }

    this.logger.debug(
      {
        collected: this.countByStore(collected),
        matched: this.countByStore(matched),
        balanced: this.countByStore(balanced),
      },
      "Candidatos por loja apos matching.",
    );

    return balanced;
  }

  private annotateStoresFilteredByMatching(
    storeAudit: SearchAudit["stores"],
    matched: Array<MarketplaceProductCandidate & MatchInfo>,
    balanced: Array<MarketplaceProductCandidate & MatchInfo>,
  ): void {
    if (this.config.nodeEnv !== "development") return;

    const matchedCount = this.countByStore(matched);
    const balancedCount = this.countByStore(balanced);

    for (const store of storeAudit) {
      if (store.fetched <= 0) continue;
      if ((matchedCount[store.store] ?? 0) > 0) continue;
      if ((balancedCount[store.store] ?? 0) <= 0) continue;
      store.errors.push(DEV_MATCHING_FILTER_MESSAGE);
    }
  }

  private countByStore(items: Array<{ store: MarketplaceName }>): Partial<Record<MarketplaceName, number>> {
    return items.reduce<Partial<Record<MarketplaceName, number>>>((acc, item) => {
      acc[item.store] = (acc[item.store] ?? 0) + 1;
      return acc;
    }, {});
  }

  private hasRequiredStoreCoverage(results: Array<{ store: MarketplaceName }>): boolean {
    const presentStores = new Set(results.map((item) => item.store));
    return this.requiredStores().every((store) => presentStores.has(store));
  }

  private requiredStores(): MarketplaceName[] {
    const enabledStores = new Set(this.adapters.map((adapter) => adapter.store));
    return (["amazon", "mercadolivre", "shopee"] as MarketplaceName[]).filter((store) => enabledStores.has(store));
  }

  private isVerifiedCandidate(candidate: MarketplaceProductCandidate, query: string): boolean {
    const hasRequiredFields = Boolean(
      candidate.title &&
      candidate.title.trim().length > 0 &&
      candidate.productUrl &&
      candidate.affiliateUrl &&
      isValidPrice(candidate.basePrice),
    );

    return hasRequiredFields && !this.isSuspiciousCandidatePrice(candidate, query);
  }

  private isValidRankedResult(result: RankedSearchResult, query: string): boolean {
    const hasRequiredFields = Boolean(
      result.store &&
      result.storeItemId &&
      result.title &&
      result.productUrl &&
      result.affiliateUrl &&
      isValidPrice(result.verifiedPrice),
    );

    return hasRequiredFields && !this.isSuspiciousCandidatePrice(
      {
        store: result.store,
        storeItemId: result.storeItemId,
        title: result.title,
        category: null,
        imageUrl: result.imageUrl,
        productUrl: result.productUrl,
        affiliateUrl: result.affiliateUrl,
        basePrice: result.verifiedPrice,
        referencePrice: null,
        sku: null,
        gtin: null,
        brand: null,
        model: null,
        coupons: [],
        shippingOptions: [],
        taxAmount: null,
        capturedAt: nowIso(),
      },
      query,
    );
  }

  private isSuspiciousCandidatePrice(candidate: MarketplaceProductCandidate, query: string): boolean {
    return isSuspiciousMarketplacePrice({
      store: candidate.store,
      price: candidate.basePrice,
      query,
      title: candidate.title,
    });
  }

  private toPublicSnapshot(snapshot: SearchSnapshot): SearchSnapshot {
    return {
      ...snapshot,
      errorMessage: this.toPublicErrorMessage(
        snapshot.errorMessage,
        snapshot.status === "queued" || snapshot.status === "running",
      ),
      audit: {
        ...snapshot.audit,
        stores: snapshot.audit.stores.map((store) => ({
          ...store,
          errors: this.toPublicStoreErrors(Array.isArray(store.errors) ? store.errors : []),
        })),
      },
    };
  }

  private toPublicErrorMessage(message: string | null, isActive: boolean): string | null {
    if (isActive) return PUBLIC_ANALYZING_MESSAGE;
    if (!message) return null;
    if (hasTechnicalFingerprint(message)) return PUBLIC_ANALYZING_MESSAGE;
    return "Nao foi possivel concluir a analise de ofertas.";
  }

  private toPublicStoreErrors(errors: string[]): string[] {
    const publicErrors = errors.flatMap((error) => {
      if (!error) return [];
      if (SAFE_DEV_STORE_ERROR_MESSAGES.has(error)) {
        return this.config.nodeEnv === "development" ? [error] : [];
      }
      if (EXPECTED_SCRAPER_ERROR_CODES.has(error as ScraperErrorCode)) return [];
      if (hasTechnicalFingerprint(error)) return [];
      return [PUBLIC_STORE_ERROR_MESSAGE];
    });

    return Array.from(new Set(publicErrors));
  }

  private toDevStoreErrorMessage(
    store: MarketplaceName,
    code: ScraperErrorCode,
    isScraperError: boolean,
  ): string {
    if (!isScraperError && code === "parse_error") return PUBLIC_STORE_ERROR_MESSAGE;
    if (store === "shopee" && code === "captcha") return DEV_SHOPEE_CAPTCHA_MESSAGE;
    return DEV_STORE_ERROR_MESSAGES[code];
  }
}
