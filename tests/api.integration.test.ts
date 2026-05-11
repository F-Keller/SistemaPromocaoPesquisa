import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/api/createServer";
import { loadConfig } from "../src/config/env";
import { createLogger } from "../src/config/logger";
import { SearchRepository } from "../src/db/searchRepository";
import { SearchService } from "../src/search/searchService";
import { ScraperError, ScraperErrorCode } from "../src/search/scraping/types";
import {
  AddressInput,
  MarketplaceProductCandidate,
  MarketplaceSearchAdapter,
} from "../src/search/types";

class FakeAdapter implements MarketplaceSearchAdapter {
  public calls = 0;

  constructor(
    public readonly store: "amazon" | "mercadolivre" | "shopee",
    private readonly rows: MarketplaceProductCandidate[],
  ) {}

  async searchProducts(): Promise<MarketplaceProductCandidate[]> {
    this.calls += 1;
    return this.rows;
  }
}

const address: AddressInput = {
  street: "Rua Teste da Privacidade",
  number: "NUM-TESTE-77777",
  district: "Centro",
  city: "Sao Paulo",
  state: "SP",
  zipCode: "01000-000",
  complement: null,
};

const normalizeQueryForCache = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeZipForCache = (zipCode: string) => zipCode.replace(/\D/g, "");

const cacheKeyFor = (query: string, zipCode: string, cacheVersion: string): string =>
  crypto
    .createHash("sha256")
    .update(`${cacheVersion}|${normalizeQueryForCache(query)}|${normalizeZipForCache(zipCode)}`)
    .digest("hex");

function product(
  store: "amazon" | "mercadolivre" | "shopee",
  suffix: string,
  basePrice: number,
  shippingCost: number | null,
  taxAmount: number | null,
  imageUrl: string | null = null,
): MarketplaceProductCandidate {
  return {
    store,
    storeItemId: `${store}-${suffix}`,
    title: `Notebook Gamer ZX-${suffix}`,
    category: "eletronicos",
    imageUrl,
    productUrl: `https://${store}.example.com/item/${suffix}`,
    affiliateUrl: `https://${store}.example.com/item/${suffix}`,
    basePrice,
    referencePrice: basePrice + 300,
    sku: `ZX-${suffix}`,
    gtin: `7891234567${suffix.padStart(3, "0")}`,
    brand: "Marca Teste",
    model: `ZX-${suffix}`,
    coupons: [
      {
        name: "Cupom oficial",
        code: `OFF${suffix}`,
        rules: "Valido para primeira compra.",
        discountType: "percent",
        discountValue: 10,
        minOrderValue: 100,
        isActive: true,
      },
    ],
    shippingOptions:
      shippingCost === null
        ? []
        : [
            {
              name: "Economico",
              cost: shippingCost,
              etaDays: 7,
            },
          ],
    taxAmount,
    capturedAt: new Date().toISOString(),
  };
}

function productsForStore(
  store: "amazon" | "mercadolivre" | "shopee",
  start: number,
  count: number,
  basePrice: number,
): MarketplaceProductCandidate[] {
  return Array.from({ length: count }, (_item, index) => {
    const suffix = String(start + index).padStart(3, "0");
    return product(
      store,
      suffix,
      basePrice + index * 10,
      index % 2 === 0 ? 20 : null,
      index % 3 === 0 ? 30 : null,
    );
  });
}

