import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SearchRepository } from "../src/db/searchRepository";

describe("search cache", () => {
  let dbPath = "";
  let repository: SearchRepository;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `search-cache-${Date.now()}-${Math.random()}.sqlite`);
    repository = new SearchRepository(dbPath);
    repository.init();
  });

  afterEach(() => {
    repository.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("deve salvar e recuperar cache por chave", () => {
    repository.upsertCachedSearch(
      "cache-key-1",
      {
        createdAt: new Date().toISOString(),
        audit: {
          totalCandidates: 3,
          matchedCandidates: 2,
          enrichedCandidates: 2,
          completeCandidates: 1,
          incompleteCandidates: 1,
          stores: [
            {
              store: "amazon",
              fetched: 2,
              errors: [],
            },
          ],
        },
        results: [
          {
            rank: 1,
            store: "amazon",
            storeItemId: "abc",
            title: "Produto",
            category: "x",
            productUrl: "https://example.com/p",
            affiliateUrl: "https://example.com/p",
            basePrice: 100,
            referencePrice: 120,
            appliedCoupon: null,
            coupons: [],
            selectedShipping: null,
            taxAmount: null,
            totalFinal: null,
            isCostComplete: false,
            matchType: "exact",
            matchScore: 0.9,
            warnings: [],
          },
        ],
      },
      10,
    );

    const cached = repository.getCachedSearch("cache-key-1");

    expect(cached).not.toBeNull();
    expect(cached?.results.length).toBe(1);
    expect(cached?.audit.totalCandidates).toBe(3);
  });

  it("deve expirar cache vencido", () => {
    repository.upsertCachedSearch(
      "cache-key-2",
      {
        createdAt: new Date().toISOString(),
        audit: {
          totalCandidates: 0,
          matchedCandidates: 0,
          enrichedCandidates: 0,
          completeCandidates: 0,
          incompleteCandidates: 0,
          stores: [],
        },
        results: [],
      },
      1,
    );

    const future = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const cached = repository.getCachedSearch("cache-key-2", future);

    expect(cached).toBeNull();
  });
});