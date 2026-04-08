import { AppLogger } from "../config/logger";
import { DealCandidate } from "../shared/types";
import { extractItems, mockCandidates, toCandidate } from "./helpers";

interface AdapterOptions {
  storeName: string;
  feedUrl: string;
  apiKey: string;
  enableMock: boolean;
  logger: AppLogger;
}

export abstract class BaseAdapter {
  protected readonly storeName: string;
  protected readonly feedUrl: string;
  protected readonly apiKey: string;
  protected readonly enableMock: boolean;
  protected readonly logger: AppLogger;

  constructor(options: AdapterOptions) {
    this.storeName = options.storeName;
    this.feedUrl = options.feedUrl;
    this.apiKey = options.apiKey;
    this.enableMock = options.enableMock;
    this.logger = options.logger;
  }

  protected async collectFromFeed(): Promise<DealCandidate[]> {
    if (!this.feedUrl) {
      if (this.enableMock) return mockCandidates(this.storeName);
      return [];
    }

    try {
      const response = await fetch(this.feedUrl, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const items = extractItems(payload);

      if (items.length === 0 && this.enableMock) {
        return mockCandidates(this.storeName);
      }

      return items.map((raw, index) => toCandidate(raw, this.storeName, index));
    } catch (error) {
      this.logger.warn(
        { err: error, store: this.storeName },
        "Falha ao coletar feed; retornando fallback mock quando habilitado.",
      );

      if (this.enableMock) return mockCandidates(this.storeName);
      return [];
    }
  }
}
