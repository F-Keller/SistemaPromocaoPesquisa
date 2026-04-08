import { MatchInfo } from "./matching";
import { chooseBestCoupon, chooseLowestShipping, evaluateCoupons, toMoney } from "./pricing";
import { MarketplaceProductCandidate, RankedSearchResult } from "./types";

interface EnrichedCandidate extends MarketplaceProductCandidate, MatchInfo {
  couponsEvaluated: ReturnType<typeof evaluateCoupons>;
  appliedCoupon: ReturnType<typeof chooseBestCoupon>;
  priceAfterCoupon: number;
  selectedShipping: ReturnType<typeof chooseLowestShipping>;
  taxAmountNormalized: number | null;
  totalFinal: number | null;
  partialTotal: number;
  isCostComplete: boolean;
  warnings: string[];
}

export function enrichCandidate(candidate: MarketplaceProductCandidate & MatchInfo): EnrichedCandidate {
  const couponsEvaluated = evaluateCoupons(candidate.basePrice, candidate.coupons);
  const appliedCoupon = chooseBestCoupon(couponsEvaluated);
  const priceAfterCoupon = toMoney(appliedCoupon?.finalPriceIfApplied ?? candidate.basePrice);
  const selectedShipping = chooseLowestShipping(candidate.shippingOptions);

  const rawTaxAmount = candidate.taxAmount;
  const taxAmountNormalized =
    rawTaxAmount === null || rawTaxAmount === undefined || !Number.isFinite(rawTaxAmount)
      ? null
      : toMoney(rawTaxAmount);

  const shippingCost = selectedShipping?.cost ?? null;
  const isCostComplete = shippingCost !== null && taxAmountNormalized !== null;
  const totalFinal = isCostComplete
    ? toMoney(priceAfterCoupon + Number(shippingCost) + Number(taxAmountNormalized))
    : null;

  const partialTotal = toMoney(priceAfterCoupon + (shippingCost ?? 0) + (taxAmountNormalized ?? 0));

  const warnings: string[] = [];
  if (selectedShipping === null) warnings.push("Frete indisponivel para o endereco informado.");
  if (taxAmountNormalized === null) warnings.push("Imposto indisponivel para o endereco informado.");

  return {
    ...candidate,
    couponsEvaluated,
    appliedCoupon,
    priceAfterCoupon,
    selectedShipping,
    taxAmountNormalized,
    totalFinal,
    partialTotal,
    isCostComplete,
    warnings,
  };
}

function toRankedSearchResult(item: EnrichedCandidate, rank: number): RankedSearchResult {
  return {
    rank,
    store: item.store,
    storeItemId: item.storeItemId,
    title: item.title,
    category: item.category ?? null,
    productUrl: item.productUrl,
    affiliateUrl: item.affiliateUrl,
    basePrice: toMoney(item.basePrice),
    referencePrice: item.referencePrice ?? null,
    appliedCoupon: item.appliedCoupon,
    coupons: item.couponsEvaluated,
    selectedShipping: item.selectedShipping,
    taxAmount: item.taxAmountNormalized,
    totalFinal: item.totalFinal,
    isCostComplete: item.isCostComplete,
    matchType: item.matchType,
    matchScore: item.matchScore,
    warnings: item.warnings,
  };
}

export function rankResults(
  matched: Array<MarketplaceProductCandidate & MatchInfo>,
  maxResults = 10,
): RankedSearchResult[] {
  const enriched = matched.map(enrichCandidate);

  const complete = enriched
    .filter((item) => item.isCostComplete)
    .sort((a, b) => {
      if (a.totalFinal !== b.totalFinal) return Number(a.totalFinal) - Number(b.totalFinal);
      if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      return a.basePrice - b.basePrice;
    });

  const incomplete = enriched
    .filter((item) => !item.isCostComplete)
    .sort((a, b) => {
      if (a.partialTotal !== b.partialTotal) return a.partialTotal - b.partialTotal;
      if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      return a.basePrice - b.basePrice;
    });

  const top = [...complete, ...incomplete].slice(0, maxResults);
  return top.map((item, index) => toRankedSearchResult(item, index + 1));
}