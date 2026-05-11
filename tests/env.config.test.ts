import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
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

  it("deve carregar limites de resultados total e por loja", () => {
    process.env.SEARCH_MAX_RESULTS = "20";
    process.env.SEARCH_MAX_RESULTS_PER_STORE = "10";
    process.env.SEARCH_MAX_ITEMS_PER_STORE = "10";

    const config = loadConfig();

    expect(config.searchMaxResults).toBe(20);
    expect(config.searchMaxResultsPerStore).toBe(10);
    expect(config.searchMaxItemsPerStore).toBe(10);
  });

  it("deve usar fallback para valores invalidos de concorrencia e tentativas", () => {
    process.env.SCRAPER_PRODUCT_CONCURRENCY = "abc";
    process.env.SCRAPER_MAX_HEADLESS_ATTEMPTS_PER_STORE = "x";

    const config = loadConfig();

    expect(config.scraperProductConcurrency).toBe(2);
    expect(config.scraperMaxHeadlessAttemptsPerStore).toBe(2);
  });

  it("deve carregar URL de proxy opcional para fallback headless", () => {
    process.env.PROXY_URL = "http://proxy.local:8080";

    const config = loadConfig();

    expect(config.proxyUrl).toBe("http://proxy.local:8080");
  });

  it("deve carregar diretorio de perfil persistente da Shopee", () => {
    process.env.SHOPEE_BROWSER_PROFILE_DIR = "./data/test-shopee-profile";

    const config = loadConfig();

    expect(config.shopeeBrowserProfileDir).toBe(path.resolve(process.cwd(), "./data/test-shopee-profile"));
  });

  it("deve carregar configuracoes de afiliado por marketplace", () => {
    process.env.ML_AFFILIATE_ID = "ml-novo";
    process.env.MERCADOLIVRE_AFFILIATE_ID = "ml-legado";
    process.env.MERCADOLIVRE_AFFILIATE_URL_TEMPLATE = "https://ml.example/?u={url}&id={affiliateId}";
    process.env.SHOPEE_AFFILIATE_ID = "shp-123";
    process.env.SHOPEE_AFFILIATE_URL_TEMPLATE = "https://shopee.example/?u={url}&id={affiliateId}";

    const config = loadConfig();

    expect(config.store.mercadolivre.affiliateId).toBe("ml-novo");
    expect(config.store.mercadolivre.affiliateUrlTemplate).toBe("https://ml.example/?u={url}&id={affiliateId}");
    expect(config.store.shopee.affiliateId).toBe("shp-123");
    expect(config.store.shopee.affiliateUrlTemplate).toBe("https://shopee.example/?u={url}&id={affiliateId}");
  });
});
