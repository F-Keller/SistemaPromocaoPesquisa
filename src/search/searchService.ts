import crypto from "node:crypto";
import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { CachedSearchPayload, SearchRepository } from "../db/searchRepository";
import { nowIso } from "../shared/utils";
import { ScraperError } from "./scraping/types";
import { selectMatchingPool } from "./matching";
import { rankResults } from "./ranking";
import {
  MarketplaceProductCandidate,
  MarketplaceSearchAdapter,
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

const normalizeQuery = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeZipCode = (value: string) => value.replace(/\D/g, "");
const isValidPrice = (value: number) => Number.isFinite(value) && Number(value) > 0;

const hashCacheKey = (query: string, zipCode: string, cacheVersion: string): string =>
  crypto
    .createHash("sha256")
    .update(`${cacheVersion}|${normalizeQuery(query)}|${normalizeZipCode(zipCode)}`)
    .digest("hex");

export class SearchService {
  private readonly inFlight = new Map<string, InFlightSnapshot>();
  private readonly running = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly repository: SearchRepository,
    private readonly adapters: MarketplaceSearchAdapter[],
    private readonly logger: AppLogger,
  ) {}

  createSearch(input: SearchInput): string {
    const searchId = this.repository.createSearch(input.query, this.config.searchTtlMinutes);
    this.repository.cleanupExpiredSearches();

    this.inFlight.set(searchId, {
      results: [],
      audit: makeEmptyAudit(),
    });

    setImmediate(() => {
      this.processSearch(searchId, input).catch((error) => {
        this.logger.error({ searchId, err: error }, "Falha nao tratada na busca.");
      });
    });

    return searchId;
  }

  getSearch(searchId: string): SearchSnapshot | null {
    const persisted = this.repository.getSearchSnapshot(searchId);
    if (!persisted) return null;

    const runtime = this.inFlight.get(searchId);
    if (!runtime) return persisted;

    if (persisted.status === "running" || persisted.status === "queued") {
      return {
        ...persisted,
        audit: runtime.audit,
        results: runtime.results,
      };
    }

    return persisted;
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

  private async processSearch(searchId: string, input: SearchInput): Promise<void> {
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
      const cached = this.repository.getCachedSearch(cacheKey);

      if (cached && cached.results.length > 0 && cached.results.every((item) => this.isValidRankedResult(item))) {
        this.finishFromCache(searchId, cached);
        return;
      }

      const storeResults = await Promise.all(
        this.adapters.map((adapter) => this.runStoreSearch(adapter, input)),
      );

      const collected: MarketplaceProductCandidate[] = [];
      const storeAudit: SearchAudit["stores"] = [];

      for (const result of storeResults) {
        const verifiedCandidates = result.candidates.filter((candidate) => this.isVerifiedCandidate(candidate));
        collected.push(...verifiedCandidates);
        storeAudit.push({
          store: result.store,
          fetched: verifiedCandidates.length,
          errors: result.errors,
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
      const afterMatchAudit: SearchAudit = {
        ...baseAudit,
        matchedCandidates: matched.length,
      };
      this.updateInFlight(searchId, afterMatchAudit, []);

      this.repository.updateSearch(searchId, {
        stage: "enriching",
        progressPercent: 70,
        audit: afterMatchAudit,
      });

      const ranked = rankResults(matched, this.config.searchMaxResults);
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
      if (ranked.length > 0) {
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
      const message = (error as Error).message;
      this.repository.updateSearch(searchId, {
        status: "failed",
        stage: "failed",
        progressPercent: 100,
        errorMessage: message,
        completedAt: nowIso(),
      });
      this.logger.error({ searchId, err: error }, "Busca finalizada com falha.");
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
      const detail = error instanceof ScraperError ? error.message : (error as Error).message;

      this.logger.warn(
        {
          store: adapter.store,
          code,
          err: error,
        },
        "Falha no scraping da loja; seguindo com as demais.",
      );

      return {
        store: adapter.store,
        candidates: [],
        errors: [code, detail],
      };
    }
  }

  private updateInFlight(searchId: string, audit: SearchAudit, results: RankedSearchResult[]) {
    this.inFlight.set(searchId, {
      audit,
      results,
    });
  }

  private isVerifiedCandidate(candidate: MarketplaceProductCandidate): boolean {
    return Boolean(
      candidate.title &&
      candidate.title.trim().length > 0 &&
      candidate.productUrl &&
      candidate.affiliateUrl &&
      isValidPrice(candidate.basePrice),
    );
  }

  private isValidRankedResult(result: RankedSearchResult): boolean {
    return Boolean(
      result.store &&
      result.storeItemId &&
      result.title &&
      result.productUrl &&
      result.affiliateUrl &&
      isValidPrice(result.verifiedPrice),
    );
  }
}
