import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { createMercadoLivreExtractor } from "../scraping/extractors/mercadoLivreExtractor";
import { BaseSearchAdapter } from "./baseSearchAdapter";

export class MercadoLivreSearchAdapter extends BaseSearchAdapter {
  constructor(config: AppConfig, logger: AppLogger) {
    super({
      store: "mercadolivre",
      extractor: createMercadoLivreExtractor(config.store.mercadolivre.searchUrlTemplate),
      config,
      logger,
    });
  }
}