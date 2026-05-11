import { URL } from "node:url";
import { load as loadHtml } from "cheerio";
import { CouponCandidate, ShippingOption } from "../types";
import { sanitizePrice } from "../../shared/utils";

const PRICE_REGEX = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[\.,]\d{2})?)/g;

export const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

export const toAbsoluteUrl = (value: string, baseUrl: string): string | null => {
  if (!value) return null;

  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const normalizePriceToken = (token: string): string => {
  const clean = token.replace(/[^\d.,-]/g, "");

  if (clean.includes(",") && clean.includes(".")) {
    return clean.replace(/\./g, "").replace(",", ".");
  }

  if (clean.includes(",")) {
    const parts = clean.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      return `${parts[0].replace(/\./g, "")}.${parts[1]}`;
    }
    return clean.replace(/,/g, "");
  }

  if (clean.includes(".")) {
    const parts = clean.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      return `${parts[0]}${parts[1]}`;
    }

    if (parts.length > 2) {
      const decimals = parts[parts.length - 1];
      const hasDecimals = decimals.length <= 2;

      if (hasDecimals) {
        const integers = parts.slice(0, -1);
        return `${integers.join("")}.${decimals}`;
      }

      return parts.join("");
    }

    return clean;
  }

  return clean;
};

const parseSinglePriceToken = (token: string): number | null => {
  const normalized = normalizePriceToken(token);
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return sanitizePrice(value);
};

const extractPriceTokens = (raw: string): Array<{ token: string; value: number; index: number }> => {
  const clean = normalizeWhitespace(raw);
  const regex = new RegExp(PRICE_REGEX.source, "gi");
  const tokens: Array<{ token: string; value: number; index: number }> = [];
  let match = regex.exec(clean);

  while (match) {
    const token = match[1] ?? match[0];
    const value = parseSinglePriceToken(token);

    if (value !== null) {
      tokens.push({
        token,
        value,
        index: match.index,
      });
    }

    match = regex.exec(clean);
  }

  return tokens;
};

export const parsePriceText = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ");
  const match = clean.match(PRICE_REGEX);
  if (!match || match.length === 0) return null;

  const last = match[match.length - 1];
  return parseSinglePriceToken(last);
};

export const parsePrimaryPriceText = (raw: string | null | undefined): number | null => {
  if (!raw) return null;

  const clean = normalizeWhitespace(raw);

  const reaisMatch = clean.match(/([\d.]+)\s*reais(?:\s*com\s*(\d{1,2})\s*centavos?)?/i);
  if (reaisMatch?.[1]) {
    const cents = reaisMatch[2] ? reaisMatch[2].padStart(2, "0") : "00";
    const parsed = parseSinglePriceToken(`${reaisMatch[1]},${cents}`);
    if (parsed !== null) return parsed;
  }

  const porMatch = clean.match(/\bpor\s*(?:apenas\s*)?(?:r\$\s*)?([\d.,]+)/i);
  if (porMatch?.[1]) {
    const parsed = parseSinglePriceToken(porMatch[1]);
    if (parsed !== null) return parsed;
  }

  const vistaMatch = clean.match(/(?:a|\u00E0)\s*vista\s*(?:de\s*)?(?:r\$\s*)?([\d.,]+)/i);
  if (vistaMatch?.[1]) {
    const parsed = parseSinglePriceToken(vistaMatch[1]);
    if (parsed !== null) return parsed;
  }

  const tokens = extractPriceTokens(clean);
  if (tokens.length === 0) return null;

  const installmentRegex = /\b\d{1,2}\s*x\s*(?:de\s*)?(?:r\$\s*)?([\d.,]+)/gi;
  const installmentRanges: Array<{ start: number; end: number }> = [];
  let installmentMatch = installmentRegex.exec(clean);

  while (installmentMatch) {
    installmentRanges.push({
      start: installmentMatch.index,
      end: installmentMatch.index + installmentMatch[0].length,
    });
    installmentMatch = installmentRegex.exec(clean);
  }

  const filtered = installmentRanges.length > 0
    ? tokens.filter((token) =>
        !installmentRanges.some((range) => token.index >= range.start && token.index < range.end),
      )
    : tokens;

  if (installmentRanges.length > 0 && filtered.length === 0) return null;

  const targetTokens = filtered.length > 0 ? filtered : tokens;

  if (/\b(parcelas?|x\s*de|sem\s+juros)\b/i.test(clean)) {
    return targetTokens.reduce((max, item) => (item.value > max ? item.value : max), targetTokens[0].value);
  }

  return targetTokens[targetTokens.length - 1].value;
};

export const parseJsonLd = (html: string): any[] => {
  const $ = loadHtml(html);
  const scripts = $("script[type='application/ld+json']");
  const all: any[] = [];

  scripts.each((_idx, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        all.push(...parsed);
        return;
      }
      all.push(parsed);
    } catch {
      // ignore malformed scripts
    }
  });

  return all;
};

const flattenGraph = (jsonLd: any[]): any[] => {
  const out: any[] = [];

  for (const item of jsonLd) {
    if (!item || typeof item !== "object") continue;
    out.push(item);
    if (Array.isArray(item["@graph"])) {
      out.push(...item["@graph"]);
    }
  }

  return out;
};

