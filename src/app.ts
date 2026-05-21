import type { Express } from "express";
import { createServer } from "./api/createServer";
import { AppConfig, loadConfig } from "./config/env";
import { AppLogger, createLogger } from "./config/logger";
import { SearchRepository } from "./db/searchRepository";
import { startSearchCleanupJob } from "./jobs/searchCleanupJob";
import { AmazonSearchAdapter } from "./search/adapters/amazonSearchAdapter";
import { MercadoLivreSearchAdapter } from "./search/adapters/mercadoLivreSearchAdapter";
import { ShopeeSearchAdapter } from "./search/adapters/shopeeSearchAdapter";
import { SearchService } from "./search/searchService";
import { closeStealthBrowser } from "./search/scraping/stealthBrowser";
import type { MarketplaceSearchAdapter } from "./search/types";

interface AppRuntimeOptions {
  startCleanupJob?: boolean;
}

interface CleanupJob {
  stop: () => void;
}

export interface AppRuntime {
  app: Express;
  config: AppConfig;
  logger: AppLogger;
  repository: SearchRepository;
  searchService: SearchService;
  cleanupJob: CleanupJob | null;
  close: () => Promise<void>;
}

export function createAppRuntime(options: AppRuntimeOptions = {}): AppRuntime {
  const config = loadConfig();
  const logger = createLogger(config);

  const repository = new SearchRepository(config.databasePath);
  repository.init();

  const adapters: MarketplaceSearchAdapter[] = [
    new AmazonSearchAdapter(config, logger),
    new MercadoLivreSearchAdapter(config, logger),
  ];

  if (config.enableShopeeSearch) {
    adapters.push(new ShopeeSearchAdapter(config, logger));
  }

  const searchService = new SearchService(config, repository, adapters, logger);
  const shouldStartCleanupJob = options.startCleanupJob ?? true;
  const cleanupJob = shouldStartCleanupJob
    ? startSearchCleanupJob(config, logger, searchService)
    : null;

  const app = createServer({
    config,
    logger,
    searchService,
  });

  return {
    app,
    config,
    logger,
    repository,
    searchService,
    cleanupJob,
    close: async () => {
      cleanupJob?.stop();

      await closeStealthBrowser().catch((error) => {
        logger.warn({ err: error }, "Falha ao encerrar stealth browser.");
      });

      repository.close();
    },
  };
}
