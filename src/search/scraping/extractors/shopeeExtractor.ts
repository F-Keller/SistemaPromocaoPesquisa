import { GenericStoreExtractor } from "./genericStoreExtractor";

export function createShopeeExtractor(searchUrlTemplate: string) {
  return new GenericStoreExtractor({
    store: "shopee",
    searchUrlTemplate,
    searchLinkSelectors: [
      "a[data-sqe='link']",
      "a.shopee-search-item-result__item",
      "a[href*='-i.']",
    ],
    titleSelectors: [
      "h1",
      "div[class*='qaNIZv']",
      "div[class*='product-briefing'] h1",
    ],
    priceSelectors: [
      "div[class*='pqTWkA']",
      "span[class*='_3n5NQx']",
      "[data-testid='price']",
    ],
    referencePriceSelectors: [
      "div[class*='Y8-f6g']",
      "span[class*='wRmR4F']",
    ],
    skuSelectors: [
      "div:contains('SKU')",
      "span:contains('SKU')",
    ],
    brandSelectors: [
      "div:contains('Marca')",
      "span:contains('Marca')",
    ],
    modelSelectors: [
      "div:contains('Modelo')",
      "span:contains('Modelo')",
    ],
    categorySelectors: [
      "div[class*='page-product__breadcrumb']",
      "ol[class*='breadcrumb']",
    ],
    couponSelectors: [
      "[class*='voucher']",
      "[class*='coupon']",
      "[class*='cupom']",
    ],
    shippingSelectors: [
      "[class*='shipping']",
      "[class*='logistics']",
      "[class*='frete']",
    ],
    taxSelectors: [
      "[class*='tax']",
      "[class*='imposto']",
    ],
  });
}