async function pollCompleted(app: ReturnType<typeof createServer>, searchId: string) {
  for (let i = 0; i < 40; i += 1) {
    const response = await request(app).get(`/api/searches/${searchId}`);
    if (response.status === 200 && response.body.status === "completed") {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Busca nao concluiu no tempo esperado.");
}

describe("API integration", () => {
  let dbPath = "";
  let repository: SearchRepository;
  let app: ReturnType<typeof createServer>;
  let adapters: FakeAdapter[];

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `comparison-test-${Date.now()}-${Math.random()}.sqlite`);

    process.env.NODE_ENV = "test";
    process.env.DATABASE_PATH = dbPath;
    process.env.SEARCH_TTL_MINUTES = "120";
    process.env.SEARCH_MAX_RESULTS = "20";
    process.env.SEARCH_MAX_RESULTS_PER_STORE = "10";
    process.env.SCRAPER_CACHE_TTL_MINUTES = "10";

    const config = loadConfig();
    const logger = createLogger(config);

    repository = new SearchRepository(dbPath);
    repository.init();

    adapters = [
      new FakeAdapter("amazon", productsForStore("amazon", 1, 8, 2000)),
      new FakeAdapter("mercadolivre", productsForStore("mercadolivre", 101, 8, 1800)),
      new FakeAdapter("shopee", productsForStore("shopee", 201, 8, 1600)),
    ];

    const service = new SearchService(config, repository, adapters, logger);
    app = createServer({ config, logger, searchService: service });
  });

  afterEach(() => {
    repository.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("deve criar busca e retornar ate 20 resultados respeitando limite por loja", async () => {
    const createRes = await request(app).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    expect(createRes.status).toBe(202);
    expect(createRes.body.searchId).toBeTypeOf("string");

    const statusRes = await pollCompleted(app, createRes.body.searchId);

    expect(statusRes.body.status).toBe("completed");
    expect(statusRes.body.results.length).toBe(20);

    const results = statusRes.body.results as Array<{ store: string; verifiedPrice: number; totalFinal?: unknown }>;

    expect(results[0].verifiedPrice).toBeTypeOf("number");
    expect(Object.prototype.hasOwnProperty.call(results[0], "totalFinal")).toBe(false);
    expect(results.filter((item) => item.store === "amazon").length).toBeLessThanOrEqual(10);
    expect(results.filter((item) => item.store === "mercadolivre").length).toBeLessThanOrEqual(10);
    expect(results.filter((item) => item.store === "shopee").length).toBeLessThanOrEqual(10);
  });

  it("deve limitar resultado final a 10 itens por loja para Amazon e Mercado Livre", async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    const localAdapters = [
      new FakeAdapter("amazon", productsForStore("amazon", 1, 12, 1000)),
      new FakeAdapter("mercadolivre", productsForStore("mercadolivre", 101, 12, 2000)),
    ];
    const localService = new SearchService(config, repository, localAdapters, logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);
    const results = statusRes.body.results as Array<{ store: string }>;

    expect(results).toHaveLength(20);
    expect(results.filter((item) => item.store === "amazon")).toHaveLength(10);
    expect(results.filter((item) => item.store === "mercadolivre")).toHaveLength(10);
  });

  it("deve retornar ate 30 resultados com 10 por loja quando Shopee estiver habilitada", async () => {
    process.env.SEARCH_MAX_RESULTS = "30";
    process.env.SEARCH_MAX_RESULTS_PER_STORE = "10";
    const config = loadConfig();
    const logger = createLogger(config);
    const localAdapters = [
      new FakeAdapter("amazon", productsForStore("amazon", 1, 12, 1000)),
      new FakeAdapter("mercadolivre", productsForStore("mercadolivre", 101, 12, 2000)),
      new FakeAdapter("shopee", productsForStore("shopee", 201, 12, 1500)),
    ];
    const localService = new SearchService(config, repository, localAdapters, logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);
    const results = statusRes.body.results as Array<{ store: string }>;

    expect(results).toHaveLength(30);
    expect(results.filter((item) => item.store === "amazon")).toHaveLength(10);
    expect(results.filter((item) => item.store === "mercadolivre")).toHaveLength(10);
    expect(results.filter((item) => item.store === "shopee")).toHaveLength(10);
  });

  it("deve reinserir Mercado Livre quando foi coletado mas removido pelo matching normal", async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    const amazon = productsForStore("amazon", 1, 12, 1000).map((item, index) => ({
      ...item,
      title: `Fone Bluetooth Amazon ${index + 1}`,
    }));
    const mercadoLivre = productsForStore("mercadolivre", 101, 12, 2000).map((item, index) => ({
      ...item,
      title: `Produto generico Mercado Livre ${index + 1}`,
    }));
    const localAdapters = [
      new FakeAdapter("amazon", amazon),
      new FakeAdapter("mercadolivre", mercadoLivre),
    ];
    const localService = new SearchService(config, repository, localAdapters, logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Fone Bluetooth",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);
    const results = statusRes.body.results as Array<{ store: string; matchType: string; warnings: string[] }>;

    expect(results).toHaveLength(20);
    expect(results.filter((item) => item.store === "amazon")).toHaveLength(10);
    expect(results.filter((item) => item.store === "mercadolivre")).toHaveLength(10);
    expect(results.filter((item) => item.store === "mercadolivre").every((item) => item.matchType === "similar")).toBe(true);
    expect(
      results
        .filter((item) => item.store === "mercadolivre")
        .every((item) => item.warnings.includes("Correspondencia aproximada para o termo buscado.")),
    ).toBe(true);
  });

  it("deve retornar imageUrl nos resultados quando o produto possuir imagem", async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    const expectedImageUrl = "https://images.example.com/notebook-zx-901.jpg";

    const imageAdapter = new FakeAdapter("amazon", [
      product("amazon", "901", 1200, null, null, expectedImageUrl),
    ]);

    const localService = new SearchService(config, repository, [imageAdapter], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    expect(createRes.status).toBe(202);

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);

    expect(statusRes.body.results[0].imageUrl).toBe(expectedImageUrl);

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(`SELECT image_url FROM search_results WHERE search_id = ?`)
      .get(createRes.body.searchId) as { image_url: string } | undefined;
    db.close();

    expect(row?.image_url).toBe(expectedImageUrl);
  });

  it("deve enriquecer affiliateUrl e persistir productUrl original no payload", async () => {
    process.env.AMAZON_AFFILIATE_TAG = "teste-20";
    const config = loadConfig();
    const logger = createLogger(config);
    const originalUrl = "https://www.amazon.com.br/dp/B0AFFILIATE1?psc=1&tag=antiga-20";

    const affiliateAdapter = new FakeAdapter("amazon", [
      {
        ...product("amazon", "777", 1500, null, null),
        title: "Notebook Gamer ZX Affiliate",
        productUrl: originalUrl,
        affiliateUrl: originalUrl,
      },
    ]);

    const localService = new SearchService(config, repository, [affiliateAdapter], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX Affiliate",
      address,
    });

    expect(createRes.status).toBe(202);

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);
    expect(statusRes.body.results[0].productUrl).toBe(originalUrl);
    expect(statusRes.body.results[0].affiliateUrl).toBe(
      "https://www.amazon.com.br/dp/B0AFFILIATE1?psc=1&tag=teste-20",
    );

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(`SELECT affiliate_url, payload_json FROM search_results WHERE search_id = ?`)
      .get(createRes.body.searchId) as { affiliate_url: string; payload_json: string } | undefined;
    db.close();

    const payload = JSON.parse(String(row?.payload_json ?? "{}")) as {
      productUrl?: string;
      affiliateUrl?: string;
    };

    expect(row?.affiliate_url).toBe("https://www.amazon.com.br/dp/B0AFFILIATE1?psc=1&tag=teste-20");
    expect(payload.productUrl).toBe(originalUrl);
    expect(payload.affiliateUrl).toBe("https://www.amazon.com.br/dp/B0AFFILIATE1?psc=1&tag=teste-20");
  });

  it("deve expor resultado de fallback da listagem com warning sanitizado", async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    const fallbackAdapter = new FakeAdapter("amazon", [
      {
        ...product("amazon", "888", 1800, null, null),
        title: "Notebook Gamer ZX Fallback",
        priceSource: "listing",
      },
    ]);

    const localService = new SearchService(config, repository, [fallbackAdapter], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX Fallback",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);

    expect(statusRes.body.results).toHaveLength(1);
    expect(statusRes.body.results[0].warnings).toContain(
      "Preco extraido da listagem; validacao do produto foi bloqueada.",
    );

    const serialized = JSON.stringify(statusRes.body);
    expect(serialized).not.toContain("Playwright");
    expect(serialized).not.toContain("page.goto");
    expect(serialized).not.toContain("TimeoutError");
    expect(serialized).not.toContain("stack");
  });

  it("deve impedir preco suspeito do Mercado Livre antes do ranking e da persistencia", async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    const suspiciousMercadoLivre = {
      ...product("mercadolivre", "005", 5, null, null),
      title: "Notebook Gamer Mercado Livre Suspeito",
      priceSource: "listing" as const,
    };
    const validAmazon = product("amazon", "905", 2499.9, null, null);
    const localAdapters = [
      new FakeAdapter("mercadolivre", [suspiciousMercadoLivre]),
      new FakeAdapter("amazon", [validAmazon]),
    ];
    const localService = new SearchService(config, repository, localAdapters, logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);

    expect(statusRes.body.results).toHaveLength(1);
    expect(statusRes.body.results[0]).toMatchObject({
      store: "amazon",
      verifiedPrice: 2499.9,
    });
    expect(JSON.stringify(statusRes.body)).not.toContain('"verifiedPrice":5');

    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(`SELECT store, base_price, total_final, payload_json FROM search_results WHERE search_id = ?`)
      .all(createRes.body.searchId) as Array<{
        store: string;
        base_price: number;
        total_final: number;
        payload_json: string;
      }>;
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0].store).toBe("amazon");
    expect(rows[0].base_price).toBe(2499.9);
    expect(rows[0].total_final).toBe(2499.9);
    expect(JSON.parse(rows[0].payload_json)).toMatchObject({
      verifiedPrice: 2499.9,
    });
  });

  it("nao deve expor rotas antigas de deals", async () => {
    const response = await request(app).get("/deals/pending");
    expect(response.status).toBe(404);
  });

  it("deve servir logos das lojas", async () => {
    const response = await request(app).get("/assets/store-logos/Amazon_icon.png");

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("image/png");

    const mercadoLivreResponse = await request(app).get("/assets/store-logos/Logotipo_MercadoLivre.png");
    expect(mercadoLivreResponse.status).toBe(200);
    expect(String(mercadoLivreResponse.headers["content-type"])).toContain("image/png");
  });

  it("deve servir a moeda local da animacao", async () => {
    const response = await request(app).get("/assets/imgs/moeda1real-removebg-preview.png");

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("image/png");
  });

  it("deve servir a logo do garimpei", async () => {
    const response = await request(app).get("/assets/imgs/garimpei-logo.png");

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("image/png");
  });

  it("nao deve persistir endereco completo na tabela de buscas", async () => {
    const createRes = await request(app).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    expect(createRes.status).toBe(202);
    const searchId = createRes.body.searchId as string;

    await pollCompleted(app, searchId);

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(`SELECT id, query, status, stage, audit_json, error_message FROM searches WHERE id = ?`)
      .get(searchId) as Record<string, unknown>;
    db.close();

    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(address.street);
    expect(serialized).not.toContain(address.number);
    expect(serialized).not.toContain(address.zipCode);
  });

  it("deve gravar cache por query+CEP sem dados de endereco completo", async () => {
    const first = await request(app).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });
    await pollCompleted(app, first.body.searchId);

    const beforeCalls = adapters.reduce((sum, item) => sum + item.calls, 0);
    const secondAddress: AddressInput = {
      ...address,
      street: "Avenida Privada Diferente",
      number: "NUM-SEGUNDO-99999",
      complement: "Apto 123",
    };

    const second = await request(app).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address: secondAddress,
    });
    await pollCompleted(app, second.body.searchId);

    const afterCalls = adapters.reduce((sum, item) => sum + item.calls, 0);
    expect(afterCalls).toBe(beforeCalls);

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(`SELECT payload_json FROM search_cache LIMIT 1`)
      .get() as { payload_json: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.payload_json).not.toContain(address.street);
    expect(row?.payload_json).not.toContain(address.number);
    expect(row?.payload_json).not.toContain(secondAddress.street);
    expect(row?.payload_json).not.toContain(secondAddress.number);
    expect(row?.payload_json).not.toContain(String(secondAddress.complement));
    expect(row?.payload_json).not.toContain(address.zipCode);
  });

  it("deve ignorar e atualizar cache quando forceRefresh for enviado", async () => {
    const first = await request(app).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });
    await pollCompleted(app, first.body.searchId);

    const beforeCalls = adapters.reduce((sum, item) => sum + item.calls, 0);

    const second = await request(app).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
      forceRefresh: true,
    });
    await pollCompleted(app, second.body.searchId);

    const afterCalls = adapters.reduce((sum, item) => sum + item.calls, 0);
    expect(afterCalls).toBeGreaterThan(beforeCalls);

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare(`SELECT COUNT(*) AS total FROM search_cache`).get() as { total: number };
    db.close();

    expect(row.total).toBe(1);
  });

  it("nao deve reutilizar cache legado que contenha apenas Amazon quando Mercado Livre esta habilitado", async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    const query = "Notebook Gamer ZX";
    const cacheKey = cacheKeyFor(query, address.zipCode, config.searchCacheVersion);
    repository.upsertCachedSearch(
      cacheKey,
      {
        createdAt: new Date().toISOString(),
        audit: {
          totalCandidates: 1,
          matchedCandidates: 1,
          enrichedCandidates: 1,
          completeCandidates: 1,
          incompleteCandidates: 0,
          stores: [
            {
              store: "amazon",
              fetched: 1,
              errors: [],
            },
          ],
        },
        results: [
          {
            rank: 1,
            store: "amazon",
            storeItemId: "amazon-cache",
            title: "Notebook Gamer ZX Cache",
            imageUrl: null,
            productUrl: "https://amazon.example.com/cache",
            affiliateUrl: "https://amazon.example.com/cache",
            verifiedPrice: 1000,
            matchType: "exact",
            matchScore: 1,
            warnings: [],
          },
        ],
      },
      10,
    );
    const localAdapters = [
      new FakeAdapter("amazon", productsForStore("amazon", 1, 2, 1000)),
      new FakeAdapter("mercadolivre", productsForStore("mercadolivre", 101, 2, 2000)),
    ];
    const localService = new SearchService(config, repository, localAdapters, logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query,
      address,
    });
    const statusRes = await pollCompleted(localApp, createRes.body.searchId);
    const results = statusRes.body.results as Array<{ store: string }>;

    expect(localAdapters[0].calls).toBe(1);
    expect(localAdapters[1].calls).toBe(1);
    expect(results.some((item) => item.store === "amazon")).toBe(true);
    expect(results.some((item) => item.store === "mercadolivre")).toBe(true);
  });

  it("nao deve reutilizar cache sem Shopee quando Shopee esta habilitada", async () => {
    process.env.SEARCH_MAX_RESULTS = "30";
    const config = loadConfig();
    const logger = createLogger(config);
    const query = "Notebook Gamer ZX";
    const cacheKey = cacheKeyFor(query, address.zipCode, config.searchCacheVersion);
    repository.upsertCachedSearch(
      cacheKey,
      {
        createdAt: new Date().toISOString(),
        audit: {
          totalCandidates: 2,
          matchedCandidates: 2,
          enrichedCandidates: 2,
          completeCandidates: 2,
          incompleteCandidates: 0,
          stores: [
            { store: "amazon", fetched: 1, errors: [] },
            { store: "mercadolivre", fetched: 1, errors: [] },
          ],
        },
        results: [
          {
            rank: 1,
            store: "amazon",
            storeItemId: "amazon-cache",
            title: "Notebook Gamer ZX Cache Amazon",
            imageUrl: null,
            productUrl: "https://amazon.example.com/cache",
            affiliateUrl: "https://amazon.example.com/cache",
            verifiedPrice: 1000,
            matchType: "exact",
            matchScore: 1,
            warnings: [],
          },
          {
            rank: 2,
            store: "mercadolivre",
            storeItemId: "ml-cache",
            title: "Notebook Gamer ZX Cache ML",
            imageUrl: null,
            productUrl: "https://mercadolivre.example.com/cache",
            affiliateUrl: "https://mercadolivre.example.com/cache",
            verifiedPrice: 1200,
            matchType: "exact",
            matchScore: 1,
            warnings: [],
          },
        ],
      },
      10,
    );
    const localAdapters = [
      new FakeAdapter("amazon", productsForStore("amazon", 1, 2, 1000)),
      new FakeAdapter("mercadolivre", productsForStore("mercadolivre", 101, 2, 2000)),
      new FakeAdapter("shopee", productsForStore("shopee", 201, 2, 1500)),
    ];
    const localService = new SearchService(config, repository, localAdapters, logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query,
      address,
    });
    const statusRes = await pollCompleted(localApp, createRes.body.searchId);
    const results = statusRes.body.results as Array<{ store: string }>;

    expect(localAdapters.every((adapter) => adapter.calls === 1)).toBe(true);
    expect(results.some((item) => item.store === "amazon")).toBe(true);
    expect(results.some((item) => item.store === "mercadolivre")).toBe(true);
    expect(results.some((item) => item.store === "shopee")).toBe(true);
  });

  it("nao deve gravar cache quando Mercado Livre falha e apenas Amazon retorna", async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    const amazonAdapter = new FakeAdapter("amazon", productsForStore("amazon", 1, 2, 1000));
    const mercadoLivreAdapter: MarketplaceSearchAdapter = {
      store: "mercadolivre",
      async searchProducts() {
        throw new ScraperError("timeout", "Timeout ML", "mercadolivre");
      },
    };
    const localService = new SearchService(config, repository, [amazonAdapter, mercadoLivreAdapter], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });
    const statusRes = await pollCompleted(localApp, createRes.body.searchId);

    expect(statusRes.body.results.every((item: { store: string }) => item.store === "amazon")).toBe(true);

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare(`SELECT COUNT(*) AS total FROM search_cache`).get() as { total: number };
    db.close();

    expect(row.total).toBe(0);
  });

  it("deve retornar mensagem generica durante polling em andamento", async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    let resolveProducts: (items: MarketplaceProductCandidate[]) => void = () => undefined;
    const pendingProducts = new Promise<MarketplaceProductCandidate[]>((resolve) => {
      resolveProducts = resolve;
    });

    const slowAdapter: MarketplaceSearchAdapter = {
      store: "amazon",
      async searchProducts() {
        return pendingProducts;
      },
    };

    const localService = new SearchService(config, repository, [slowAdapter], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    const pollingRes = await request(localApp).get(`/api/searches/${createRes.body.searchId}`);
    expect(["queued", "running"]).toContain(pollingRes.body.status);
    expect(pollingRes.body.errorMessage).toBe("Analisando ofertas...");

    resolveProducts([product("amazon", "701", 2400, 20, null)]);
    const completedRes = await pollCompleted(localApp, createRes.body.searchId);
    expect(completedRes.body.errorMessage).toBeNull();
  });

  it.each([
    ["blocked", "Scraping bloqueado pela loja."],
    ["captcha", "Captcha detectado pela loja."],
    ["headless_error", "Browser stealth indisponivel."],
    ["timeout", "Tempo esgotado ao consultar a loja."],
    ["empty_result", "Nenhum card de produto encontrado."],
    ["parse_error", "Cards encontrados, mas nenhum produto foi validado."],
  ] as Array<[ScraperErrorCode, string]>)("deve exibir diagnostico sanitizado em development (%s)", async (code, message) => {
    process.env.NODE_ENV = "development";
    const config = loadConfig();
    const logger = createLogger(config);
    const rawMessage = "Playwright TimeoutError: page.goto request blocked at chromium stack";

    const failingAdapter: MarketplaceSearchAdapter = {
      store: "amazon",
      async searchProducts() {
        throw new ScraperError(code, rawMessage, "amazon");
      },
    };

    const localService = new SearchService(config, repository, [failingAdapter], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);

    const serialized = JSON.stringify(statusRes.body);
    expect(serialized).not.toContain("Playwright");
    expect(serialized).not.toContain("page.goto");
    expect(serialized).not.toContain("TimeoutError");
    expect(serialized).not.toContain("request blocked");

    const failedStore = (statusRes.body.audit.stores as Array<{ store: string; errors: string[] }>).find(
      (item) => item.store === "amazon",
    );
    expect(failedStore?.errors).toEqual([message]);
  });

  it("deve exibir diagnostico especifico quando Shopee estiver bloqueada por captcha em development", async () => {
    process.env.NODE_ENV = "development";
    const config = loadConfig();
    const logger = createLogger(config);
    const rawMessage = "Playwright TimeoutError: page.goto captcha challenge at chromium stack";

    const failingAdapter: MarketplaceSearchAdapter = {
      store: "shopee",
      async searchProducts() {
        throw new ScraperError("captcha", rawMessage, "shopee");
      },
    };

    const okAdapter: MarketplaceSearchAdapter = {
      store: "amazon",
      async searchProducts() {
        return [product("amazon", "901", 1200, null, null)];
      },
    };

    const localService = new SearchService(config, repository, [okAdapter, failingAdapter], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);

    const serialized = JSON.stringify(statusRes.body);
    expect(serialized).not.toContain("Playwright");
    expect(serialized).not.toContain("page.goto");
    expect(serialized).not.toContain("TimeoutError");

    const failedStore = (statusRes.body.audit.stores as Array<{ store: string; errors: string[] }>).find(
      (item) => item.store === "shopee",
    );
    expect(failedStore?.errors).toEqual([
      "Shopee bloqueada por captcha. Configure PROXY_URL ou SHOPEE_FEED_URL para estabilidade.",
    ]);
  });

  it.each([
    "blocked",
    "captcha",
    "headless_error",
    "empty_result",
    "parse_error",
    "timeout",
  ] as ScraperErrorCode[])("deve silenciar falha esperada de scraping em production (%s)", async (code) => {
    process.env.NODE_ENV = "production";
    const config = loadConfig();
    const logger = createLogger(config);
    const rawMessage = "Playwright TimeoutError: page.goto request blocked at chromium stack";

    const failingAdapter: MarketplaceSearchAdapter = {
      store: "amazon",
      async searchProducts() {
        throw new ScraperError(code, rawMessage, "amazon");
      },
    };

    const okAdapter1: MarketplaceSearchAdapter = {
      store: "mercadolivre",
      async searchProducts() {
        return [product("mercadolivre", "501", 3000, 20, 40)];
      },
    };

    const okAdapter2: MarketplaceSearchAdapter = {
      store: "shopee",
      async searchProducts() {
        return [product("shopee", "601", 2900, 18, 38)];
      },
    };

    const localService = new SearchService(config, repository, [failingAdapter, okAdapter1, okAdapter2], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);

    expect(statusRes.body.status).toBe("completed");
    expect(statusRes.body.results.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(statusRes.body);
    expect(serialized).not.toContain("Playwright");
    expect(serialized).not.toContain("page.goto");
    expect(serialized).not.toContain("TimeoutError");
    expect(serialized).not.toContain("request blocked");

    const failedStore = (statusRes.body.audit.stores as Array<{ store: string; errors: string[] }>).find(
      (item) => item.store === "amazon",
    );
    expect(failedStore?.errors).toEqual([]);
  });
});

