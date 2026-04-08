import fs from "node:fs";
import path from "node:path";
import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { AppRepository } from "../db/repository";

export function runDatabaseBackup(
  config: AppConfig,
  repository: AppRepository,
  logger: AppLogger,
): string | null {
  try {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    fs.mkdirSync(config.backupDir, { recursive: true });

    const fileName = `adsbot-backup-${timestamp}.sqlite`;
    const destination = path.join(config.backupDir, fileName);

    fs.copyFileSync(config.databasePath, destination);

    logger.info({ destination }, "Backup do banco concluido.");
    return destination;
  } catch (error) {
    const message = (error as Error).message;
    repository.addAlert("backup_error", `Falha no backup diario: ${message}`, "error");
    logger.error({ err: error }, "Erro ao gerar backup do banco.");
    return null;
  }
}