export const extractProductFromJsonLd = (html: string) => {
  const nodes = flattenGraph(parseJsonLd(html));
  const product = nodes.find((node) => {
    const type = String(node?.["@type"] ?? "").toLowerCase();
    return type.includes("product");
  });

  if (!product) return null;

  const offersRaw = product.offers;
  const offers = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;

  return {
    title: typeof product.name === "string" ? normalizeWhitespace(product.name) : null,
    sku: typeof product.sku === "string" ? normalizeWhitespace(product.sku) : null,
    gtin:
      typeof product.gtin13 === "string"
        ? normalizeWhitespace(product.gtin13)
        : typeof product.gtin === "string"
          ? normalizeWhitespace(product.gtin)
          : null,
    brand:
      typeof product.brand === "string"
        ? normalizeWhitespace(product.brand)
        : typeof product.brand?.name === "string"
          ? normalizeWhitespace(product.brand.name)
          : null,
    category: typeof product.category === "string" ? normalizeWhitespace(product.category) : null,
    basePrice:
      typeof offers?.price === "number"
        ? sanitizePrice(offers.price)
        : parsePrimaryPriceText(typeof offers?.price === "string" ? offers.price : null),
    referencePrice:
      typeof offers?.highPrice === "number"
        ? sanitizePrice(offers.highPrice)
        : parsePrimaryPriceText(typeof offers?.highPrice === "string" ? offers.highPrice : null),
  };
};

export const extractCouponsFromText = (html: string): CouponCandidate[] => {
  const $ = loadHtml(html);
  const candidates: CouponCandidate[] = [];

  $("[data-coupon-code], [class*='coupon'], [id*='coupon'], [class*='cupom'], [id*='cupom']").each(
    (_idx, el) => {
      const element = $(el);
      const code =
        element.attr("data-coupon-code") ||
        element.attr("data-code") ||
        element.find("[data-coupon-code], [data-code]").first().attr("data-coupon-code") ||
        element.text().match(/[A-Z0-9]{4,}/)?.[0] ||
        null;

      if (!code) return;

      const text = normalizeWhitespace(element.text());
      const percent = text.match(/(\d{1,2})\s*%/);
      const fixed = parsePriceText(text);

      candidates.push({
        name: `Cupom ${code}`,
        code,
        rules: text || "Regras do cupom nao informadas.",
        discountType: percent ? "percent" : "fixed",
        discountValue: percent ? Number(percent[1]) : fixed ?? 0,
        minOrderValue: null,
        isActive: true,
      });
    },
  );

  const unique = new Map<string, CouponCandidate>();
  for (const coupon of candidates) {
    unique.set(coupon.code, coupon);
  }

  return [...unique.values()];
};

export const extractShippingOptions = (html: string): ShippingOption[] => {
  const $ = loadHtml(html);
  const options: ShippingOption[] = [];

  $("[data-shipping-cost], [class*='shipping'], [class*='frete'], [id*='shipping'], [id*='frete']").each(
    (_idx, el) => {
      const element = $(el);
      const costText = element.attr("data-shipping-cost") ?? element.text();
      const cost = parsePriceText(costText);
      if (cost === null) return;

      const name =
        element.attr("data-shipping-name") ||
        element.attr("data-name") ||
        normalizeWhitespace(element.text()).slice(0, 60) ||
        "Frete";

      options.push({
        name,
        cost,
        etaDays: null,
      });
    },
  );

  const uniq = new Map<string, ShippingOption>();
  for (const option of options) {
    const key = `${option.name}|${option.cost}`;
    if (!uniq.has(key)) uniq.set(key, option);
  }

  return [...uniq.values()];
};

export const extractTaxAmount = (html: string): number | null => {
  const $ = loadHtml(html);
  const direct = $("[data-tax], [data-imposto], [class*='tax'], [class*='imposto']").first();

  if (direct.length > 0) {
    const raw = direct.attr("data-tax") || direct.attr("data-imposto") || direct.text();
    const parsed = parsePriceText(raw);
    if (parsed !== null) return parsed;
  }

  const text = normalizeWhitespace($.text());
  const segments = text.match(/(?:imposto|tax)[^\n\r]{0,40}/gi) ?? [];
  for (const segment of segments) {
    const parsed = parsePriceText(segment);
    if (parsed !== null) return parsed;
  }

  return null;
};

export const detectCaptchaHtml = (html: string): boolean => {
  const text = normalizeWhitespace(html).toLowerCase();
  return (
    text.includes("captcha") ||
    text.includes("verify you are human") ||
    text.includes("robot check")
  );
};

export const detectBlockedHtml = (html: string): boolean => {
  const text = normalizeWhitespace(html).toLowerCase();
  return (
    detectCaptchaHtml(html) ||
    text.includes("acesso negado") ||
    text.includes("access denied") ||
    text.includes("too many requests") ||
    text.includes("request blocked") ||
    text.includes("temporarily unavailable due to unusual traffic") ||
    text.includes("suspicious traffic")
  );
};
