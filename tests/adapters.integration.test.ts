import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/env";
import { createLogger } from "../src/config/logger";
import { AmazonSearchAdapter } from "../src/search/adapters/amazonSearchAdapter";
import { MercadoLivreSearchAdapter } from "../src/search/adapters/mercadoLivreSearchAdapter";
import { ShopeeSearchAdapter } from "../src/search/adapters/shopeeSearchAdapter";
import { AddressInput } from "../src/search/types";

interface FakeRoute {
  content?: string;
  delayMs?: number;
  gotoError?: Error;
  waitError?: Error;
  searchCards?: Array<{
    url: string;
    title?: string | null;
    priceText?: string | null;
    referencePriceText?: string | null;
    imageUrl?: string | null;
    storeItemIdHint?: string | null;
  }>;
  productDetails?: {
    title?: string | null;
    basePriceText?: string | null;
    referencePriceText?: string | null;
    imageUrl?: string | null;
    storeItemId?: string | null;
    sku?: string | null;
    brand?: string | null;
    model?: string | null;
    category?: string | null;
  };
}

const stealthState = vi.hoisted(() => {
  const state = {
    routes: [] as Array<{ match: string; route: FakeRoute }>,
    createdPages: [] as any[],
    pageActions: [] as Array<{
      method: "goto" | "waitForLoadState" | "waitForSelector";
      url: string;
      timeout?: number;
      selector?: string;
      state?: string;
    }>,
    activeProductPages: 0,
    maxActiveProductPages: 0,
    browser: null as any,
  };

  class FakePage {
    currentUrl = "";
    closed = false;

    async goto(url: string, options?: { timeout?: number }) {
      this.currentUrl = url;
      state.pageActions.push({
        method: "goto",
        url,
        timeout: options?.timeout,
      });
      const route = findRoute(url);
      if (route?.gotoError) throw route.gotoError;

      if (route?.productDetails) {
        state.activeProductPages += 1;
        state.maxActiveProductPages = Math.max(state.maxActiveProductPages, state.activeProductPages);
      }

      if (route?.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, route.delayMs));
      }

      if (route?.productDetails) {
        state.activeProductPages -= 1;
      }
    }

    async waitForLoadState(loadState?: string, options?: { timeout?: number }) {
      state.pageActions.push({
        method: "waitForLoadState",
        url: this.currentUrl,
        state: loadState,
        timeout: options?.timeout,
      });
      return undefined;
    }

    async waitForSelector(selector?: string, options?: { timeout?: number }) {
      state.pageActions.push({
        method: "waitForSelector",
        url: this.currentUrl,
        selector,
        timeout: options?.timeout,
      });
      const route = findRoute(this.currentUrl);
      if (route?.waitError) throw route.waitError;
      return {};
    }

    async content() {
      return findRoute(this.currentUrl)?.content ?? "<html><body>ok</body></html>";
    }

    async evaluate(scriptOrFunction?: any, arg?: any) {
      if (typeof scriptOrFunction === "function") {
        return scriptOrFunction(arg);
      }

      const route = findRoute(this.currentUrl);
      if (route?.searchCards) return route.searchCards;
      if (route?.productDetails) return route.productDetails;
      return [];
    }

    url() {
      return this.currentUrl;
    }

    async close() {
      this.closed = true;
    }
  }

  const findRoute = (url: string): FakeRoute | undefined =>
    state.routes.find((entry) => url.includes(entry.match))?.route;

  state.browser = {
    withPage: vi.fn(async (worker: any) => {
      const page = new FakePage();
      const context = {
        closed: false,
        close: vi.fn(async () => {
          context.closed = true;
        }),
      };

      state.createdPages.push(page);

      try {
        return await worker({
          browser: { isConnected: () => true },
          context,
          page,
        });
      } finally {
        await page.close();
        await context.close();
      }
    }),
    withPersistentPage: vi.fn(async (_options: any, worker: any) => {
      const page = new FakePage();
      const context = {
        closed: false,
        close: vi.fn(async () => {
          context.closed = true;
        }),
      };

      state.createdPages.push(page);

      try {
        return await worker({
          browser: { isConnected: () => true },
          context,
          page,
        });
      } finally {
        await page.close();
      }
    }),
    randomMouseMovements: vi.fn(async () => undefined),
    simulateHumanScroll: vi.fn(async () => undefined),
    randomDelay: vi.fn(async () => undefined),
  };

  return state;
});

vi.mock("../src/search/scraping/stealthBrowser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/search/scraping/stealthBrowser")>();
  return {
    ...actual,
    getStealthBrowser: () => stealthState.browser,
  };
});

const originalEnv = { ...process.env };
let fetchSpy: any = null;

const address: AddressInput = {
  street: "Rua Teste",
  number: "100",
  district: "Centro",
  city: "Sao Paulo",
  state: "SP",
  zipCode: "01000-000",
  complement: null,
};

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

