import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { DealCandidate, StoreAdapter } from "../shared/types";
import { appendQuery } from "./helpers";
import { BaseAdapter } from "./baseAdapter";

export class ShopeeAdapter extends BaseAdapter implements StoreAdapter {
  readonly store = "shopee" as const;

  private readonly affiliateId: string;

  constructor(config: AppConfig, logger: AppLogger) {
    super({
      storeName: "shopee",
      feedUrl: config.store.shopee.feedUrl,
      apiKey: config.store.shopee.apiKey,
      enableMock: config.enableMockSources,
      logger,
    });
    this.affiliateId = config.store.shopee.affiliateId;
  }

  async collectDeals(): Promise<DealCandidate[]> {
    return this.collectFromFeed();
  }

  async buildAffiliateLink(productUrl: string): Promise<string> {
    if (!this.affiliateId) return productUrl;
    return appendQuery(productUrl, "af_siteid", this.affiliateId);
  }
}
