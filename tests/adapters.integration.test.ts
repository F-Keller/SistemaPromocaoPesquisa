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

const makeAmazonSearchHtml = (asins: string[]) => `
<html>
  <body>
    ${asins
      .map(
        (asin) =>
          `<article><h2><a class="a-link-normal" href="/dp/${asin}">Produto ${asin}</a></h2></article>`,
      )
      .join("\n")}
  </body>
</html>`;

const makeAmazonProductHtml = (title: string, price: string) => `
<html>
  <body>
    <span id="productTitle">${title}</span>
    <span class="a-price"><span class="a-offscreen">${price}</span></span>
  </body>
</html>`;

function buildConfig() {
  process.env.NODE_ENV = "test";
  process.env.ENABLE_MOCK_SOURCES = "false";
  process.env.SCRAPER_USE_HEADLESS_FALLBACK = "true";
  process.env.SCRAPER_TIMEOUT_TOTAL_MS = "10000";
  process.env.SCRAPER_TIMEOUT_HTTP_MS = "2000";
  process.env.SCRAPER_TIMEOUT_HEADLESS_MS = "2000";
  process.env.SCRAPER_PRODUCT_CONCURRENCY = "2";
  process.env.SCRAPER_MAX_HEADLESS_ATTEMPTS_PER_STORE = "2";
  process.env.SEARCH_MAX_ITEMS_PER_STORE = "12";
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

  it("nao deve usar headless quando o erro for apenas parse incompleto", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    const searchHtml = makeAmazonSearchHtml(["B0TEST0001"]);
    const invalidProduct = "<html><body><h1>Sem preco</h1></body></html>";
    let headlessCalls = 0;

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => {
        if (url.includes("/s?")) return { url, html: searchHtml, blocked: false, statusCode: 200 };
        return { url, html: invalidProduct, blocked: false, statusCode: 200 };
      },
      fetchHeadless: async (url: string) => {
        headlessCalls += 1;
        return { url, html: makeAmazonProductHtml("Fallback", "R$ 999,90"), blocked: false };
      },
    };

    await expect(adapter.searchProducts("console", address)).rejects.toMatchObject({
      code: "parse_error",
    });
    expect(headlessCalls).toBe(0);
  });

  it("deve usar headless quando detalhe via HTTP falhar por timeout", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    const searchHtml = makeAmazonSearchHtml(["B0TEST0002"]);
    let headlessCalls = 0;

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => {
        if (url.includes("/s?")) return { url, html: searchHtml, blocked: false, statusCode: 200 };
        throw new ScraperError("timeout", `Timeout HTTP ao buscar ${url}`);
      },
      fetchHeadless: async (url: string) => {
        headlessCalls += 1;
        return {
          url,
          html: makeAmazonProductHtml("Produto Recuperado", "R$ 1.799,90"),
          blocked: false,
        };
      },
    };

    const results = await adapter.searchProducts("console", address);

    expect(results.length).toBe(1);
    expect(results[0].title).toContain("Produto Recuperado");
    expect(headlessCalls).toBe(1);
  });

  it("deve tentar novamente o HTTP uma vez antes de descartar", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    const searchHtml = makeAmazonSearchHtml(["B0TEST0003"]);
    let productHttpCalls = 0;
    let headlessCalls = 0;

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => {
        if (url.includes("/s?")) return { url, html: searchHtml, blocked: false, statusCode: 200 };

        productHttpCalls += 1;
        if (productHttpCalls === 1) {
          throw new ScraperError("timeout", `Timeout HTTP ao buscar ${url}`);
        }

        return {
          url,
          html: makeAmazonProductHtml("Produto Retry", "R$ 1.899,90"),
          blocked: false,
          statusCode: 200,
        };
      },
      fetchHeadless: async (url: string) => {
        headlessCalls += 1;
        return { url, html: "<html></html>", blocked: false };
      },
    };

    const results = await adapter.searchProducts("console", address);

    expect(results.length).toBe(1);
    expect(productHttpCalls).toBe(2);
    expect(headlessCalls).toBe(0);
  });

  it("deve respeitar limite de concorrencia na coleta de detalhes", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    const asins = [
      "B0TEST0101",
      "B0TEST0102",
      "B0TEST0103",
      "B0TEST0104",
      "B0TEST0105",
      "B0TEST0106",
    ];

    const searchHtml = makeAmazonSearchHtml(asins);
    let active = 0;
    let maxActive = 0;

    (adapter as any).scraper = {
      fetchHttp: async (url: string) => {
        if (url.includes("/s?")) return { url, html: searchHtml, blocked: false, statusCode: 200 };

        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 80));
        active -= 1;

        return {
          url,
          html: makeAmazonProductHtml("Produto Concorrencia", "R$ 2.099,90"),
          blocked: false,
          statusCode: 200,
        };
      },
      fetchHeadless: async (url: string) => ({
        url,
        html: makeAmazonProductHtml("Produto Headless", "R$ 2.099,90"),
        blocked: false,
      }),
    };

    const results = await adapter.searchProducts("console", address);

    expect(results.length).toBeGreaterThan(0);
    expect(maxActive).toBeLessThanOrEqual(config.scraperProductConcurrency);
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
