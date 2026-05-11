import { AddressInput, CouponCandidate, MarketplaceName, ShippingOption } from "../types";

export type ScraperErrorCode =
  | "timeout"
  | "captcha"
  | "blocked"
  | "parse_error"
  | "network_error"
  | "headless_error"
  | "empty_result";

export class ScraperError extends Error {
  constructor(
    public readonly code: ScraperErrorCode,
    message: string,
    public readonly store?: MarketplaceName,
  ) {
    super(message);
    this.name = "ScraperError";
  }
}

export interface ScraperFetchResult {
  url: string;
  html: string;
  blocked: boolean;
  statusCode?: number;
}

export interface SearchCandidateLink {
  url: string;
  title?: string | null;
  imageUrlHint?: string | null;
  basePriceHint?: number | null;
  referencePriceHint?: number | null;
  storeItemIdHint?: string | null;
}

export interface ScrapedProductDetails {
  storeItemId?: string | null;
  title?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  basePrice?: number | null;
  referencePrice?: number | null;
  sku?: string | null;
  gtin?: string | null;
  brand?: string | null;
  model?: string | null;
  coupons?: CouponCandidate[];
  shippingOptions?: ShippingOption[];
  taxAmount?: number | null;
}

export interface StoreScraperExtractor {
  readonly store: MarketplaceName;
  readonly searchUrlTemplate: string;
  buildSearchUrl(query: string): string;
  extractSearchCandidates(html: string, searchUrl: string): SearchCandidateLink[];
  extractProductDetails(html: string, productUrl: string, address: AddressInput): ScrapedProductDetails | null;
}
