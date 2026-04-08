import { MessageSender, SenderStatus } from "../shared/types";

export class ConsoleSender implements MessageSender {
  private status: SenderStatus = {
    ready: true,
    mode: "console",
    detail: "Modo console ativo (sem envio real).",
    lastUpdatedAt: new Date().toISOString(),
  };

  async initialize(): Promise<void> {
    this.status = {
      ...this.status,
      ready: true,
      detail: "Modo console inicializado.",
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  async sendMessage(groupId: string, message: string): Promise<void> {
    const separator = "=".repeat(48);
    console.log(`\n${separator}`);
    console.log(`[CONSOLE SENDER] Grupo: ${groupId}`);
    console.log(message);
    console.log(`${separator}\n`);
  }

  getStatus(): SenderStatus {
    return this.status;
  }
}
