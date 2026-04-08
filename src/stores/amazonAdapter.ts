import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { DealCandidate, StoreAdapter } from "../shared/types";
import { appendQuery } from "./helpers";
import { BaseAdapter } from "./baseAdapter";

export class AmazonAdapter extends BaseAdapter implements StoreAdapter {
  readonly store = "amazon" as const;

  private readonly affiliateTag: string;

  constructor(config: AppConfig, logger: AppLogger) {
    super({
      storeName: "amazon",
      feedUrl: config.store.amazon.feedUrl,
      apiKey: config.store.amazon.apiKey,
      enableMock: config.enableMockSources,
      logger,
    });
    this.affiliateTag = config.store.amazon.affiliateTag;
  }

  async collectDeals(): Promise<DealCandidate[]> {
    return this.collectFromFeed();
  }

  async buildAffiliateLink(productUrl: string): Promise<string> {
    if (!this.affiliateTag) return productUrl;
    return appendQuery(productUrl, "tag", this.affiliateTag);
  }
}
