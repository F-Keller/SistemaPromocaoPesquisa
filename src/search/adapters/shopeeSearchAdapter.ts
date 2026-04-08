import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { createShopeeExtractor } from "../scraping/extractors/shopeeExtractor";
import { BaseSearchAdapter } from "./baseSearchAdapter";

export class ShopeeSearchAdapter extends BaseSearchAdapter {
  constructor(config: AppConfig, logger: AppLogger) {
    super({
      store: "shopee",
      extractor: createShopeeExtractor(config.store.shopee.searchUrlTemplate),
      config,
      logger,
    });
  }
}