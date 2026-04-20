import { MatchInfo } from "./matching";
import { toMoney } from "./pricing";
import { MarketplaceProductCandidate, RankedSearchResult } from "./types";

function toRankedSearchResult(
  item: MarketplaceProductCandidate & MatchInfo,
  rank: number,
): RankedSearchResult {
  const warnings = item.matchType === "similar"
    ? ["Correspondencia aproximada para o termo buscado."]
    : [];

  return {
    rank,
    store: item.store,
    storeItemId: item.storeItemId,
    title: item.title,
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
  maxResults = 10,
): RankedSearchResult[] {
  const top = [...matched]
    .sort((a, b) => {
      if (a.basePrice !== b.basePrice) return a.basePrice - b.basePrice;
      if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      return a.title.localeCompare(b.title);
    })
    .slice(0, maxResults);

  return top.map((item, index) => toRankedSearchResult(item, index + 1));
}