function addRoute(match: string, route: FakeRoute) {
  stealthState.routes.push({ match, route });
}

function mockFetchResponses(
  responses: Array<{
    body: unknown;
    status?: number;
  }>,
) {
  const queue = [...responses];

  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const next = queue.shift() ?? responses[responses.length - 1];
    const status = next.status ?? 200;
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn(async () => next.body),
      text: vi.fn(async () => text),
    } as unknown as Response;
  });

  return fetchSpy;
}

function mockMercadoLivreApi(results: unknown[], status = 200) {
  return mockFetchResponses([
    {
      status,
      body: { results },
    },
  ]);
}

function shopeeApiItem(index: number, overrides: Record<string, unknown> = {}) {
  return {
    item_basic: {
      shopid: 1000 + index,
      itemid: 2000 + index,
      name: `Fone Shopee ${index}`,
      price: 19990000 + index * 100000,
      price_before_discount: 24990000 + index * 100000,
      image: `br11134207shopeeimage${String(index).padStart(2, "0")}`,
      ...overrides,
    },
  };
}

function shopeeHtmlCard(options: {
  url: string;
  title: string;
  priceText: string;
  imageUrl?: string;
}) {
  return `
    <div data-testid="product-card">
      <a data-sqe="link" href="${options.url}" title="${options.title}">
        <img src="${options.imageUrl ?? "https://cf.shopee.com.br/file/card.jpg"}" />
        <div data-testid="product-card-name">${options.title}</div>
        <div data-testid="product-card-price">${options.priceText}</div>
      </a>
    </div>
  `;
}

