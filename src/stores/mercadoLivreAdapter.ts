import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { DealCandidate, StoreAdapter } from "../shared/types";
import { appendQuery } from "./helpers";
import { BaseAdapter } from "./baseAdapter";

export class MercadoLivreAdapter extends BaseAdapter implements StoreAdapter {
  readonly store = "mercadolivre" as const;

  private readonly affiliateId: string;

  constructor(config: AppConfig, logger: AppLogger) {
    super({
      storeName: "mercadolivre",
      feedUrl: config.store.mercadolivre.feedUrl,
      apiKey: config.store.mercadolivre.apiKey,
      enableMock: config.enableMockSources,
      logger,
    });
    this.affiliateId = config.store.mercadolivre.affiliateId;
  }

  async collectDeals(): Promise<DealCandidate[]> {
    return this.collectFromFeed();
  }

  async buildAffiliateLink(productUrl: string): Promise<string> {
    if (!this.affiliateId) return productUrl;
    return appendQuery(productUrl, "matt_tool", this.affiliateId);
  }
}
