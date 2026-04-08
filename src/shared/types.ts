export type StoreName = "amazon" | "mercadolivre" | "shopee";

export interface DealCandidate {
  storeItemId: string;
  title: string;
  currentPrice: number;
  referencePrice?: number | null;
  productUrl: string;
  category?: string | null;
  capturedAt: string;
}

export interface DealNormalized extends DealCandidate {
  id: string;
  store: StoreName;
  affiliateUrl: string;
  discountPercent: number;
  score: number;
  dedupHash: string;
  status: DealStatus;
  createdAt: string;
  updatedAt: string;
}

export type DealStatus = "pending" | "approved" | "rejected" | "sent" | "failed";

export type BroadcastStatus = "queued" | "sent" | "failed" | "retrying";

export interface BroadcastMessage {
  dealId: string;
  groupId: string;
  messageText: string;
  status: BroadcastStatus;
  attempts: number;
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
  isTest: boolean;
}

export interface StoreAdapter {
  readonly store: StoreName;
  collectDeals(): Promise<DealCandidate[]>;
  buildAffiliateLink(productUrl: string, storeItemId: string): Promise<string>;
}

export interface SenderStatus {
  ready: boolean;
  mode: "console" | "web";
  detail: string;
  lastUpdatedAt: string;
}

export interface MessageSender {
  initialize(): Promise<void>;
  sendMessage(groupId: string, message: string): Promise<void>;
  getStatus(): SenderStatus;
}

export interface StatsSummary {
  totalCollected: number;
  pending: number;
  approved: number;
  sent: number;
  failed: number;
  clicks: number;
  ctrByStore: Array<{
    store: string;
    sent: number;
    clicks: number;
    ctrPercent: number;
  }>;
  topDeals: Array<{
    dealId: string;
    title: string;
    store: string;
    clicks: number;
  }>;
  clicksByHour: Array<{
    hour: number;
    clicks: number;
  }>;
}
