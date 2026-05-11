import http from "node:http";
import { createServer } from "./api/createServer";
import { loadConfig } from "./config/env";
import { createLogger } from "./config/logger";
import { SearchRepository } from "./db/searchRepository";
import { startSearchCleanupJob } from "./jobs/searchCleanupJob";
import { AmazonSearchAdapter } from "./search/adapters/amazonSearchAdapter";
import { MercadoLivreSearchAdapter } from "./search/adapters/mercadoLivreSearchAdapter";
import { ShopeeSearchAdapter } from "./search/adapters/shopeeSearchAdapter";
import { SearchService } from "./search/searchService";
import { closeStealthBrowser } from "./search/scraping/stealthBrowser";
import type { MarketplaceSearchAdapter } from "./search/types";

async function bootstrap() {
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
  const cleanupJob = startSearchCleanupJob(config, logger, searchService);

  const app = createServer({
    config,
    logger,
    searchService,
  });

  const server = http.createServer(app);

  server.listen(config.port, () => {
    logger.info({ port: config.port }, "Servidor iniciado.");
  });

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info("Encerrando aplicacao...");
    cleanupJob.stop();

    server.close(async () => {
      await closeStealthBrowser().catch((error) => {
        logger.warn({ err: error }, "Falha ao encerrar stealth browser.");
      });
      repository.close();
      logger.info("Aplicacao encerrada.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
