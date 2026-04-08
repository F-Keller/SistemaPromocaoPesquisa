import { URL } from "node:url";
import { DealCandidate } from "../shared/types";
import { nowIso, sanitizePrice } from "../shared/utils";

export function appendQuery(urlRaw: string, key: string, value: string): string {
  const url = new URL(urlRaw);
  if (!url.searchParams.get(key)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function extractItems(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    if (Array.isArray(candidate.items)) return candidate.items as any[];
    if (Array.isArray(candidate.results)) return candidate.results as any[];
    if (Array.isArray(candidate.deals)) return candidate.deals as any[];
  }
  return [];
}

export function toCandidate(raw: any, fallbackPrefix: string, index: number): DealCandidate {
  const storeItemId = String(
    raw.id ?? raw.item_id ?? raw.itemId ?? `${fallbackPrefix}-${index + 1}`,
  );
  const current = sanitizePrice(
    Number(raw.current_price ?? raw.price ?? raw.sale_price ?? raw.offer_price ?? 0),
  );
  const reference = sanitizePrice(
    Number(raw.reference_price ?? raw.original_price ?? raw.list_price ?? 0),
  );

  return {
    storeItemId,
    title: String(raw.title ?? raw.name ?? `Oferta ${fallbackPrefix} ${index + 1}`),
    currentPrice: current,
    referencePrice: reference > 0 ? reference : null,
    productUrl: String(raw.url ?? raw.permalink ?? raw.product_url ?? "https://example.com"),
    category: raw.category ? String(raw.category) : null,
    capturedAt: nowIso(),
  };
}

export function mockCandidates(store: string): DealCandidate[] {
  const base = [
    {
      storeItemId: `${store}-tv-001`,
      title: `Smart TV 50 ${store}`,
      currentPrice: 1899.9,
      referencePrice: 2599.9,
      productUrl: `https://${store}.com/produto/tv-001`,
      category: "eletronicos",
      capturedAt: nowIso(),
    },
    {
      storeItemId: `${store}-fone-002`,
      title: `Fone Bluetooth ${store}`,
      currentPrice: 149.9,
      referencePrice: 249.9,
      productUrl: `https://${store}.com/produto/fone-002`,
      category: "acessorios",
      capturedAt: nowIso(),
    },
    {
      storeItemId: `${store}-cafe-003`,
      title: `Cafeteira ${store}`,
      currentPrice: 229.0,
      referencePrice: 349.0,
      productUrl: `https://${store}.com/produto/cafe-003`,
      category: "casa",
      capturedAt: nowIso(),
    },
  ];

  return base.map((item, idx) => ({
    ...item,
    currentPrice: sanitizePrice(item.currentPrice - idx * 5),
    referencePrice: sanitizePrice((item.referencePrice ?? item.currentPrice) + idx * 4),
  }));
}
