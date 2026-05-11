import { AppConfig } from "../config/env";
import { MarketplaceName } from "./types";

export class AffiliateService {
  constructor(private readonly config: AppConfig) {}

  buildAffiliateUrl(store: MarketplaceName, productUrl: string): string {
    switch (store) {
      case "amazon":
        return this.buildAmazonUrl(productUrl);
      case "mercadolivre":
        return this.buildMercadoLivreUrl(productUrl);
      case "shopee":
        return this.buildShopeeUrl(productUrl);
      default:
        return productUrl;
    }
  }

  private buildAmazonUrl(productUrl: string): string {
    const tag = this.config.store.amazon.affiliateTag.trim();
    if (!tag) return productUrl;

    return this.appendOrReplaceQuery(productUrl, "tag", tag);
  }

  private buildMercadoLivreUrl(productUrl: string): string {
    const affiliateId = this.config.store.mercadolivre.affiliateId.trim();
    if (!affiliateId) return productUrl;

    const template = this.config.store.mercadolivre.affiliateUrlTemplate.trim();
    if (template) {
      return this.applyTemplate(template, productUrl, affiliateId);
    }

    return this.appendOrReplaceQuery(productUrl, "matt_tool", affiliateId);
  }

  private buildShopeeUrl(productUrl: string): string {
    const affiliateId = this.config.store.shopee.affiliateId.trim();
    if (!affiliateId) return productUrl;

    const template = this.config.store.shopee.affiliateUrlTemplate.trim();
    if (template) {
      return this.applyTemplate(template, productUrl, affiliateId);
    }

    return this.appendOrReplaceQuery(productUrl, "af_siteid", affiliateId);
  }

  private appendOrReplaceQuery(productUrl: string, key: string, value: string): string {
    try {
      const url = new URL(productUrl);
      url.searchParams.set(key, value);
      return url.toString();
    } catch {
      return productUrl;
    }
  }

  private applyTemplate(template: string, productUrl: string, affiliateId: string): string {
    try {
      return template
        .replaceAll("{url}", encodeURIComponent(productUrl))
        .replaceAll("{affiliateId}", encodeURIComponent(affiliateId));
    } catch {
      return productUrl;
    }
  }
}
