import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { detectBlockedHtml } from "./parserUtils";
import { getStealthBrowser } from "./stealthBrowser";
import { ScraperError, ScraperFetchResult } from "./types";

export class ScraperClient {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {}

  async fetchHttp(url: string, timeoutMs = this.config.scraperTimeoutHttpMs): Promise<ScraperFetchResult> {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": this.config.scraperUserAgent,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const html = await response.text();
      const blocked = response.status === 403 || response.status === 429 || detectBlockedHtml(html);

      return {
        url,
        html,
        blocked,
        statusCode: response.status,
      };
    } catch (error) {
      if ((error as Error).name === "TimeoutError") {
        throw new ScraperError("timeout", `Timeout HTTP ao buscar ${url}`);
      }

      throw new ScraperError("network_error", `Falha HTTP ao buscar ${url}: ${(error as Error).message}`);
    }
  }

  async fetchHeadless(
    url: string,
    timeoutMs = this.config.scraperTimeoutHeadlessMs,
  ): Promise<ScraperFetchResult> {
    if (!this.config.scraperUseHeadlessFallback) {
      throw new ScraperError("headless_error", "Headless fallback desabilitado por configuracao.");
    }

    try {
      const html = await getStealthBrowser(this.config, this.logger).fetchHtml(url, timeoutMs);
      const blocked = detectBlockedHtml(html);

      return {
        url,
        html,
        blocked,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn({ url, err: error }, "Falha no fallback headless.");
      throw new ScraperError("headless_error", `Falha headless em ${url}: ${message}`);
    }
  }
}
