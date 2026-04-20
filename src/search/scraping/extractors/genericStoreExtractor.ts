import { URL } from "node:url";
import { load as loadHtml } from "cheerio";
import { AddressInput, CouponCandidate, ShippingOption } from "../../types";
import {
  detectBlockedHtml,
  extractCouponsFromText,
  extractProductFromJsonLd,
  extractShippingOptions,
  extractTaxAmount,
  normalizeWhitespace,
  parsePrimaryPriceText,
  parsePriceText,
  toAbsoluteUrl,
} from "../parserUtils";
import { ScrapedProductDetails, SearchCandidateLink, StoreScraperExtractor } from "../types";

interface GenericExtractorOptions {
  store: StoreScraperExtractor["store"];
  searchUrlTemplate: string;
  searchLinkSelectors: string[];
  titleSelectors: string[];
  priceSelectors: string[];
  referencePriceSelectors: string[];
  skuSelectors: string[];
  brandSelectors: string[];
  modelSelectors: string[];
  categorySelectors: string[];
  couponSelectors: string[];
  shippingSelectors: string[];
  taxSelectors: string[];
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export class GenericStoreExtractor implements StoreScraperExtractor {
  readonly store: StoreScraperExtractor["store"];
  readonly searchUrlTemplate: string;

  private readonly searchLinkSelectors: string[];
  private readonly titleSelectors: string[];
  private readonly priceSelectors: string[];
  private readonly referencePriceSelectors: string[];
  private readonly skuSelectors: string[];
  private readonly brandSelectors: string[];
  private readonly modelSelectors: string[];
  private readonly categorySelectors: string[];
  private readonly couponSelectors: string[];
  private readonly shippingSelectors: string[];
  private readonly taxSelectors: string[];

  constructor(options: GenericExtractorOptions) {
    this.store = options.store;
    this.searchUrlTemplate = options.searchUrlTemplate;
    this.searchLinkSelectors = options.searchLinkSelectors;
    this.titleSelectors = options.titleSelectors;
    this.priceSelectors = options.priceSelectors;
    this.referencePriceSelectors = options.referencePriceSelectors;
    this.skuSelectors = options.skuSelectors;
    this.brandSelectors = options.brandSelectors;
    this.modelSelectors = options.modelSelectors;
    this.categorySelectors = options.categorySelectors;
    this.couponSelectors = options.couponSelectors;
    this.shippingSelectors = options.shippingSelectors;
    this.taxSelectors = options.taxSelectors;
  }

  buildSearchUrl(query: string): string {
    const encoded = encodeURIComponent(query.trim());
    return this.searchUrlTemplate.replaceAll("{query}", encoded);
  }

  extractSearchCandidates(html: string, searchUrl: string): SearchCandidateLink[] {
    if (detectBlockedHtml(html)) return [];

    const $ = loadHtml(html);
    const links: SearchCandidateLink[] = [];

    for (const selector of this.searchLinkSelectors) {
      $(selector).each((_idx, element) => {
        const anchor = $(element);
        const href = this.extractHref(anchor);
        if (!href) return;

        const normalizedUrl = this.normalizeCandidateUrl(href, searchUrl);
        if (!normalizedUrl) return;

        const title = normalizeWhitespace(anchor.text() || anchor.attr("title") || "") || null;
        const contextText = anchor.closest("article, li, div").text();
        const priceHint = parsePrimaryPriceText(contextText) ?? parsePriceText(contextText);

        links.push({
          url: normalizedUrl,
          title,
          basePriceHint: priceHint,
          referencePriceHint: null,
          storeItemIdHint: null,
        });
      });

      if (links.length > 0) break;
    }

    const unique = new Map<string, SearchCandidateLink>();
    for (const link of links) {
      if (!unique.has(link.url)) unique.set(link.url, link);
    }

    return [...unique.values()];
  }

  extractProductDetails(html: string, productUrl: string, _address: AddressInput): ScrapedProductDetails | null {
    if (detectBlockedHtml(html)) return null;

    const $ = loadHtml(html);
    const jsonLd = extractProductFromJsonLd(html);

    const pickText = (selectors: string[]): string | null => {
      for (const selector of selectors) {
        const value = normalizeWhitespace($(selector).first().text());
        if (value) return value;
      }
      return null;
    };

    const title = jsonLd?.title ?? pickText(this.titleSelectors);

    const metaPrice = parsePrimaryPriceText(
      $("meta[itemprop='price']").attr("content") ||
      $("meta[property='product:price:amount']").attr("content") ||
      null,
    );

    const metaReferencePrice = parsePrimaryPriceText(
      $("meta[property='product:price:standard_amount']").attr("content") ||
      null,
    );

    const basePrice =
      jsonLd?.basePrice ??
      metaPrice ??
      (() => {
        for (const selector of this.priceSelectors) {
          const text = $(selector).first().text();
          const parsed = parsePrimaryPriceText(text) ?? parsePriceText(text);
          if (parsed !== null) return parsed;
        }
        return null;
      })();

    if (!title || basePrice === null || !Number.isFinite(basePrice) || basePrice <= 0) return null;

    const referencePrice =
      jsonLd?.referencePrice ??
      metaReferencePrice ??
      (() => {
        for (const selector of this.referencePriceSelectors) {
          const text = $(selector).first().text();
          const parsed = parsePrimaryPriceText(text) ?? parsePriceText(text);
          if (parsed !== null) return parsed;
        }
        return null;
      })();

    const sku = jsonLd?.sku ?? pickText(this.skuSelectors);
    const brand = jsonLd?.brand ?? pickText(this.brandSelectors);
    const model = pickText(this.modelSelectors);
    const category = jsonLd?.category ?? pickText(this.categorySelectors);

    const coupons: CouponCandidate[] = [
      ...extractCouponsFromText(html),
      ...this.extractCouponsFromSelectors($),
    ];

    const shippingOptions: ShippingOption[] = [
      ...extractShippingOptions(html),
      ...this.extractShippingFromSelectors($),
    ];

    const taxAmount =
      (() => {
        for (const selector of this.taxSelectors) {
          const parsed = parsePriceText($(selector).first().text());
          if (parsed !== null) return parsed;
        }
        return extractTaxAmount(html);
      })() ?? null;

    return {
      title,
      storeItemId: this.extractStoreItemId(productUrl),
      category,
      basePrice,
      referencePrice,
      sku,
      gtin: jsonLd?.gtin ?? null,
      brand,
      model,
      coupons,
      shippingOptions,
      taxAmount,
    };
  }

  private extractHref(anchor: any): string | null {
    const attrs = [
      "href",
      "data-href",
      "data-url",
      "data-link",
      "data-item-url",
    ];

    for (const attr of attrs) {
      const value = anchor.attr(attr);
      if (value && value.trim()) return value.trim();
    }

    const childHref = anchor.find("a").first().attr("href");
    return childHref?.trim() || null;
  }

  private normalizeCandidateUrl(rawHref: string, searchUrl: string): string | null {
    const absolute = toAbsoluteUrl(rawHref, searchUrl);
    if (!absolute) return null;

    let url: URL;
    try {
      url = new URL(absolute);
    } catch {
      return null;
    }

    const host = url.hostname.toLowerCase();

    if (host.includes("amazon.") && url.pathname.startsWith("/sspa/click")) {
      const target = url.searchParams.get("url");
      if (!target) return null;
      const decoded = safeDecode(target);
      const resolved = toAbsoluteUrl(decoded, `${url.protocol}//${url.hostname}`);
      if (!resolved) return null;
      return this.cleanProductUrl(resolved);
    }

    if (host.startsWith("click1.mercadolivre")) {
      const target =
        url.searchParams.get("url") ||
        url.searchParams.get("target") ||
        url.searchParams.get("redirect");
      if (!target) return null;
      const decoded = safeDecode(target);
      const resolved = toAbsoluteUrl(decoded, "https://www.mercadolivre.com.br");
      if (!resolved) return null;
      return this.cleanProductUrl(resolved);
    }

    return this.cleanProductUrl(absolute);
  }

  private cleanProductUrl(raw: string): string | null {
    try {
      const url = new URL(raw);
      url.hash = "";

      const host = url.hostname.toLowerCase();

      if (host.includes("amazon.")) {
        const dpMatch = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
        if (dpMatch) {
          url.pathname = `/dp/${dpMatch[1]}`;
          url.search = "";
          return url.toString();
        }

        const gpMatch = url.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
        if (gpMatch) {
          url.pathname = `/gp/product/${gpMatch[1]}`;
          url.search = "";
          return url.toString();
        }
      }

      if (host.includes("mercadolivre.")) {
        if (host.startsWith("click1.mercadolivre")) return null;
        url.search = "";
        return url.toString();
      }

      if (host.includes("shopee.")) {
        url.search = "";
        return url.toString();
      }

      return url.toString();
    } catch {
      return null;
    }
  }

  private extractStoreItemId(productUrl: string): string | null {
    const match = productUrl.match(/\/([A-Z0-9]{8,15})(?:[/?]|$)/i);
    return match ? match[1] : null;
  }

  private extractCouponsFromSelectors($: ReturnType<typeof loadHtml>): CouponCandidate[] {
    const coupons: CouponCandidate[] = [];

    for (const selector of this.couponSelectors) {
      $(selector).each((_idx, element) => {
        const text = normalizeWhitespace($(element).text());
        if (!text) return;

        const code = text.match(/[A-Z0-9]{4,}/)?.[0] ?? null;
        if (!code) return;

        const percent = text.match(/(\d{1,2})\s*%/);
        const fixed = parsePriceText(text);

        coupons.push({
          name: `Cupom ${code}`,
          code,
          rules: text,
          discountType: percent ? "percent" : "fixed",
          discountValue: percent ? Number(percent[1]) : fixed ?? 0,
          minOrderValue: null,
          isActive: true,
        });
      });
    }

    const uniq = new Map<string, CouponCandidate>();
    for (const coupon of coupons) uniq.set(coupon.code, coupon);
    return [...uniq.values()];
  }

  private extractShippingFromSelectors($: ReturnType<typeof loadHtml>): ShippingOption[] {
    const options: ShippingOption[] = [];

    for (const selector of this.shippingSelectors) {
      $(selector).each((_idx, element) => {
        const text = normalizeWhitespace($(element).text());
        if (!text) return;

        const cost = parsePriceText(text);
        if (cost === null) return;

        options.push({
          name: text.slice(0, 60),
          cost,
          etaDays: null,
        });
      });
    }

    const uniq = new Map<string, ShippingOption>();
    for (const item of options) {
      const key = `${item.name}|${item.cost}`;
      if (!uniq.has(key)) uniq.set(key, item);
    }

    return [...uniq.values()];
  }
}
