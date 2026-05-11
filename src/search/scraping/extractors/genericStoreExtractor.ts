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
  imageSelectors?: string[];
  couponSelectors: string[];
  shippingSelectors: string[];
  taxSelectors: string[];
}

const IMAGE_ATTRIBUTES = [
  "src",
  "data-src",
  "data-image",
  "data-original",
  "data-lazy",
  "data-zoom",
  "data-hires",
  "data-old-hires",
  "srcset",
  "data-srcset",
  "data-a-dynamic-image",
];

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
  private readonly imageSelectors: string[];
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
    this.imageSelectors = options.imageSelectors ?? [];
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
        const priceHint = this.extractSearchPriceHint($, anchor);

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
      this.extractPriceFromSelectors($, this.priceSelectors);

    if (!title || basePrice === null || !Number.isFinite(basePrice) || basePrice <= 0) return null;

    const referencePrice =
      jsonLd?.referencePrice ??
      metaReferencePrice ??
      this.extractPriceFromSelectors($, this.referencePriceSelectors, undefined, {
        skipReference: false,
      });

    const sku = jsonLd?.sku ?? pickText(this.skuSelectors);
    const brand = jsonLd?.brand ?? pickText(this.brandSelectors);
    const model = pickText(this.modelSelectors);
    const category = jsonLd?.category ?? pickText(this.categorySelectors);
    const imageUrl = this.extractImageUrl($, productUrl);

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
      imageUrl,
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

  private extractSearchPriceHint($: ReturnType<typeof loadHtml>, anchor: any): number | null {
    const context = anchor.closest("article, li, div");
    const scope = context.length > 0 ? context : anchor;

    if (this.store === "amazon" || this.store === "mercadolivre") {
      return this.extractPriceFromSelectors($, this.priceSelectors, scope);
    }

    const contextText = scope.text();
    return parsePrimaryPriceText(contextText) ?? parsePriceText(contextText);
  }

  private extractPriceFromSelectors(
    $: ReturnType<typeof loadHtml>,
    selectors: string[],
    scope?: any,
    options: { skipReference?: boolean } = {},
  ): number | null {
    const root = scope ?? $.root();
    const skipReference = options.skipReference ?? true;

    for (const selector of selectors) {
      const elements = this.findElements($, root, selector);

      for (const element of elements) {
        const node = $(element);
        if (this.shouldSkipPriceElement($, node, root, skipReference)) continue;

        const text = this.readPriceTextFromElement(node);
        if (!text || this.isInstallmentText(text)) continue;

        const parsed = parsePrimaryPriceText(text) ?? parsePriceText(text);
        if (parsed !== null) return parsed;
      }
    }

    return null;
  }

  private findElements($: ReturnType<typeof loadHtml>, scope: any, selector: string): any[] {
    const elements: any[] = [];

    try {
      if (scope.is?.(selector)) {
        elements.push(scope.get(0));
      }
    } catch {
      // Ignore invalid selector matches from third-party markup.
    }

    try {
      elements.push(...scope.find(selector).toArray());
    } catch {
      elements.push(...$(selector).toArray());
    }

    return elements.filter(Boolean);
  }

  private shouldSkipPriceElement(
    $: ReturnType<typeof loadHtml>,
    node: any,
    scope: any,
    skipReference: boolean,
  ): boolean {
    if (this.store === "amazon") {
      return skipReference && node.closest(".a-text-price").length > 0;
    }

    if (this.store !== "mercadolivre") {
      return false;
    }

    if (
      skipReference &&
      node.closest(
        ".andes-money-amount--previous, .andes-money-amount--strike, .andes-money-amount--discount, s, del, [class*='previous'], [class*='old-price'], [class*='original']",
      ).length > 0
    ) {
      return true;
    }

    const contexts = [
      node,
      node.closest(".poly-price__installments"),
      node.closest(".ui-search-installments"),
      node.parent(),
      node.parent().parent(),
    ];

    for (const context of contexts) {
      if (!context || context.length === 0) continue;
      const text = normalizeWhitespace(context.text() || "");
      const amountCount = context.find(".andes-money-amount").length;
      if (this.isInstallmentText(text) && amountCount <= 1) return true;
    }

    const scopedText = normalizeWhitespace(scope.text?.() || "");
    return this.isInstallmentText(scopedText) && scope.find?.(".andes-money-amount").length <= 1;
  }

  private readPriceTextFromElement(node: any): string | null {
    if (this.store === "mercadolivre") {
      const amount = node.is(".andes-money-amount") ? node : node.closest(".andes-money-amount");
      if (amount.length > 0) {
        const fraction = normalizeWhitespace(amount.find(".andes-money-amount__fraction").first().text() || "");
        const cents = normalizeWhitespace(amount.find(".andes-money-amount__cents").first().text() || "");
        if (fraction) return cents ? `R$ ${fraction},${cents}` : `R$ ${fraction},00`;

        const aria = normalizeWhitespace(amount.attr("aria-label") || "");
        if (aria) return aria;
      }
    }

    const text = normalizeWhitespace(
      node.text() ||
      node.attr("aria-label") ||
      node.attr("title") ||
      node.attr("content") ||
      node.attr("value") ||
      "",
    );

    return text || null;
  }

  private isInstallmentText(value: string | null | undefined): boolean {
    return /\b\d{1,2}\s*x\b|\bem\s+\d{1,2}\s*x\b|\bparcel|sem\s+juros/i.test(String(value ?? ""));
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

  private extractImageUrl($: ReturnType<typeof loadHtml>, productUrl: string): string | null {
    for (const selector of this.imageSelectors) {
      const elements = $(selector).toArray();

      for (const element of elements) {
        const image = this.extractImageFromElement($(element), productUrl);
        if (image) return image;
      }
    }

    return null;
  }

  private extractImageFromElement(element: any, productUrl: string): string | null {
    for (const attr of IMAGE_ATTRIBUTES) {
      const raw = element.attr(attr);
      if (!raw) continue;

      const image =
        attr === "srcset" || attr === "data-srcset"
          ? this.normalizeImageUrl(this.pickBestSrcSetUrl(raw), productUrl)
          : attr === "data-a-dynamic-image"
            ? this.normalizeImageUrl(this.pickBestDynamicImageUrl(raw), productUrl)
            : this.normalizeImageUrl(raw, productUrl);

      if (image) return image;
    }

    return null;
  }

  private normalizeImageUrl(raw: string | null, productUrl: string): string | null {
    if (!raw) return null;

    const clean = normalizeWhitespace(raw)
      .replace(/^url\(["']?/, "")
      .replace(/["']?\)$/, "");

    if (this.isInvalidImageUrl(clean)) return null;
    return toAbsoluteUrl(clean, productUrl);
  }

  private pickBestSrcSetUrl(raw: string): string | null {
    const candidates = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item, index) => {
        const [url, descriptor] = item.split(/\s+/);
        const numeric = Number.parseFloat(descriptor ?? "");
        const score = Number.isFinite(numeric) ? numeric : index;
        return { url, score };
      })
      .filter((item) => item.url);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].url;
  }

  private pickBestDynamicImageUrl(raw: string): string | null {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidates = Object.entries(parsed)
        .map(([url, dimensions]) => {
          const [width, height] = Array.isArray(dimensions) ? dimensions : [];
          const score = Number(width ?? 0) * Number(height ?? 0);
          return { url, score: Number.isFinite(score) ? score : 0 };
        })
        .filter((item) => item.url);

      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].url;
    } catch {
      return null;
    }
  }

  private isInvalidImageUrl(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return (
      normalized.length === 0 ||
      normalized === "#" ||
      normalized === "about:blank" ||
      normalized.startsWith("data:") ||
      normalized.includes("placeholder") ||
      normalized.includes("transparent") ||
      normalized.includes("spacer") ||
      normalized.includes("pixel.gif") ||
      normalized.includes("no-image")
    );
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
