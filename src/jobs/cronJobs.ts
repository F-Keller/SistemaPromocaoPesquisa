import cron from "node-cron";
import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { AppRepository } from "../db/repository";
import { runDatabaseBackup } from "./backupJob";

interface StartJobsInput {
  config: AppConfig;
  logger: AppLogger;
  repository: AppRepository;
  runCollector: () => Promise<void>;
}

export function startJobs(input: StartJobsInput): { stop: () => void } {
  const { config, logger, repository, runCollector } = input;

  const collectorTask = cron.schedule(
    config.collectorCron,
    async () => {
      try {
        logger.info("Executando cron de coleta.");
        await runCollector();
      } catch (error) {
        const message = (error as Error).message;
        repository.addAlert("collector_cron_error", `Erro no cron da coleta: ${message}`, "error");
        logger.error({ err: error }, "Erro no cron da coleta.");
      }
    },
    { timezone: config.timezone },
  );

  const backupTask = cron.schedule(
    config.backupCron,
    () => {
      runDatabaseBackup(config, repository, logger);
    },
    { timezone: config.timezone },
  );

  collectorTask.start();
  backupTask.start();

  return {
    stop: () => {
      collectorTask.stop();
      backupTask.stop();
    },
  };
}
