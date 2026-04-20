export type MarketplaceName = "amazon" | "mercadolivre" | "shopee";

export type SearchStatus = "queued" | "running" | "completed" | "failed";

export type SearchStage =
  | "queued"
  | "collecting"
  | "matching"
  | "enriching"
  | "ranking"
  | "completed"
  | "failed";

export interface AddressInput {
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
  complement?: string | null;
}

export interface SearchInput {
  query: string;
  address: AddressInput;
}

export interface CouponCandidate {
  name: string;
  code: string;
  rules: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minOrderValue?: number | null;
  isActive: boolean;
  expiresAt?: string | null;
}

export interface ShippingOption {
  name: string;
  cost: number;
  etaDays?: number | null;
}

export interface MarketplaceProductCandidate {
  store: MarketplaceName;
  storeItemId: string;
  title: string;
  category?: string | null;
  productUrl: string;
  affiliateUrl: string;
  basePrice: number;
  referencePrice?: number | null;
  sku?: string | null;
  gtin?: string | null;
  brand?: string | null;
  model?: string | null;
  coupons: CouponCandidate[];
  shippingOptions: ShippingOption[];
  taxAmount?: number | null;
  capturedAt: string;
}

export interface CouponEvaluation {
  name: string;
  code: string;
  rules: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minOrderValue?: number | null;
  isEligible: boolean;
  isActive: boolean;
  discountAmount: number;
  finalPriceIfApplied: number;
}

export interface RankedSearchResult {
  rank: number;
  store: MarketplaceName;
  storeItemId: string;
  title: string;
  productUrl: string;
  affiliateUrl: string;
  verifiedPrice: number;
  matchType: "exact" | "similar";
  matchScore: number;
  warnings: string[];
}

export interface SearchAudit {
  totalCandidates: number;
  matchedCandidates: number;
  enrichedCandidates: number;
  completeCandidates: number;
  incompleteCandidates: number;
  stores: Array<{
    store: MarketplaceName;
    fetched: number;
    errors: string[];
  }>;
}

export interface SearchSnapshot {
  id: string;
  query: string;
  status: SearchStatus;
  stage: SearchStage;
  progressPercent: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  expiresAt: string;
  audit: SearchAudit;
  results: RankedSearchResult[];
}

export interface SearchProgressUpdate {
  status?: SearchStatus;
  stage?: SearchStage;
  progressPercent?: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  audit?: SearchAudit;
}

export interface MarketplaceSearchAdapter {
  readonly store: MarketplaceName;
  searchProducts(query: string, address: AddressInput): Promise<MarketplaceProductCandidate[]>;
}
