import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env";

describe("config env parsing", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("deve carregar concorrencia e limite de tentativas headless por loja", () => {
    process.env.SCRAPER_PRODUCT_CONCURRENCY = "3";
    process.env.SCRAPER_MAX_HEADLESS_ATTEMPTS_PER_STORE = "5";

    const config = loadConfig();

    expect(config.scraperProductConcurrency).toBe(3);
    expect(config.scraperMaxHeadlessAttemptsPerStore).toBe(5);
  });

  it("deve usar fallback para valores invalidos de concorrencia e tentativas", () => {
    process.env.SCRAPER_PRODUCT_CONCURRENCY = "abc";
    process.env.SCRAPER_MAX_HEADLESS_ATTEMPTS_PER_STORE = "x";

    const config = loadConfig();

    expect(config.scraperProductConcurrency).toBe(2);
    expect(config.scraperMaxHeadlessAttemptsPerStore).toBe(2);
  });
});
