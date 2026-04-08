import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { AppRepository, BroadcastRow } from "../db/repository";
import { MessageSender } from "../shared/types";
import { nowIso } from "../shared/utils";

export class BroadcastDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isTicking = false;

  constructor(
    private readonly config: AppConfig,
    private readonly repository: AppRepository,
    private readonly sender: MessageSender,
    private readonly logger: AppLogger,
  ) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tick().catch((error) => {
      this.logger.error({ err: error }, "Erro no tick inicial do dispatcher.");
    });

    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error({ err: error }, "Erro no tick do dispatcher.");
      });
    }, this.config.dispatcherPollSeconds * 1000);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (!this.isRunning || this.isTicking) return;
    this.isTicking = true;

    try {
      const due = this.repository.listDueBroadcasts(nowIso(), 25);
      for (const item of due) {
        await this.processOne(item);
      }
    } finally {
      this.isTicking = false;
    }
  }

  private async processOne(item: BroadcastRow): Promise<void> {
    const canSendResult = this.canSendToGroup(item.group_id);
    if (!canSendResult.allowed) {
      this.repository.markBroadcastRetry(item.id, canSendResult.reason, canSendResult.nextAt);
      return;
    }

    try {
      await this.sender.sendMessage(item.group_id, item.message_text);
      this.repository.markBroadcastSent(item.id);
      this.logger.info(
        {
          broadcastId: item.id,
          dealId: item.deal_id,
          groupId: item.group_id,
        },
        "Mensagem enviada com sucesso.",
      );
    } catch (error) {
      const message = (error as Error).message;
      const nextAttempt = item.attempts + 1;

      if (nextAttempt <= this.config.sendMaxRetries) {
        const backoffSeconds = this.config.sendBaseBackoffSeconds * 2 ** (nextAttempt - 1);
        const nextAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();
        this.repository.markBroadcastRetry(item.id, message, nextAt);

        this.logger.warn(
          {
            broadcastId: item.id,
            nextAttempt,
            backoffSeconds,
            err: error,
          },
          "Falha de envio; broadcast agendado para retry.",
        );
      } else {
        this.repository.markBroadcastFailed(item.id, message);
        this.repository.addAlert(
          "broadcast_failed",
          `Falha definitiva no broadcast ${item.id}: ${message}`,
          "error",
        );
        this.logger.error(
          {
            broadcastId: item.id,
            attempts: nextAttempt,
            err: error,
          },
          "Falha definitiva de envio.",
        );
      }
    }
  }

  private canSendToGroup(
    groupId: string,
  ): { allowed: true } | { allowed: false; reason: string; nextAt: string } {
    const sentToday = this.repository.getGroupSentCountToday(groupId);
    if (sentToday >= this.config.dailyCapPerGroup) {
      const nextAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      return {
        allowed: false,
        reason: "Limite diario por grupo excedido.",
        nextAt,
      };
    }

    const lastSent = this.repository.getGroupLastSentAt(groupId);
    if (!lastSent) return { allowed: true };

    const elapsedSeconds = (Date.now() - new Date(lastSent).getTime()) / 1000;
    if (elapsedSeconds >= this.config.minIntervalSeconds) {
      return { allowed: true };
    }

    const waitSeconds = Math.ceil(this.config.minIntervalSeconds - elapsedSeconds);
    const nextAt = new Date(Date.now() + waitSeconds * 1000).toISOString();

    return {
      allowed: false,
      reason: "Intervalo minimo entre mensagens nao atingido.",
      nextAt,
    };
  }
}
