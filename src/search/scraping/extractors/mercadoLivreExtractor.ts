import { GenericStoreExtractor } from "./genericStoreExtractor";

export function createMercadoLivreExtractor(searchUrlTemplate: string) {
  return new GenericStoreExtractor({
    store: "mercadolivre",
    searchUrlTemplate,
    searchLinkSelectors: [
      "a.poly-component__title",
      "a.ui-search-link",
      "a[href*='MLB']",
    ],
    titleSelectors: [
      "h1.ui-pdp-title",
      "h1",
    ],
    priceSelectors: [
      ".andes-money-amount__fraction",
      ".ui-pdp-price__second-line .andes-money-amount__fraction",
      "[data-testid='price-part']",
    ],
    referencePriceSelectors: [
      ".ui-pdp-price__subtitles",
      ".ui-pdp-price__original-value",
    ],
    skuSelectors: [
      "span:contains('SKU')",
      "[data-testid='sku']",
    ],
    brandSelectors: [
      "a.ui-pdp-color--BLUE",
      "span.ui-pdp-family--REGULAR:contains('Marca')",
    ],
    modelSelectors: [
      "span:contains('Modelo')",
      "[data-testid='model']",
    ],
    categorySelectors: [
      "ol.andes-breadcrumb",
      ".ui-pdp-breadcrumb__container",
    ],
    couponSelectors: [
      "[class*='coupon']",
      "[class*='cupom']",
      "[data-testid*='coupon']",
    ],
    shippingSelectors: [
      "[class*='ui-pdp-shipping']",
      "[class*='shipping']",
      "[class*='frete']",
    ],
    taxSelectors: [
      "[class*='tax']",
      "[class*='imposto']",
      "[data-testid*='tax']",
    ],
  });
}