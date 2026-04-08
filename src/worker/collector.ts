import { randomUUID } from "node:crypto";
import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { AppRepository } from "../db/repository";
import { calculateDealScore } from "../shared/scoring";
import { DealCandidate, StoreAdapter } from "../shared/types";
import { buildDedupHash, computeDiscountPercent, nowIso, sanitizePrice } from "../shared/utils";

export class DealCollector {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: AppRepository,
    private readonly adapters: StoreAdapter[],
    private readonly logger: AppLogger,
  ) {}

  async runOnce(): Promise<void> {
    this.logger.info("Iniciando ciclo de coleta de ofertas.");

    for (const adapter of this.adapters) {
      try {
        const candidates = await adapter.collectDeals();
        let inserted = 0;

        for (const candidate of candidates) {
          const normalized = await this.normalizeCandidate(adapter, candidate);
          this.repository.upsertPriceHistory(
            normalized.store,
            normalized.storeItemId,
            normalized.currentPrice,
            normalized.capturedAt,
          );
          const wasInserted = this.repository.insertDeal(normalized);
          if (wasInserted) inserted += 1;
        }

        this.logger.info(
          {
            store: adapter.store,
            fetched: candidates.length,
            inserted,
          },
          "Coleta finalizada para loja.",
        );
      } catch (error) {
        this.logger.error({ err: error, store: adapter.store }, "Erro na coleta de ofertas.");
        this.repository.addAlert(
          "collector_error",
          `Falha na coleta da loja ${adapter.store}: ${String((error as Error).message)}`,
          "error",
        );
      }
    }
  }

  private async normalizeCandidate(adapter: StoreAdapter, candidate: DealCandidate) {
    const currentPrice = sanitizePrice(candidate.currentPrice);
    const referencePrice = candidate.referencePrice ? sanitizePrice(candidate.referencePrice) : null;

    const historicalAverage = this.repository.getHistoricalAverage(adapter.store, candidate.storeItemId);
    const discountPercent = computeDiscountPercent(currentPrice, referencePrice);

    const score = calculateDealScore({
      currentPrice,
      referencePrice,
      historicalAverage,
      discountPercent,
    });

    return {
      id: randomUUID(),
      store: adapter.store,
      storeItemId: candidate.storeItemId,
      title: candidate.title,
      currentPrice,
      referencePrice,
      productUrl: candidate.productUrl,
      affiliateUrl: await adapter.buildAffiliateLink(candidate.productUrl, candidate.storeItemId),
      category: candidate.category ?? null,
      capturedAt: candidate.capturedAt || nowIso(),
      discountPercent,
      score,
      dedupHash: buildDedupHash(adapter.store, candidate.storeItemId, currentPrice),
      status: "pending" as const,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }
}
