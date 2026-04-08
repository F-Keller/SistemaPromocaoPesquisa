import { GenericStoreExtractor } from "./genericStoreExtractor";

export function createAmazonExtractor(searchUrlTemplate: string) {
  return new GenericStoreExtractor({
    store: "amazon",
    searchUrlTemplate,
    searchLinkSelectors: [
      "h2 a.a-link-normal",
      "a.a-link-normal.s-no-outline",
      "a[href*='/dp/']",
    ],
    titleSelectors: [
      "#productTitle",
      "h1.a-size-large",
      "h1",
    ],
    priceSelectors: [
      ".a-price .a-offscreen",
      "span.a-price-whole",
      "[data-asin-price]",
    ],
    referencePriceSelectors: [
      ".a-price.a-text-price .a-offscreen",
      ".priceBlockStrikePriceString",
    ],
    skuSelectors: [
      "#ASIN",
      "[data-asin]",
    ],
    brandSelectors: [
      "#bylineInfo",
      "a#bylineInfo",
    ],
    modelSelectors: [
      "th:contains('Modelo') + td",
      "li:contains('Modelo')",
    ],
    categorySelectors: [
      "#wayfinding-breadcrumbs_feature_div",
      "ul.a-unordered-list.a-horizontal.a-size-small",
    ],
    couponSelectors: [
      "[id*='coupon']",
      "[class*='coupon']",
      "[class*='cupom']",
    ],
    shippingSelectors: [
      "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE",
      "#deliveryBlockMessage",
      "[id*='shipping']",
      "[class*='frete']",
    ],
    taxSelectors: [
      "[id*='tax']",
      "[class*='tax']",
      "[class*='imposto']",
    ],
  });
}