import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env";
import { createLogger } from "../src/config/logger";
import { AmazonSearchAdapter } from "../src/search/adapters/amazonSearchAdapter";
import { MercadoLivreSearchAdapter } from "../src/search/adapters/mercadoLivreSearchAdapter";
import { ShopeeSearchAdapter } from "../src/search/adapters/shopeeSearchAdapter";
import { ScraperError } from "../src/search/scraping/types";
import { AddressInput } from "../src/search/types";

const address: AddressInput = {
  street: "Rua Teste",
  number: "100",
  district: "Centro",
  city: "Sao Paulo",
  state: "SP",
  zipCode: "01000-000",
  complement: null,
};

const fixture = (...parts: string[]) =>
  fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "scraping", ...parts), "utf-8");

function buildConfig() {
  process.env.NODE_ENV = "test";
  process.env.ENABLE_MOCK_SOURCES = "false";
  process.env.SCRAPER_USE_HEADLESS_FALLBACK = "true";
  process.env.SCRAPER_TIMEOUT_TOTAL_MS = "5000";
  process.env.SCRAPER_TIMEOUT_HTTP_MS = "3000";
  process.env.SCRAPER_TIMEOUT_HEADLESS_MS = "3000";
  process.env.AMAZON_SEARCH_URL_TEMPLATE = "https://www.amazon.com.br/s?k={query}";
  process.env.MERCADOLIVRE_SEARCH_URL_TEMPLATE = "https://lista.mercadolivre.com.br/{query}";
  process.env.SHOPEE_SEARCH_URL_TEMPLATE = "https://shopee.com.br/search?keyword={query}";
  return loadConfig();
}

describe("marketplace scraping adapters", () => {
  it("deve raspar amazon via HTTP", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    const searchHtml = fixture("amazon", "search.html");
    const productHtml = fixture("amazon", "product.html");

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => {
        if (url.includes("/s?")) return { url, html: searchHtml, blocked: false, statusCode: 200 };
        return { url, html: productHtml, blocked: false, statusCode: 200 };
      },
      fetchHeadless: async (url: string) => ({ url, html: productHtml, blocked: false }),
    };

    const results = await adapter.searchProducts("console", address);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].store).toBe("amazon");
    expect(results[0].basePrice).toBe(1799.9);
  });

  it("deve usar fallback headless quando parse HTTP falha", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    const searchHtml = fixture("amazon", "search.html");
    const invalidProduct = "<html><body><h1>Sem preco</h1></body></html>";
    const validProduct = fixture("amazon", "product.html");

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => {
        if (url.includes("/s?")) return { url, html: searchHtml, blocked: false, statusCode: 200 };
        return { url, html: invalidProduct, blocked: false, statusCode: 200 };
      },
      fetchHeadless: async (url: string) => ({ url, html: validProduct, blocked: false }),
    };

    const results = await adapter.searchProducts("console", address);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain("Console Game Prime");
  });

  it("deve sinalizar captcha na busca", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => ({
        url,
        html: "<html><body>Please solve CAPTCHA to continue</body></html>",
        blocked: true,
        statusCode: 403,
      }),
      fetchHeadless: async (url: string) => ({ url, html: "<html></html>", blocked: true }),
    };

    await expect(adapter.searchProducts("console", address)).rejects.toMatchObject({ code: "captcha" });
  });

  it("deve extrair mercadolivre via fixtures", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);

    const searchHtml = fixture("mercadolivre", "search.html");
    const productHtml = fixture("mercadolivre", "product.html");

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => {
        if (url.includes("lista.mercadolivre")) return { url, html: searchHtml, blocked: false, statusCode: 200 };
        return { url, html: productHtml, blocked: false, statusCode: 200 };
      },
      fetchHeadless: async (url: string) => ({ url, html: productHtml, blocked: false }),
    };

    const results = await adapter.searchProducts("notebook", address);
    expect(results[0].store).toBe("mercadolivre");
  });

  it("deve extrair shopee via fixtures", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);

    const searchHtml = fixture("shopee", "search.html");
    const productHtml = fixture("shopee", "product.html");

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => {
        if (url.includes("search?keyword")) return { url, html: searchHtml, blocked: false, statusCode: 200 };
        return { url, html: productHtml, blocked: false, statusCode: 200 };
      },
      fetchHeadless: async (url: string) => ({ url, html: productHtml, blocked: false }),
    };

    const results = await adapter.searchProducts("fone", address);
    expect(results[0].store).toBe("shopee");
  });
});