import { MarketplaceProductCandidate } from "./types";

const stripDiacritics = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const tokenize = (value: string): string[] =>
  stripDiacritics(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

const extractIdentifiers = (value: string): string[] => {
  const matches = value.toUpperCase().match(/[A-Z0-9-]{4,}/g) ?? [];
  return [...new Set(matches.map((item) => item.trim()).filter((item) => item.length >= 4))];
};

export interface MatchInfo {
  matchType: "exact" | "similar";
  matchScore: number;
}

export function scoreCandidate(query: string, candidate: MarketplaceProductCandidate): MatchInfo | null {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return null;

  const title = stripDiacritics(candidate.title);
  const tokenHits = queryTokens.filter((token) => title.includes(token)).length;
  const coverage = tokenHits / queryTokens.length;

  const queryNormalized = stripDiacritics(query);
  const identifiers = [candidate.sku, candidate.gtin, candidate.model]
    .filter(Boolean)
    .map((value) => stripDiacritics(String(value)));
  const queryIds = extractIdentifiers(query);

  const identifierInQuery = identifiers.some((identifier) =>
    identifier ? queryNormalized.includes(identifier) : false,
  );
  const identifierExact = identifiers.some((identifier) =>
    identifier ? queryIds.some((queryId) => stripDiacritics(queryId) === identifier) : false,
  );

  const queryAsPhraseMatch = title.includes(queryNormalized);

  const exactByCoverage = coverage >= 0.85 && queryTokens.length >= 2;
  const exactByIdentifier = identifierInQuery || identifierExact;

  const isExact = exactByCoverage || exactByIdentifier;
  const isSimilar = isExact || coverage >= 0.35 || queryAsPhraseMatch;

  if (!isSimilar) return null;

  let matchScore = coverage * 0.75;
  if (queryAsPhraseMatch) matchScore += 0.1;
  if (identifierInQuery) matchScore += 0.2;
  if (identifierExact) matchScore += 0.25;
  if (isExact) matchScore += 0.15;

  matchScore = Math.min(1, Number(matchScore.toFixed(4)));

  return {
    matchType: isExact ? "exact" : "similar",
    matchScore,
  };
}

export function selectMatchingPool(
  query: string,
  candidates: MarketplaceProductCandidate[],
): Array<MarketplaceProductCandidate & MatchInfo> {
  const scored = candidates
    .map((candidate) => {
      const match = scoreCandidate(query, candidate);
      if (!match) return null;
      return {
        ...candidate,
        ...match,
      };
    })
    .filter((item): item is MarketplaceProductCandidate & MatchInfo => item !== null)
    .sort((a, b) => {
      if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      return a.basePrice - b.basePrice;
    });

  const exact = scored.filter((item) => item.matchType === "exact");
  if (exact.length === 0) return scored;

  const similarFallback = scored.filter((item) => item.matchType === "similar");
  return [...exact, ...similarFallback];
}