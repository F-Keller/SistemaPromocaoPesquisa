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
  it("deve ordenar completos primeiro e incompletos no final", () => {
    const completeExpensive = {
      ...buildCandidate({
        storeItemId: "a",
        basePrice: 100,
        coupons: [],
        shippingOptions: [{ name: "Frete", cost: 20 }],
        taxAmount: 20,
      }),
      matchType: "exact" as const,
      matchScore: 0.95,
    };

    const completeCheap = {
      ...buildCandidate({
        storeItemId: "b",
        basePrice: 90,
        coupons: [],
        shippingOptions: [{ name: "Frete", cost: 10 }],
        taxAmount: 10,
      }),
      matchType: "exact" as const,
      matchScore: 0.9,
    };

    const incompleteVeryCheap = {
      ...buildCandidate({
        storeItemId: "c",
        basePrice: 20,
        coupons: [],
        shippingOptions: [],
        taxAmount: null,
      }),
      matchType: "exact" as const,
      matchScore: 0.99,
    };

    const ranked = rankResults([completeExpensive, completeCheap, incompleteVeryCheap], 10);

    expect(ranked[0].storeItemId).toBe("b");
    expect(ranked[1].storeItemId).toBe("a");
    expect(ranked[2].storeItemId).toBe("c");
    expect(ranked[2].isCostComplete).toBe(false);
  });
});