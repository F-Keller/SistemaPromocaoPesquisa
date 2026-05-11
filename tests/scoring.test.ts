import { describe, expect, it } from "vitest";
import { chooseBestCoupon, chooseLowestShipping, evaluateCoupons } from "../src/search/pricing";
import { rankResults } from "../src/search/ranking";
import { MarketplaceProductCandidate } from "../src/search/types";

function buildCandidate(
  overrides: Partial<MarketplaceProductCandidate> & { storeItemId: string; basePrice: number },
) {
  const base: MarketplaceProductCandidate = {
    store: "amazon",
    storeItemId: overrides.storeItemId,
    title: `Produto ${overrides.storeItemId}`,
    category: "teste",
    productUrl: "https://example.com/produto",
    affiliateUrl: "https://example.com/produto?tag=abc",
    basePrice: overrides.basePrice,
    referencePrice: overrides.referencePrice ?? null,
    sku: overrides.sku ?? null,
    gtin: overrides.gtin ?? null,
    brand: overrides.brand ?? null,
    model: overrides.model ?? null,
    coupons: overrides.coupons ?? [],
    shippingOptions: overrides.shippingOptions ?? [],
    taxAmount: overrides.taxAmount ?? null,
    capturedAt: overrides.capturedAt ?? new Date().toISOString(),
  };

  return {
    ...base,
    ...overrides,
  };
}

describe("pricing helpers", () => {
  it("deve escolher automaticamente o melhor cupom elegivel", () => {
    const coupons = evaluateCoupons(200, [
      {
        name: "Cupom 10%",
        code: "P10",
        rules: "Sem regra",
        discountType: "percent",
        discountValue: 10,
        isActive: true,
      },
      {
        name: "Cupom fixo 15",
        code: "F15",
        rules: "Sem regra",
        discountType: "fixed",
        discountValue: 15,
        isActive: true,
      },
    ]);

    const best = chooseBestCoupon(coupons);
    expect(best?.code).toBe("P10");
    expect(best?.finalPriceIfApplied).toBe(180);
  });

  it("deve selecionar o menor frete", () => {
    const shipping = chooseLowestShipping([
      { name: "Economico", cost: 29.9, etaDays: 9 },
      { name: "Expresso", cost: 39.9, etaDays: 2 },
      { name: "Retirada", cost: 0, etaDays: 1 },
    ]);

    expect(shipping?.name).toBe("Retirada");
    expect(shipping?.cost).toBe(0);
  });
});

describe("ranking", () => {
  it("deve ordenar por menor preco verificado", () => {
    const expensive = {
      ...buildCandidate({
        storeItemId: "a",
        basePrice: 100,
      }),
      matchType: "exact" as const,
      matchScore: 0.95,
    };

    const cheap = {
      ...buildCandidate({
        storeItemId: "b",
        basePrice: 90,
      }),
      matchType: "exact" as const,
      matchScore: 0.9,
    };

    const veryCheapSimilar = {
      ...buildCandidate({
        storeItemId: "c",
        basePrice: 20,
      }),
      matchType: "similar" as const,
      matchScore: 0.5,
    };

    const ranked = rankResults([expensive, cheap, veryCheapSimilar], 10);

    expect(ranked[0].storeItemId).toBe("c");
    expect(ranked[1].storeItemId).toBe("b");
    expect(ranked[2].storeItemId).toBe("a");
    expect(ranked[0].verifiedPrice).toBe(20);
    expect(ranked[0].warnings.length).toBeGreaterThan(0);
  });

  it("deve priorizar preco menor mesmo quando o match for similar", () => {
    const expensiveExact = {
      ...buildCandidate({
        storeItemId: "exacto-caro",
        basePrice: 500,
      }),
      matchType: "exact" as const,
      matchScore: 1,
    };

    const cheapSimilar = {
      ...buildCandidate({
        storeItemId: "similar-barato",
        basePrice: 100,
      }),
      matchType: "similar" as const,
      matchScore: 0.4,
    };

    const ranked = rankResults([expensiveExact, cheapSimilar]);

    expect(ranked[0].storeItemId).toBe("similar-barato");
    expect(ranked[0].verifiedPrice).toBe(100);
    expect(ranked[1].storeItemId).toBe("exacto-caro");
  });

  it("deve avisar quando preco veio da listagem por bloqueio na pagina do produto", () => {
    const listingFallback = {
      ...buildCandidate({
        storeItemId: "grid-fallback",
        basePrice: 300,
        priceSource: "listing",
      }),
      matchType: "exact" as const,
      matchScore: 0.98,
    };

    const ranked = rankResults([listingFallback], 10);

    expect(ranked[0].warnings).toContain(
      "Preco extraido da listagem; validacao do produto foi bloqueada.",
    );
  });

  it("deve retornar no maximo 20 resultados por padrao", () => {
    const candidates = Array.from({ length: 25 }, (_item, index) => ({
      ...buildCandidate({
        storeItemId: `produto-${index}`,
        basePrice: 1000 - index,
      }),
      matchType: "exact" as const,
      matchScore: 0.9,
    }));

    const ranked = rankResults(candidates);

    expect(ranked.length).toBe(20);
    expect(ranked[0].verifiedPrice).toBe(976);
    expect(ranked[19].verifiedPrice).toBe(995);
  });

  it("deve limitar resultados por loja quando configurado", () => {
    const amazon = Array.from({ length: 15 }, (_item, index) => ({
      ...buildCandidate({
        storeItemId: `amazon-${index}`,
        basePrice: 100 + index,
      }),
      store: "amazon" as const,
      matchType: "exact" as const,
      matchScore: 0.95,
    }));
    const mercadoLivre = Array.from({ length: 15 }, (_item, index) => ({
      ...buildCandidate({
        storeItemId: `ml-${index}`,
        basePrice: 1000 + index,
      }),
      store: "mercadolivre" as const,
      matchType: "exact" as const,
      matchScore: 0.95,
    }));

    const ranked = rankResults([...amazon, ...mercadoLivre], 20, 10);

    expect(ranked).toHaveLength(20);
    expect(ranked.filter((item) => item.store === "amazon")).toHaveLength(10);
    expect(ranked.filter((item) => item.store === "mercadolivre")).toHaveLength(10);
  });
});
