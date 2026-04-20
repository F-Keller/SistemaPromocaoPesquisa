import fs from "node:fs";
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

function product(
  store: "amazon" | "mercadolivre" | "shopee",
  suffix: string,
  basePrice: number,
  shippingCost: number | null,
  taxAmount: number | null,
): MarketplaceProductCandidate {
  return {
    store,
    storeItemId: `${store}-${suffix}`,
    title: `Notebook Gamer ZX-${suffix}`,
    category: "eletronicos",
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
    process.env.SEARCH_MAX_RESULTS = "10";
    process.env.SCRAPER_CACHE_TTL_MINUTES = "10";

    const config = loadConfig();
    const logger = createLogger(config);

    repository = new SearchRepository(dbPath);
    repository.init();

    adapters = [
      new FakeAdapter("amazon", [
        product("amazon", "001", 2000, 20, 30),
        product("amazon", "002", 2200, 30, 35),
        product("amazon", "003", 1900, 25, 28),
        product("amazon", "004", 2150, 22, 29),
      ]),
      new FakeAdapter("mercadolivre", [
        product("mercadolivre", "101", 2100, 18, 27),
        product("mercadolivre", "102", 1990, 26, 30),
        product("mercadolivre", "103", 1750, null, 24),
        product("mercadolivre", "104", 1800, null, null),
      ]),
      new FakeAdapter("shopee", [
        product("shopee", "201", 1980, 14, 22),
        product("shopee", "202", 1700, 15, null),
        product("shopee", "203", 1690, 12, null),
        product("shopee", "204", 1650, null, null),
      ]),
    ];

    const service = new SearchService(config, repository, adapters, logger);
    app = createServer({ config, logger, searchService: service });
  });

  afterEach(() => {
    repository.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("deve criar busca e retornar top 10 ordenado por menor preco verificado", async () => {
    const createRes = await request(app).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    expect(createRes.status).toBe(202);
    expect(createRes.body.searchId).toBeTypeOf("string");

    const statusRes = await pollCompleted(app, createRes.body.searchId);

    expect(statusRes.body.status).toBe("completed");
    expect(statusRes.body.results.length).toBe(10);

    const results = statusRes.body.results as Array<{ verifiedPrice: number; totalFinal?: unknown }>;

    for (let i = 1; i < results.length; i += 1) {
      expect(results[i].verifiedPrice).toBeGreaterThanOrEqual(results[i - 1].verifiedPrice);
    }

    expect(results[0].verifiedPrice).toBeTypeOf("number");
    expect(Object.prototype.hasOwnProperty.call(results[0], "totalFinal")).toBe(false);
  });

  it("nao deve expor rotas antigas de deals", async () => {
    const response = await request(app).get("/deals/pending");
    expect(response.status).toBe(404);
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

    const second = await request(app).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
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
    expect(row?.payload_json).not.toContain(address.zipCode);
  });
  it("deve continuar busca quando uma loja falha por timeout", async () => {
    const config = loadConfig();
    const logger = createLogger(config);

    const timeoutAdapter: MarketplaceSearchAdapter = {
      store: "amazon",
      async searchProducts() {
        throw new Error("timeout");
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

    const localService = new SearchService(config, repository, [timeoutAdapter, okAdapter1, okAdapter2], logger);
    const localApp = createServer({ config, logger, searchService: localService });

    const createRes = await request(localApp).post("/api/searches").send({
      query: "Notebook Gamer ZX",
      address,
    });

    const statusRes = await pollCompleted(localApp, createRes.body.searchId);

    expect(statusRes.body.status).toBe("completed");
    expect(statusRes.body.results.length).toBeGreaterThan(0);

    const timeoutStore = (statusRes.body.audit.stores as Array<{ store: string; errors: string[] }>).find(
      (item) => item.store === "amazon",
    );
    expect(timeoutStore?.errors.length).toBeGreaterThan(0);
  });
});