describe("marketplace scraping adapters", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    stealthState.routes = [];
    stealthState.createdPages = [];
    stealthState.pageActions = [];
    stealthState.activeProductPages = 0;
    stealthState.maxActiveProductPages = 0;
    stealthState.browser.withPage.mockClear();
    stealthState.browser.withPersistentPage.mockClear();
    stealthState.browser.randomMouseMovements.mockClear();
    stealthState.browser.simulateHumanScroll.mockClear();
    stealthState.browser.randomDelay.mockClear();
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
      fetchSpy = null;
    }
    process.env = { ...originalEnv };
  });

  it("deve extrair cards da Amazon via stealth usando preco da listagem", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "/dp/B0TEST0001",
          title: "Console Game Prime",
          priceText: "R$ 2.099,90",
          imageUrl: "https://images.example.com/search-console.jpg",
          storeItemIdHint: "B0TEST0001",
        },
      ],
    });
    addRoute("/dp/B0TEST0001", {
      productDetails: {
        title: "Console Game Prime",
        basePriceText: "R$ 1.799,90",
        referencePriceText: "R$ 2.299,90",
        imageUrl: "https://images.example.com/console.jpg",
        storeItemId: "B0TEST0001",
        brand: "Marca Teste",
        model: "Prime",
      },
    });

    const results = await adapter.searchProducts("console", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      store: "amazon",
      storeItemId: "B0TEST0001",
      title: "Console Game Prime",
      basePrice: 2099.9,
      referencePrice: null,
      productUrl: "https://www.amazon.com.br/dp/B0TEST0001",
      affiliateUrl: "https://www.amazon.com.br/dp/B0TEST0001",
      imageUrl: "https://images.example.com/search-console.jpg",
      priceSource: "listing",
    });
    expect(stealthState.browser.randomMouseMovements).toHaveBeenCalled();
    expect(stealthState.browser.simulateHumanScroll).toHaveBeenCalled();
    expect(stealthState.browser.withPage).toHaveBeenCalledTimes(1);
  });

  it("deve usar dados do card quando pagina de produto cair em captcha", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "/dp/B0GRID0001",
          title: "Notebook Gamer Grid",
          priceText: "R$ 3.299,90",
          referencePriceText: "R$ 3.999,90",
          imageUrl: "https://images.example.com/grid-notebook.jpg",
          storeItemIdHint: "B0GRID0001",
        },
      ],
    });
    addRoute("/dp/B0GRID0001", {
      content: "<html><body>Please solve CAPTCHA to continue</body></html>",
    });

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      store: "amazon",
      storeItemId: "B0GRID0001",
      title: "Notebook Gamer Grid",
      basePrice: 3299.9,
      referencePrice: 3999.9,
      imageUrl: "https://images.example.com/grid-notebook.jpg",
      productUrl: "https://www.amazon.com.br/dp/B0GRID0001",
      affiliateUrl: "https://www.amazon.com.br/dp/B0GRID0001",
      priceSource: "listing",
    });
  });

  it("deve logar o preco bruto da listagem antes de converter para numero", async () => {
    const config = buildConfig();
    const logger = {
      debug: vi.fn(),
    } as unknown as ReturnType<typeof createLogger>;
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "/dp/B0RAW00001",
          title: "Notebook Gamer Raw",
          priceText: "R$ 4.999,90",
        },
      ],
    });
    addRoute("/dp/B0RAW00001", {
      content: "<html><body>Please solve CAPTCHA to continue</body></html>",
    });

    const results = await adapter.searchProducts("notebook gamer", address);
    const rawPriceLog = logger.debug.mock.calls.find(
      (call) => call[1] === "Preco bruto extraido da listagem.",
    );

    expect(results).toHaveLength(1);
    expect(rawPriceLog?.[0]).toMatchObject({
      store: "amazon",
      productUrl: "https://www.amazon.com.br/dp/B0RAW00001",
      rawPriceText: "R$ 4.999,90",
    });
    expect(rawPriceLog?.[0]).not.toHaveProperty("err");
  });

  it("deve manter fallback da listagem quando pagina de produto demora demais", async () => {
    const config = {
      ...buildConfig(),
      scraperTimeoutHeadlessMs: 40,
      scraperTimeoutTotalMs: 1000,
    };
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "/dp/B0SLOW0001",
          title: "Notebook Gamer Lento",
          priceText: "R$ 5.499,90",
          imageUrl: "https://images.example.com/slow-notebook.jpg",
        },
      ],
    });
    addRoute("/dp/B0SLOW0001", {
      delayMs: 120,
      productDetails: {
        title: "Notebook Gamer Lento Validado",
        basePriceText: "R$ 4.999,90",
        storeItemId: "B0SLOW0001",
      },
    });

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "Notebook Gamer Lento",
      basePrice: 5499.9,
      priceSource: "listing",
    });
    expect(stealthState.browser.withPage).toHaveBeenCalledTimes(1);
  });

  it("deve retornar candidatos de listagem antes do timeout total quando produtos individuais sao lentos", async () => {
    const config = {
      ...buildConfig(),
      searchMaxItemsPerStore: 10,
      scraperTimeoutHeadlessMs: 18000,
      scraperTimeoutTotalMs: 100,
    };
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);
    const asins = Array.from({ length: 10 }, (_item, index) => `B0FAST${String(index).padStart(4, "0")}`);

    addRoute("amazon.com.br/s?", {
      searchCards: asins.map((asin, index) => ({
        url: `/dp/${asin}`,
        title: `Notebook Gamer ${index + 1}`,
        priceText: `R$ ${String(4000 + index * 100)},00`,
      })),
    });

    for (const asin of asins) {
      addRoute(`/dp/${asin}`, {
        delayMs: 500,
        productDetails: {
          title: `Notebook Gamer Validado ${asin}`,
          basePriceText: "R$ 3.999,90",
          storeItemId: asin,
        },
      });
    }

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(results).toHaveLength(10);
    expect(results.every((item) => item.priceSource === "listing")).toBe(true);
    expect(stealthState.browser.withPage).toHaveBeenCalledTimes(1);
  });

  it("deve descartar links da Amazon que nao apontam para pagina de produto", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "/stores/page/590972A6-39F8-41C8-8C7A-864E9ACB7184",
          title: "Pagina da loja",
          priceText: "R$ 999,00",
        },
        {
          url: "/dp/B0VALID001",
          title: "Notebook Gamer Valido",
          priceText: "R$ 4.999,90",
        },
      ],
    });

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(results).toHaveLength(1);
    expect(results[0].productUrl).toBe("https://www.amazon.com.br/dp/B0VALID001");
  });

  it("deve limitar logs de preco bruto ao maximo de itens por loja", async () => {
    const config = {
      ...buildConfig(),
      searchMaxItemsPerStore: 2,
    };
    const logger = {
      debug: vi.fn(),
    } as unknown as ReturnType<typeof createLogger>;
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [1, 2, 3, 4].map((index) => ({
        url: `/dp/B0LOG0000${index}`,
        title: `Notebook Gamer Log ${index}`,
        priceText: `R$ ${4000 + index},00`,
      })),
    });

    const results = await adapter.searchProducts("notebook gamer", address);
    const rawPriceLogs = logger.debug.mock.calls.filter(
      (call) => call[1] === "Preco bruto extraido da listagem.",
    );

    expect(results).toHaveLength(2);
    expect(rawPriceLogs).toHaveLength(2);
  });

  it("deve extrair cards mesmo quando o seletor do grid expirar", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      waitError: new Error("Timeout 2000ms exceeded"),
      searchCards: [
        {
          url: "/dp/B0GRDWAIT1",
          title: "Notebook Gamer Grid Timeout",
          priceText: "R$ 4.199,90",
        },
      ],
    });
    addRoute("/dp/B0GRDWAIT1", {
      content: "<html><body>Please solve CAPTCHA to continue</body></html>",
    });

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "B0GRDWAIT1",
      basePrice: 4199.9,
      priceSource: "listing",
    });
  });

  it("deve descartar fallback do card quando nao houver preco valido", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "/dp/B0GRID0002",
          title: "Notebook Gamer Sem Preco",
        },
      ],
    });
    addRoute("/dp/B0GRID0002", {
      content: "<html><body>Please solve CAPTCHA to continue</body></html>",
    });

    await expect(adapter.searchProducts("notebook gamer", address)).rejects.toMatchObject({ code: "parse_error" });
  });

  it("deve logar falha de produto individual sem stack do erro", async () => {
    const config = buildConfig();
    const logger = {
      debug: vi.fn(),
    } as unknown as ReturnType<typeof createLogger>;
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "/dp/B0GRID0003",
          title: "Notebook Gamer Erro",
        },
      ],
    });
    addRoute("/dp/B0GRID0003", {
      waitError: new Error("Unexpected product failure"),
    });

    await expect(adapter.searchProducts("notebook gamer", address)).rejects.toMatchObject({ code: "parse_error" });

    const productLog = logger.debug.mock.calls.find(
      (call) => call[1] === "Falha ao extrair produto individual; item sera ignorado.",
    );
    expect(productLog?.[0]).toMatchObject({
      store: "amazon",
      productUrl: "https://www.amazon.com.br/dp/B0GRID0003",
      code: "headless_error",
    });
    expect(productLog?.[0]).not.toHaveProperty("err");
  });

  it("deve canonicalizar URL aax da Amazon e deduplicar antes de abrir produto", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "https://aax-us-east-retail-direct.amazon.com/dp/B0F4M66XWL?psc=1",
          title: "Notebook Gamer Duplicado",
          priceText: "R$ 5.999,90",
        },
        {
          url: "https://aax-us-east-retail-direct.amazon.com/dp/B0F4M66XWL?ref=duplicado",
          title: "Notebook Gamer Duplicado",
          priceText: "R$ 5.899,90",
        },
      ],
    });
    addRoute("www.amazon.com.br/dp/B0F4M66XWL", {
      productDetails: {
        title: "Notebook Gamer Duplicado",
        basePriceText: "R$ 5.499,90",
        storeItemId: "B0F4M66XWL",
      },
    });

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(results).toHaveLength(1);
    expect(results[0].productUrl).toBe("https://www.amazon.com.br/dp/B0F4M66XWL");
    expect(results[0].basePrice).toBe(5999.9);
    expect(results[0].priceSource).toBe("listing");
    expect(stealthState.browser.withPage).toHaveBeenCalledTimes(1);
  });

  it("deve usar SCRAPER_TIMEOUT_HEADLESS_MS completo nas navegacoes e seletores headless", async () => {
    const config = {
      ...buildConfig(),
      scraperTimeoutHeadlessMs: 18000,
    };
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      searchCards: [
        {
          url: "/dp/B0TIME1818",
          title: "Notebook Gamer Timeout Completo",
        },
      ],
    });
    addRoute("/dp/B0TIME1818", {
      productDetails: {
        title: "Notebook Gamer Timeout Completo",
        basePriceText: "R$ 4.599,90",
        storeItemId: "B0TIME1818",
      },
    });

    const results = await adapter.searchProducts("notebook gamer", address);
    const productActions = stealthState.pageActions.filter((action) =>
      action.url.includes("/dp/B0TIME1818"),
    );

    expect(results).toHaveLength(1);
    expect(productActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "goto",
          timeout: 18000,
        }),
        expect.objectContaining({
          method: "waitForLoadState",
          state: "networkidle",
          timeout: 18000,
        }),
        expect.objectContaining({
          method: "waitForSelector",
          timeout: 18000,
        }),
      ]),
    );
  });

  it("deve usar API publica do Mercado Livre como caminho principal", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    const apiItems = Array.from({ length: 12 }, (_item, index) => ({
      id: `MLBAPI${String(index + 1).padStart(3, "0")}`,
      title: `Notebook Gamer Mercado Livre API ${index + 1}`,
      permalink: `https://produto.mercadolivre.com.br/MLB-API-${index + 1}`,
      price: 3000 + index * 100,
      original_price: 3600 + index * 100,
      secure_thumbnail: `https://http2.mlstatic.com/notebook-api-${index + 1}.jpg`,
    }));
    const apiSpy = mockMercadoLivreApi(apiItems);

    const results = await adapter.searchProducts("notebook", address);
    const apiUrl = new URL(String(apiSpy.mock.calls[0][0]));
    const expectedLimit = Math.max(config.searchMaxItemsPerStore, config.searchMaxResultsPerStore * 3);

    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(apiUrl.origin).toBe("https://api.mercadolibre.com");
    expect(apiUrl.pathname).toBe("/sites/MLB/search");
    expect(apiUrl.searchParams.get("q")).toBe("notebook");
    expect(apiUrl.searchParams.get("limit")).toBe(String(expectedLimit));
    expect(stealthState.browser.withPage).not.toHaveBeenCalled();
    expect(results).toHaveLength(10);
    expect(results[0]).toMatchObject({
      store: "mercadolivre",
      storeItemId: "MLBAPI001",
      title: "Notebook Gamer Mercado Livre API 1",
      productUrl: "https://produto.mercadolivre.com.br/MLB-API-1",
      affiliateUrl: "https://produto.mercadolivre.com.br/MLB-API-1",
      basePrice: 3000,
      referencePrice: 3600,
      imageUrl: "https://http2.mlstatic.com/notebook-api-1.jpg",
      priceSource: "listing",
    });
  });

  it("deve usar API publica do Mercado Livre via browser quando fetch Node falhar", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    const apiItems = Array.from({ length: 12 }, (_item, index) => ({
      id: `MLBBROWSER${String(index + 1).padStart(3, "0")}`,
      title: `Notebook Gamer Browser ${index + 1}`,
      permalink: `https://produto.mercadolivre.com.br/MLB-BROWSER-${index + 1}`,
      price: 4100 + index * 100,
      currency_id: "BRL",
      secure_thumbnail: `https://http2.mlstatic.com/browser-${index + 1}.jpg`,
    }));
    const apiSpy = mockFetchResponses([
      {
        status: 500,
        body: {},
      },
      {
        body: {
          results: apiItems,
        },
      },
    ]);

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(apiSpy).toHaveBeenCalledTimes(2);
    expect(stealthState.browser.withPage).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(10);
    expect(results[0]).toMatchObject({
      store: "mercadolivre",
      storeItemId: "MLBBROWSER001",
      basePrice: 4100,
      imageUrl: "https://http2.mlstatic.com/browser-1.jpg",
      priceSource: "listing",
    });
  });

  it("deve extrair Mercado Livre de JSON embutido quando APIs falharem", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    const html = `
      <html>
        <body>
          <script type="application/json">
            {
              "results": [
                {
                  "id": "MLBJSON001",
                  "title": "Notebook Gamer JSON",
                  "permalink": "https://produto.mercadolivre.com.br/MLB-JSON-001",
                  "price": 4899.9,
                  "currency_id": "BRL",
                  "secure_thumbnail": "https://http2.mlstatic.com/json-1.jpg"
                }
              ]
            }
          </script>
        </body>
      </html>
    `;
    const apiSpy = mockFetchResponses([
      {
        status: 500,
        body: {},
      },
      {
        status: 500,
        body: {},
      },
      {
        body: html,
      },
    ]);

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(apiSpy).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "MLBJSON001",
      basePrice: 4899.9,
      imageUrl: "https://http2.mlstatic.com/json-1.jpg",
    });
  });

  it("deve extrair cards HTML do Mercado Livre e ignorar parcelamento", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    const html = `
      <ol class="ui-search-layout">
        <li class="ui-search-layout__item">
          <a class="ui-search-link" href="https://produto.mercadolivre.com.br/MLB-987654321">
            Notebook Gamer HTML
          </a>
          <div class="poly-price__current">
            <span class="andes-money-amount">
              <span class="andes-money-amount__fraction">5.299</span>
              <span class="andes-money-amount__cents">90</span>
            </span>
          </div>
          <div class="poly-price__installments">
            10x de
            <span class="andes-money-amount">
              <span class="andes-money-amount__fraction">699</span>
            </span>
            sem juros
          </div>
          <img data-src="https://http2.mlstatic.com/html-1.jpg" />
        </li>
        <li class="ui-search-layout__item">
          <a class="ui-search-link" href="https://produto.mercadolivre.com.br/sem-id">
            Item invalido
          </a>
          <div class="poly-price__current">
            <span class="andes-money-amount">
              <span class="andes-money-amount__fraction">1.299</span>
            </span>
          </div>
        </li>
      </ol>
    `;
    const apiSpy = mockFetchResponses([
      {
        status: 500,
        body: {},
      },
      {
        status: 500,
        body: {},
      },
      {
        body: html,
      },
    ]);

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(String(apiSpy.mock.calls[2][0])).toBe("https://lista.mercadolivre.com.br/notebook-gamer");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "MLB987654321",
      basePrice: 5299.9,
      imageUrl: "https://http2.mlstatic.com/html-1.jpg",
    });
  });

  it("deve corrigir preco suspeito do Mercado Livre usando buy_box_winner do catalogo", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    const apiSpy = mockFetchResponses([
      {
        body: {
          results: [
            {
              id: "MLBLOW001",
              title: "Notebook Gamer Acer Nitro",
              permalink: "https://www.mercadolivre.com.br/notebook-gamer-acer-nitro/p/MLB61937659",
              price: 5,
              original_price: null,
              currency_id: "BRL",
              thumbnail: "https://http2.mlstatic.com/thumb-low.jpg",
            },
          ],
        },
      },
      {
        body: {
          buy_box_winner: {
            price: 5999.9,
            original_price: 6499.9,
            currency_id: "BRL",
            permalink: "https://www.mercadolivre.com.br/notebook-gamer-acer-nitro/p/MLB61937659",
            secure_thumbnail: "https://http2.mlstatic.com/thumb-catalog.jpg",
          },
        },
      },
    ]);

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(apiSpy).toHaveBeenCalledTimes(2);
    expect(String(apiSpy.mock.calls[1][0])).toBe("https://api.mercadolibre.com/products/MLB61937659");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "MLBLOW001",
      basePrice: 5999.9,
      referencePrice: 6499.9,
      imageUrl: "https://http2.mlstatic.com/thumb-catalog.jpg",
      priceSource: "listing",
    });
  });

  it("deve descartar notebook do Mercado Livre com preco suspeito sem confirmacao secundaria", async () => {
    const config = buildConfig();
    const logger = {
      debug: vi.fn(),
    } as unknown as ReturnType<typeof createLogger>;
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    mockFetchResponses([
      {
        body: {
          results: [
            {
              id: "MLBLOW002",
              title: "Notebook Gamer com Preco Ruim",
              permalink: "https://www.mercadolivre.com.br/notebook-gamer-preco-ruim/p/MLB61937660",
              price: 8,
              currency_id: "BRL",
            },
          ],
        },
      },
      {
        status: 404,
        body: {},
      },
    ]);

    await expect(adapter.searchProducts("notebook gamer", address)).rejects.toMatchObject({ code: "empty_result" });
    expect(stealthState.browser.withPage).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        store: "mercadolivre",
        storeItemId: "MLBLOW002",
        reason: "suspicious_price",
      }),
      "Item descartado por preco suspeito.",
    );
  });

  it("nao deve bloquear item barato real fora de categoria de alto valor no Mercado Livre", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    mockMercadoLivreApi([
      {
        id: "MLBCABO001",
        title: "Cabo USB-C Reforcado 1m",
        permalink: "https://produto.mercadolivre.com.br/MLB-CABO-001",
        price: 39.9,
        currency_id: "BRL",
        secure_thumbnail: "https://http2.mlstatic.com/cabo.jpg",
      },
    ]);

    const results = await adapter.searchProducts("cabo usb c", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "MLBCABO001",
      basePrice: 39.9,
      imageUrl: "https://http2.mlstatic.com/cabo.jpg",
    });
  });

  it("deve usar stealth como fallback quando API publica do Mercado Livre falhar", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    const apiSpy = mockMercadoLivreApi([], 500);

    addRoute("lista.mercadolivre.com.br", {
      content: `
        <ol class="ui-search-layout">
          <li class="ui-search-layout__item">
            <a class="ui-search-link" href="https://www.mercadolivre.com.br/MLB-123456">
              Notebook ZX Pro
            </a>
            <div class="poly-price__current">
              <span class="andes-money-amount">
                <span class="andes-money-amount__fraction">4.799</span>
              </span>
            </div>
          </li>
        </ol>
      `,
    });
    addRoute("MLB-123456", {
      productDetails: {
        title: "Notebook ZX Pro",
        basePriceText: "R$ 4.499,00",
        imageUrl: "https://www.mercadolivre.com.br/images/notebook.jpg",
        storeItemId: "MLB-123456",
      },
    });

    const results = await adapter.searchProducts("notebook", address);

    expect(apiSpy).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(1);
    expect(results[0].store).toBe("mercadolivre");
    expect(results[0].basePrice).toBe(4799);
    expect(results[0].priceSource).toBe("listing");
    expect(results[0].productUrl).toBe("https://www.mercadolivre.com.br/MLB-123456");
    expect(stealthState.browser.withPage).toHaveBeenCalled();
  });

  it("deve descartar itens invalidos retornados pela API publica do Mercado Livre", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new MercadoLivreSearchAdapter(config, logger);
    const apiSpy = mockMercadoLivreApi([
      {
        id: "MLBVALIDO",
        title: "Notebook Gamer Valido",
        permalink: "https://produto.mercadolivre.com.br/MLB-VALIDO",
        price: 3999.99,
        thumbnail: "https://http2.mlstatic.com/notebook-valido.jpg",
      },
      {
        id: "MLBSEMURL",
        title: "Sem URL",
        price: 100,
      },
      {
        id: "MLBSEMPRECO",
        title: "Sem preco",
        permalink: "https://produto.mercadolivre.com.br/MLB-SEMPRECO",
      },
    ]);

    const results = await adapter.searchProducts("notebook gamer", address);

    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "MLBVALIDO",
      basePrice: 3999.99,
      imageUrl: "https://http2.mlstatic.com/notebook-valido.jpg",
    });
  });

  it("deve usar API publica da Shopee como caminho principal", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    const items = Array.from({ length: 12 }, (_item, index) => shopeeApiItem(index + 1));
    const apiSpy = mockFetchResponses([{ body: { items } }]);

    const results = await adapter.searchProducts("fone", address);

    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(stealthState.browser.withPage).not.toHaveBeenCalled();
    expect(stealthState.browser.withPersistentPage).not.toHaveBeenCalled();
    expect(results).toHaveLength(10);
    expect(results[0]).toMatchObject({
      store: "shopee",
      storeItemId: "1001.2001",
      title: "Fone Shopee 1",
      basePrice: 200.9,
      referencePrice: 250.9,
      imageUrl: "https://down-br.img.susercontent.com/file/br11134207shopeeimage01",
      productUrl: "https://shopee.com.br/fone-shopee-1-i.1001.2001",
      priceSource: "listing",
    });
  });

  it("deve usar feed configurado da Shopee antes das fontes diretas", async () => {
    process.env.SHOPEE_FEED_URL = "https://feed.example.com/shopee?q={query}&limit={limit}";
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    const apiSpy = mockFetchResponses([{ body: { items: [shopeeApiItem(3)] } }]);

    const results = await adapter.searchProducts("fone bluetooth", address);

    expect(String(apiSpy.mock.calls[0][0])).toBe("https://feed.example.com/shopee?q=fone%20bluetooth&limit=30");
    expect(stealthState.browser.withPage).not.toHaveBeenCalled();
    expect(stealthState.browser.withPersistentPage).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      store: "shopee",
      storeItemId: "1003.2003",
      basePrice: 202.9,
    });
  });

  it("deve usar API publica da Shopee via browser quando fetch Node falhar", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    const apiSpy = mockFetchResponses([
      { status: 500, body: { error: "node unavailable" } },
      { body: { items: [shopeeApiItem(7)] } },
    ]);

    const results = await adapter.searchProducts("fone", address);

    expect(apiSpy).toHaveBeenCalledTimes(2);
    expect(stealthState.browser.withPage).not.toHaveBeenCalled();
    expect(stealthState.browser.withPersistentPage).toHaveBeenCalledTimes(1);
    expect(stealthState.browser.withPersistentPage).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "shopee",
        profileDir: config.shopeeBrowserProfileDir,
        blockResources: false,
      }),
      expect.any(Function),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "1007.2007",
      basePrice: 206.9,
    });
  });

  it("deve extrair Shopee de JSON embutido quando APIs falharem", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    const html = `
      <html>
        <body>
          <script type="application/json">
            {"items":[${JSON.stringify(shopeeApiItem(9))}]}
          </script>
        </body>
      </html>
    `;
    mockFetchResponses([
      { status: 500, body: { error: "api node" } },
      { status: 500, body: { error: "api browser" } },
      { body: html },
    ]);

    const results = await adapter.searchProducts("fone", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "1009.2009",
      title: "Fone Shopee 9",
      basePrice: 208.9,
    });
  });

  it("deve extrair cards HTML da Shopee quando APIs falharem", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    const html = `
      <html><body>
        ${shopeeHtmlCard({
          url: "/fone-bluetooth-i.123.222",
          title: "Fone HTML Shopee",
          priceText: "R$ 199,90",
          imageUrl: "https://cf.shopee.com.br/file/html-card.jpg",
        })}
      </body></html>
    `;
    mockFetchResponses([
      { status: 500, body: { error: "api node" } },
      { status: 500, body: { error: "api browser" } },
      { body: html },
    ]);

    const results = await adapter.searchProducts("fone", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "123.222",
      title: "Fone HTML Shopee",
      basePrice: 199.9,
      imageUrl: "https://cf.shopee.com.br/file/html-card.jpg",
      productUrl: "https://shopee.com.br/fone-bluetooth-i.123.222",
    });
  });

  it("nao deve zerar Shopee quando HTML via browser contem palavra captcha mas tambem cards validos", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    mockFetchResponses([
      { status: 500, body: { error: "api node" } },
      { status: 500, body: { error: "api browser" } },
      { status: 500, body: "captcha node" },
    ]);
    addRoute("shopee.com.br/search", {
      content: `
        <html><body>
          <p>captcha-widget-loaded:false</p>
          ${shopeeHtmlCard({
            url: "/produto-gamer-i.333.444",
            title: "Produto com Captcha Tecnico",
            priceText: "R$ 89,90",
          })}
        </body></html>
      `,
    });

    const results = await adapter.searchProducts("produto gamer", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      storeItemId: "333.444",
      title: "Produto com Captcha Tecnico",
      basePrice: 89.9,
    });
  });

  it("deve converter pagina apenas com captcha da Shopee em ScraperError", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    mockFetchResponses([
      { status: 500, body: { error: "api node" } },
      { status: 500, body: { error: "api browser" } },
      { status: 500, body: "captcha node" },
    ]);
    addRoute("shopee.com.br/search", {
      content: "<html><body>captcha verify you are human</body></html>",
      searchCards: [],
    });

    await expect(adapter.searchProducts("fone", address)).rejects.toMatchObject({
      code: "captcha",
      store: "shopee",
    });
  });

  it("deve extrair cards da Shopee via stealth", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    mockFetchResponses([
      { status: 500, body: { error: "api node" } },
      { status: 500, body: { error: "api browser" } },
      { status: 500, body: "html node unavailable" },
    ]);

    addRoute("shopee.com.br/search", {
      searchCards: [
        {
          url: "https://shopee.com.br/product-i.123.987",
          title: "Fone Turbo X",
          priceText: "R$ 279,90",
          imageUrl: "https://cf.shopee.com.br/file/fone-card.jpg",
        },
      ],
    });
    addRoute("product-i.123.987", {
      productDetails: {
        title: "Fone Turbo X",
        basePriceText: "R$ 249,90",
        imageUrl: "https://cf.shopee.com.br/file/fone.jpg",
        storeItemId: "123.987",
      },
    });

    const results = await adapter.searchProducts("fone", address);

    expect(results).toHaveLength(1);
    expect(results[0].store).toBe("shopee");
    expect(results[0].basePrice).toBe(279.9);
    expect(results[0].priceSource).toBe("listing");
    expect(results[0].productUrl).toBe("https://shopee.com.br/product-i.123.987");
    expect(results[0].imageUrl).toBe("https://cf.shopee.com.br/file/fone-card.jpg");
    expect(results[0].storeItemId).toBe("123.987");
  });

  it("deve descartar cards da Shopee sem link de produto ou apenas com parcelamento", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new ShopeeSearchAdapter(config, logger);
    mockFetchResponses([
      { status: 500, body: { error: "api node" } },
      { status: 500, body: { error: "api browser" } },
      { status: 500, body: "html node unavailable" },
    ]);

    addRoute("shopee.com.br/search", {
      searchCards: [
        {
          url: "https://shopee.com.br/mall",
          title: "Pagina institucional",
          priceText: "R$ 100,00",
        },
        {
          url: "https://shopee.com.br/product-i.123.111",
          title: "Fone Parcelado",
          priceText: "12x de R$ 20,00 sem juros",
        },
        {
          url: "https://shopee.com.br/fone-bluetooth-i.123.222",
          title: "Fone Valido",
          priceText: "R$ 199,90",
        },
      ],
    });

    const results = await adapter.searchProducts("fone", address);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      store: "shopee",
      storeItemId: "123.222",
      title: "Fone Valido",
      basePrice: 199.9,
      productUrl: "https://shopee.com.br/fone-bluetooth-i.123.222",
    });
  });

  it("deve respeitar SCRAPER_PRODUCT_CONCURRENCY ao abrir paginas de produto", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);
    const asins = ["B0TEST0101", "B0TEST0102", "B0TEST0103", "B0TEST0104", "B0TEST0105", "B0TEST0106"];

    addRoute("amazon.com.br/s?", {
      searchCards: asins.map((asin) => ({
        url: `/dp/${asin}`,
        title: `Produto ${asin}`,
      })),
    });

    for (const asin of asins) {
      addRoute(`/dp/${asin}`, {
        delayMs: 60,
        productDetails: {
          title: `Produto ${asin}`,
          basePriceText: "R$ 2.099,90",
          storeItemId: asin,
        },
      });
    }

    const results = await adapter.searchProducts("console", address);

    expect(results).toHaveLength(asins.length);
    expect(stealthState.maxActiveProductPages).toBeLessThanOrEqual(config.scraperProductConcurrency);
  });

  it("deve converter captcha da busca em ScraperError e fechar paginas", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      content: "<html><body>Please solve CAPTCHA to continue</body></html>",
      searchCards: [],
    });

    await expect(adapter.searchProducts("console", address)).rejects.toMatchObject({ code: "captcha" });
    expect(stealthState.createdPages.every((page) => page.closed)).toBe(true);
  });

  it("deve converter bloqueio da busca em ScraperError", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      content: "<html><body>Access denied</body></html>",
      searchCards: [],
    });

    await expect(adapter.searchProducts("console", address)).rejects.toMatchObject({ code: "blocked" });
  });

  it("deve converter timeout aguardando grid em ScraperError", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    const adapter = new AmazonSearchAdapter(config, logger);

    addRoute("amazon.com.br/s?", {
      waitError: new Error("Timeout 2000ms exceeded"),
      searchCards: [],
    });

    await expect(adapter.searchProducts("console", address)).rejects.toMatchObject({ code: "timeout" });
  });

  it("deve falhar rapido quando stealth estiver desabilitado por configuracao", async () => {
    const config = buildConfig();
    const logger = createLogger(config);
    process.env.SCRAPER_USE_HEADLESS_FALLBACK = "false";
    const disabledConfig = loadConfig();
    const adapter = new AmazonSearchAdapter(disabledConfig, logger);

    await expect(adapter.searchProducts("console", address)).rejects.toMatchObject({ code: "headless_error" });
    expect(stealthState.browser.withPage).not.toHaveBeenCalled();
  });
});
