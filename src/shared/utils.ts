import crypto from "node:crypto";

export const nowIso = (): string => new Date().toISOString();

export const sanitizePrice = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Number(value.toFixed(2))) : 0;

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export const computeDiscountPercent = (
  currentPrice: number,
  referencePrice?: number | null,
): number => {
  if (!referencePrice || referencePrice <= 0 || currentPrice <= 0) return 0;
  const discount = ((referencePrice - currentPrice) / referencePrice) * 100;
  return Number(Math.max(0, discount).toFixed(2));
};

export const buildDedupHash = (
  store: string,
  storeItemId: string,
  currentPrice: number,
): string => {
  const priceBand = Math.floor(currentPrice / 50);
  const raw = `${store}|${storeItemId}|${priceBand}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
};

export const buildShortLink = (baseUrl: string, dealId: string, groupId: string): string => {
  const encodedGroup = encodeURIComponent(groupId);
  return `${baseUrl.replace(/\/$/, "")}/r/${dealId}?g=${encodedGroup}`;
};

export const hashIp = (ipAddress: string): string =>
  crypto.createHash("sha256").update(ipAddress).digest("hex").slice(0, 16);

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
