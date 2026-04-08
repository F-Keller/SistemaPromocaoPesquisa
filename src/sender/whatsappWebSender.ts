import { AppLogger } from "../config/logger";
import { MessageSender, SenderStatus } from "../shared/types";

export class WhatsAppWebSender implements MessageSender {
  private client: any = null;

  private status: SenderStatus = {
    ready: false,
    mode: "web",
    detail: "Nao inicializado.",
    lastUpdatedAt: new Date().toISOString(),
  };

  constructor(
    private readonly sessionPath: string,
    private readonly logger: AppLogger,
    private readonly onAlert: (type: string, message: string, level?: "info" | "warning" | "error") => void,
  ) {}

  async initialize(): Promise<void> {
    try {
      const pkgName = "whatsapp-web.js";
      const pkg = await import(pkgName);
      const Client = (pkg as any).Client;
      const LocalAuth = (pkg as any).LocalAuth;

      if (!Client || !LocalAuth) {
        throw new Error("Pacote whatsapp-web.js nao possui Client/LocalAuth disponiveis.");
      }

      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: this.sessionPath }),
        puppeteer: {
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      });

      this.client.on("qr", (qr: string) => {
        this.updateStatus(false, "QR Code gerado. Escaneie para autenticar.");
        this.logger.info({ qr }, "QR Code do WhatsApp gerado.");
        this.onAlert("whatsapp_qr", "QR Code gerado. Escaneie para autenticar.", "info");
      });

      this.client.on("ready", () => {
        this.updateStatus(true, "Sessao WhatsApp pronta.");
        this.logger.info("WhatsApp Web conectado e pronto.");
      });

      this.client.on("auth_failure", (message: string) => {
        this.updateStatus(false, `Falha de autenticacao: ${message}`);
        this.onAlert("whatsapp_auth_failure", `Falha de autenticacao: ${message}`, "error");
      });

      this.client.on("disconnected", (reason: string) => {
        this.updateStatus(false, `WhatsApp desconectado: ${reason}`);
        this.onAlert("whatsapp_disconnected", `WhatsApp desconectado: ${reason}`, "warning");
      });

      await this.client.initialize();
      this.updateStatus(false, "Inicializado; aguardando autenticacao/ready.");
    } catch (error) {
      const message = (error as Error).message;
      this.updateStatus(false, `Falha ao inicializar WhatsApp Web: ${message}`);
      this.logger.error({ err: error }, "Erro ao inicializar WhatsApp Web.");
      this.onAlert("whatsapp_init_error", `Falha ao inicializar WhatsApp Web: ${message}`, "error");
      throw error;
    }
  }

  async sendMessage(groupId: string, message: string): Promise<void> {
    if (!this.client || !this.status.ready) {
      throw new Error("WhatsApp Web ainda nao esta pronto para envio.");
    }

    await this.client.sendMessage(groupId, message);
  }

  getStatus(): SenderStatus {
    return this.status;
  }

  private updateStatus(ready: boolean, detail: string): void {
    this.status = {
      ready,
      mode: "web",
      detail,
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}
