import { loadConfig } from "../config/env";
import { createLogger } from "../config/logger";
import { AppRepository } from "../db/repository";
import { AmazonAdapter } from "../stores/amazonAdapter";
import { MercadoLivreAdapter } from "../stores/mercadoLivreAdapter";
import { ShopeeAdapter } from "../stores/shopeeAdapter";
import { DealCollector } from "../worker/collector";

async function run() {
  const config = loadConfig();
  const logger = createLogger(config);
  const repository = new AppRepository(config.databasePath);
  repository.init();

  const adapters = [
    new AmazonAdapter(config, logger),
    new MercadoLivreAdapter(config, logger),
    new ShopeeAdapter(config, logger),
  ];

  const collector = new DealCollector(config, repository, adapters, logger);
  await collector.runOnce();

  logger.info("Coleta manual finalizada.");
  repository.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
