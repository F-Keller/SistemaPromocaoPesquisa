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
      ".ui-pdp-price__second-line .andes-money-amount__fraction",
      "[itemprop='offers'] .andes-money-amount",
      ".poly-price__current .andes-money-amount",
      ".poly-component__price .andes-money-amount",
      ".ui-search-price__second-line .andes-money-amount",
      ".andes-money-amount[aria-label]",
      ".andes-money-amount",
      ".andes-money-amount__fraction",
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
    imageSelectors: [
      "img.ui-pdp-image",
      ".ui-pdp-gallery__figure img",
      ".ui-pdp-gallery img",
      "img[data-zoom]",
      "img[data-src]",
      "img[data-image]",
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
