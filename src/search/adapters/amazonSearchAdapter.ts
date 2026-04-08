import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { createAmazonExtractor } from "../scraping/extractors/amazonExtractor";
import { BaseSearchAdapter } from "./baseSearchAdapter";

export class AmazonSearchAdapter extends BaseSearchAdapter {
  constructor(config: AppConfig, logger: AppLogger) {
    super({
      store: "amazon",
      extractor: createAmazonExtractor(config.store.amazon.searchUrlTemplate),
      config,
      logger,
    });
  }
}