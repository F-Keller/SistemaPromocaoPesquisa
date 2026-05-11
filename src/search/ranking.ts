import { MatchInfo } from "./matching";
import { toMoney } from "./pricing";
import { MarketplaceProductCandidate, RankedSearchResult } from "./types";

const LISTING_FALLBACK_WARNING = "Preco extraido da listagem; validacao do produto foi bloqueada.";

function toRankedSearchResult(
  item: MarketplaceProductCandidate & MatchInfo,
  rank: number,
): RankedSearchResult {
  const warnings = [
    ...(item.matchType === "similar" ? ["Correspondencia aproximada para o termo buscado."] : []),
    ...(item.priceSource === "listing" ? [LISTING_FALLBACK_WARNING] : []),
  ];

  return {
    rank,
    store: item.store,
    storeItemId: item.storeItemId,
    title: item.title,
    imageUrl: item.imageUrl ?? null,
    productUrl: item.productUrl,
    affiliateUrl: item.affiliateUrl,
    verifiedPrice: toMoney(item.basePrice),
    matchType: item.matchType,
    matchScore: item.matchScore,
    warnings,
  };
}

export function rankResults(
  matched: Array<MarketplaceProductCandidate & MatchInfo>,
  maxResults = 20,
  maxResultsPerStore = maxResults,
): RankedSearchResult[] {
  const perStoreCount = new Map<string, number>();
  const top: Array<MarketplaceProductCandidate & MatchInfo> = [];

  for (const item of [...matched].sort((a, b) => {
      if (a.basePrice !== b.basePrice) return a.basePrice - b.basePrice;
      if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      return a.title.localeCompare(b.title);
    })) {
    const currentCount = perStoreCount.get(item.store) ?? 0;
    if (currentCount >= maxResultsPerStore) continue;

    top.push(item);
    perStoreCount.set(item.store, currentCount + 1);

    if (top.length >= maxResults) break;
  }

  return top.map((item, index) => toRankedSearchResult(item, index + 1));
}
