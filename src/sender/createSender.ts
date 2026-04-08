import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { AppRepository } from "../db/repository";
import { MessageSender } from "../shared/types";
import { ConsoleSender } from "./consoleSender";
import { WhatsAppWebSender } from "./whatsappWebSender";

export async function createSender(
  config: AppConfig,
  logger: AppLogger,
  repository: AppRepository,
): Promise<MessageSender> {
  if (config.whatsappMode !== "web") {
    const sender = new ConsoleSender();
    await sender.initialize();
    return sender;
  }

  const sender = new WhatsAppWebSender(
    config.whatsappSessionPath,
    logger,
    (type, message, level = "warning") => repository.addAlert(type, message, level),
  );

  try {
    await sender.initialize();
    return sender;
  } catch (error) {
    logger.warn(
      { err: error },
      "Falha no modo WhatsApp Web. Aplicacao continuara no modo console para nao interromper o MVP.",
    );
    repository.addAlert(
      "sender_fallback",
      "Modo WhatsApp Web falhou na inicializacao. Sender em fallback para console.",
      "warning",
    );
    const fallback = new ConsoleSender();
    await fallback.initialize();
    return fallback;
  }
}
