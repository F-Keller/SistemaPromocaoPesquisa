import cron from "node-cron";
import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { SearchService } from "../search/searchService";

export function startSearchCleanupJob(
  config: AppConfig,
  logger: AppLogger,
  searchService: SearchService,
): { stop: () => void } {
  const task = cron.schedule(
    config.searchCleanupCron,
    () => {
      const deleted = searchService.cleanupExpired();
      if (deleted > 0) {
        logger.info({ deleted }, "Buscas expiradas removidas.");
      }
    },
    { timezone: config.timezone },
  );

  task.start();

  return {
    stop: () => task.stop(),
  };
}