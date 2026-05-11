import crypto from "node:crypto";
import pLimit from "p-limit";
import type { Page } from "playwright";
import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";
import { nowIso, sanitizePrice } from "../../shared/utils";
import { AddressInput, MarketplaceProductCandidate, MarketplaceSearchAdapter } from "../types";
import {
  detectBlockedHtml,
  detectCaptchaHtml,
  parsePriceText,
  parsePrimaryPriceText,
} from "../scraping/parserUtils";
import { getStealthBrowser, StealthBrowser, StealthPageSession } from "../scraping/stealthBrowser";
import {
  ScrapedProductDetails,
  ScraperError,
  SearchCandidateLink,
  StoreScraperExtractor,
} from "../scraping/types";

interface AdapterOptions {
  store: "amazon" | "mercadolivre" | "shopee";
  extractor: StoreScraperExtractor;
  config: AppConfig;
  logger: AppLogger;
}

interface StoreBrowserSelectors {
  searchReadySelector: string;
  searchCardSelectors: string[];
  searchLinkSelectors: string[];
  searchTitleSelectors: string[];
  searchPriceSelectors: string[];
  searchReferencePriceSelectors: string[];
  searchImageSelectors: string[];
  productReadySelector: string;
  productTitleSelectors: string[];
  productPriceSelectors: string[];
  productReferencePriceSelectors: string[];
  productImageSelectors: string[];
  skuSelectors: string[];
  brandSelectors: string[];
  modelSelectors: string[];
  categorySelectors: string[];
}

interface RawSearchCard {
  url?: string | null;
  title?: string | null;
  priceText?: string | null;
  referencePriceText?: string | null;
  imageUrl?: string | null;
  storeItemIdHint?: string | null;
}

interface RawProductDetails {
  title?: string | null;
  basePriceText?: string | null;
  referencePriceText?: string | null;
  imageUrl?: string | null;
  storeItemId?: string | null;
  sku?: string | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
}

const STORE_BROWSER_SELECTORS: Record<AdapterOptions["store"], StoreBrowserSelectors> = {
  amazon: {
    searchReadySelector: ".s-main-slot, .s-result-item, h2 a.a-link-normal",
    searchCardSelectors: [".s-result-item", "[data-asin]", "h2"],
    searchLinkSelectors: [
      "h2 a.a-link-normal",
      "a.a-link-normal.s-no-outline",
      "a[href*='/dp/']",
      "a[href*='/gp/product/']",
    ],
    searchTitleSelectors: ["h2 span", "h2 a", "a.a-link-normal"],
    searchPriceSelectors: [
      ".a-price:not(.a-text-price) > .a-offscreen",
      ".a-price:not(.a-text-price) .a-offscreen",
      ".a-price-whole",
      "[data-asin-price]",
    ],
    searchReferencePriceSelectors: [".a-price.a-text-price .a-offscreen", ".a-text-price .a-offscreen"],
    searchImageSelectors: ["img.s-image", "img"],
    productReadySelector: "#productTitle, h1, .a-price .a-offscreen",
    productTitleSelectors: ["#productTitle", "h1.a-size-large", "h1"],
    productPriceSelectors: [
      ".a-price:not(.a-text-price) > .a-offscreen",
      ".a-price:not(.a-text-price) .a-offscreen",
      "span.a-price-whole",
      "[data-asin-price]",
    ],
    productReferencePriceSelectors: [".a-price.a-text-price .a-offscreen", ".priceBlockStrikePriceString"],
    productImageSelectors: [
      "#landingImage",
      "#imgTagWrapperId img",
      "#main-image-container img",
      "img.a-dynamic-image",
      "img[data-a-dynamic-image]",
      "img[data-old-hires]",
    ],
    skuSelectors: ["#ASIN", "[data-asin]"],
    brandSelectors: ["#bylineInfo", "a#bylineInfo"],
    modelSelectors: ["th:contains('Modelo') + td", "li:contains('Modelo')"],
    categorySelectors: ["#wayfinding-breadcrumbs_feature_div", "ul.a-unordered-list.a-horizontal.a-size-small"],
  },
  mercadolivre: {
    searchReadySelector: ".ui-search-layout, .ui-search-layout__item, section, a.poly-component__title",
    searchCardSelectors: [".ui-search-layout__item", ".poly-card", ".ui-search-result", "a.poly-component__title"],
    searchLinkSelectors: ["a.poly-component__title", "a.ui-search-link", "a[href*='MLB']"],
    searchTitleSelectors: ["a.poly-component__title", "a.ui-search-link", "h2", "a[href*='MLB']"],
    searchPriceSelectors: [
      ".poly-price__current .andes-money-amount",
      ".poly-component__price .andes-money-amount",
      ".ui-search-price__second-line .andes-money-amount",
      ".andes-money-amount[aria-label]",
      ".andes-money-amount",
      "[data-testid='price-part']",
    ],
    searchReferencePriceSelectors: [
      ".andes-money-amount--previous",
      ".andes-money-amount--previous .andes-money-amount__fraction",
    ],
    searchImageSelectors: ["img"],
    productReadySelector: "h1.ui-pdp-title, h1, .andes-money-amount__fraction",
    productTitleSelectors: ["h1.ui-pdp-title", "h1"],
    productPriceSelectors: [
      ".ui-pdp-price__second-line .andes-money-amount",
      ".ui-pdp-price__main-container .andes-money-amount",
      ".andes-money-amount[aria-label]",
      ".ui-pdp-price__second-line .andes-money-amount__fraction",
      ".andes-money-amount__fraction",
      "[data-testid='price-part']",
    ],
    productReferencePriceSelectors: [".ui-pdp-price__subtitles", ".ui-pdp-price__original-value"],
    productImageSelectors: [
      "img.ui-pdp-image",
      ".ui-pdp-gallery__figure img",
      ".ui-pdp-gallery img",
      "img[data-zoom]",
      "img[data-src]",
      "img[data-image]",
    ],
    skuSelectors: ["span:contains('SKU')", "[data-testid='sku']"],
    brandSelectors: ["a.ui-pdp-color--BLUE", "span.ui-pdp-family--REGULAR:contains('Marca')"],
    modelSelectors: ["span:contains('Modelo')", "[data-testid='model']"],
    categorySelectors: ["ol.andes-breadcrumb", ".ui-pdp-breadcrumb__container"],
  },
  shopee: {
    searchReadySelector: "main, [data-testid='product-card'], .shopee-search-item-result, a[data-sqe='link'], a[href*='-i.'], a[href*='product-i.']",
    searchCardSelectors: [
      "[data-testid='product-card']",
      "li[data-sqe='item']",
      "div[data-sqe='item']",
      "a[data-sqe='link']",
      "a.shopee-search-item-result__item",
      "a[href*='-i.']",
      "a[href*='product-i.']",
    ],
    searchLinkSelectors: [
      "a[data-sqe='link']",
      "a.shopee-search-item-result__item",
      "a[href*='-i.']",
      "a[href*='product-i.']",
    ],
    searchTitleSelectors: [
      "[data-testid='product-card-name']",
      "[class*='line-clamp']",
      "[class*='product-card-name']",
      "[class*='name']",
      "span",
    ],
    searchPriceSelectors: [
      "[data-testid='product-card-price']",
      "[data-testid='price']",
      "[class*='price']",
      "[class*='Price']",
      "span",
      "div",
    ],
    searchReferencePriceSelectors: ["div[class*='origin']", "span[class*='origin']"],
    searchImageSelectors: ["img"],
    productReadySelector: "h1, [data-testid='price'], div[class*='product-briefing']",
    productTitleSelectors: ["h1", "div[class*='qaNIZv']", "div[class*='product-briefing'] h1"],
    productPriceSelectors: ["div[class*='pqTWkA']", "span[class*='_3n5NQx']", "[data-testid='price']"],
    productReferencePriceSelectors: ["div[class*='Y8-f6g']", "span[class*='wRmR4F']"],
    productImageSelectors: ["img"],
    skuSelectors: ["div:contains('SKU')", "span:contains('SKU')"],
    brandSelectors: ["div:contains('Marca')", "span:contains('Marca')"],
    modelSelectors: ["div:contains('Modelo')", "span:contains('Modelo')"],
    categorySelectors: ["div[class*='page-product__breadcrumb']", "ol[class*='breadcrumb']"],
  },
};

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

const normalizeText = (value: string | null | undefined): string | null => {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ScraperError("timeout", message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export abstract class BaseSearchAdapter implements MarketplaceSearchAdapter {
  readonly store: "amazon" | "mercadolivre" | "shopee";

  protected readonly extractor: StoreScraperExtractor;
  protected readonly config: AppConfig;
  protected readonly logger: AppLogger;
  private readonly selectors: StoreBrowserSelectors;

  constructor(options: AdapterOptions) {
    this.store = options.store;
    this.extractor = options.extractor;
    this.config = options.config;
    this.logger = options.logger;
    this.selectors = STORE_BROWSER_SELECTORS[options.store];
  }

  async searchProducts(query: string, address: AddressInput): Promise<MarketplaceProductCandidate[]> {
    return withTimeout(
      this.scrapeStore(query, address),
      this.config.scraperTimeoutTotalMs,
      `Timeout total na loja ${this.store}`,
    );
  }

  private async scrapeStore(query: string, address: AddressInput): Promise<MarketplaceProductCandidate[]> {
    if (!this.config.scraperUseHeadlessFallback) {
      throw new ScraperError(
        "headless_error",
        `Stealth browser desabilitado por configuracao na loja ${this.store}.`,
        this.store,
      );
    }

    const searchUrl = this.extractor.buildSearchUrl(query);
    const browser = getStealthBrowser(this.config, this.logger);

    const candidateLinks = await this.withSearchPage(browser, async ({ page }) => {
      await this.gotoPage(page, searchUrl, "busca");
      await this.assertPageNotBlocked(page, "busca");
      let readyError: ScraperError | null = null;
      try {
        await this.waitForReadySelector(page, this.selectors.searchReadySelector, "grid de busca");
      } catch (error) {
        readyError = error instanceof ScraperError
          ? error
          : this.toScraperError(error, `Timeout aguardando grid de busca em ${this.store}`);
      }

      await browser.randomMouseMovements(page);
      await browser.simulateHumanScroll(page);
      await this.assertPageNotBlocked(page, "busca");

      const rawCards = await this.extractSearchCardsFromPage(page);
      if (rawCards.length === 0 && readyError) {
        throw readyError;
      }

      return this.toCandidateLinks(rawCards, searchUrl);
    });

    if (candidateLinks.length === 0) {
      throw new ScraperError("empty_result", `Nenhum candidato encontrado em ${this.store}.`, this.store);
    }

    const uniqueCandidateLinks = this.dedupeCandidateLinks(candidateLinks);
    const listingFallbackCandidates = uniqueCandidateLinks
      .map((candidate) => this.toListingFallbackCandidate(candidate))
      .filter((item): item is MarketplaceProductCandidate => item !== null);

    if (listingFallbackCandidates.length > 0) {
      return this.dedupeByProductUrl(listingFallbackCandidates).slice(0, this.config.searchMaxItemsPerStore);
    }

    const limit = pLimit(Math.max(1, this.config.scraperProductConcurrency));
    const scraped = await Promise.all(
      uniqueCandidateLinks.map((candidate) =>
        limit(() => this.scrapeProductBestEffort(candidate, address, null)),
      ),
    );

    const results = scraped.filter((item): item is MarketplaceProductCandidate => item !== null);

    if (results.length === 0) {
      throw new ScraperError("parse_error", `Falha ao parsear produtos da loja ${this.store}.`, this.store);
    }

    return this.dedupeByProductUrl(results);
  }

  protected async withSearchPage<T>(
    browser: StealthBrowser,
    worker: (session: StealthPageSession) => Promise<T>,
  ): Promise<T> {
    return browser.withPage(worker);
  }

  private async scrapeProduct(
    candidate: SearchCandidateLink,
    _address: AddressInput,
    timeoutMs: number,
  ): Promise<MarketplaceProductCandidate | null> {
    const browser = getStealthBrowser(this.config, this.logger);

    const details = await browser.withPage(async ({ page }) => {
      await this.gotoPage(page, candidate.url, "produto", timeoutMs);
      await this.assertPageNotBlocked(page, "produto");
      await this.waitForReadySelector(page, this.selectors.productReadySelector, "detalhe do produto", timeoutMs);
      await this.assertPageNotBlocked(page, "produto");

      return this.extractProductDetailsFromPage(page);
    });

    const detailsWithFallbacks = details
      ? {
          ...details,
          title: details.title ?? candidate.title ?? null,
        }
      : null;

    if (!detailsWithFallbacks || !this.hasMinimumDetails(detailsWithFallbacks)) {
      return null;
    }

    return this.toMarketplaceCandidate(candidate, detailsWithFallbacks);
  }

  private async scrapeProductBestEffort(
    candidate: SearchCandidateLink,
    address: AddressInput,
    fallback: MarketplaceProductCandidate | null,
  ): Promise<MarketplaceProductCandidate | null> {
    const timeoutMs = this.config.scraperTimeoutHeadlessMs;

    try {
      const validated = await withTimeout(
        this.scrapeProduct(candidate, address, timeoutMs),
        timeoutMs,
        `Timeout validando produto em ${this.store}`,
      );

      return validated ?? fallback;
    } catch (error) {
      const code = error instanceof ScraperError ? error.code : "parse_error";
      this.logger.debug(
        {
          store: this.store,
          productUrl: candidate.url,
          code,
        },
        "Falha ao extrair produto individual; item sera ignorado.",
      );

      return fallback;
    }
  }

  private async gotoPage(
    page: Page,
    url: string,
    phase: string,
    timeoutMs = this.config.scraperTimeoutHeadlessMs,
  ): Promise<void> {
    try {
      await page.goto(url, {
        timeout: timeoutMs,
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle", { timeout: this.config.scraperTimeoutHeadlessMs }).catch(
        () => undefined,
      );
    } catch (error) {
      throw this.toScraperError(error, `Falha ao navegar para ${phase} em ${this.store}`);
    }
  }

  private async waitForReadySelector(
    page: Page,
    selector: string,
    phase: string,
    timeoutMs = this.config.scraperTimeoutHeadlessMs,
  ): Promise<void> {
    try {
      await page.waitForSelector(selector, {
        timeout: timeoutMs,
      });
    } catch (error) {
      await this.assertPageNotBlocked(page, phase);
      throw this.toScraperError(error, `Timeout aguardando ${phase} em ${this.store}`);
    }
  }

  private async assertPageNotBlocked(page: Page, phase: string): Promise<void> {
    const html = await page.content().catch(() => "");

    if (detectCaptchaHtml(html)) {
      throw new ScraperError("captcha", `CAPTCHA detectado na ${phase} de ${this.store}.`, this.store);
    }

    if (detectBlockedHtml(html)) {
      throw new ScraperError("blocked", `Bloqueio detectado na ${phase} de ${this.store}.`, this.store);
    }
  }

  private async extractSearchCardsFromPage(page: Page): Promise<RawSearchCard[]> {
    const script = `
      (() => {
        const options = ${JSON.stringify({
          store: this.store,
          cardSelectors: this.selectors.searchCardSelectors,
          linkSelectors: this.selectors.searchLinkSelectors,
          titleSelectors: this.selectors.searchTitleSelectors,
          priceSelectors: this.selectors.searchPriceSelectors,
          referencePriceSelectors: this.selectors.searchReferencePriceSelectors,
          imageSelectors: this.selectors.searchImageSelectors,
          imageAttributes: IMAGE_ATTRIBUTES,
        })};

        const cleanText = (value) => String(value || "").replace(/\\s+/g, " ").trim() || null;
        const readAttribute = (element, attrs) => {
          if (!element) return null;
          for (const attr of attrs) {
            const value = element.getAttribute(attr);
            if (value && value.trim()) return value.trim();
          }
          return null;
        };
        const matches = (element, selector) => {
          try { return element.matches && element.matches(selector); } catch { return false; }
        };
        const findFirst = (root, selectors) => {
          for (const selector of selectors) {
            if (matches(root, selector)) return root;
            let found = null;
            try { found = root.querySelector(selector); } catch { found = null; }
            if (found) return found;
          }
          return null;
        };
        const readTextValue = (element) => {
          if (!element) return null;
          return cleanText(
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            element.getAttribute("content") ||
            element.getAttribute("value")
          );
        };
        const textFrom = (root, selectors) => {
          const element = findFirst(root, selectors);
          return readTextValue(element);
        };
        const findAll = (root, selectors) => {
          const results = [];
          for (const selector of selectors) {
            if (matches(root, selector)) results.push(root);
            try { results.push(...Array.from(root.querySelectorAll(selector))); } catch {}
          }
          return results;
        };
        const hasClosest = (element, selector) => {
          try { return Boolean(element?.closest?.(selector)); } catch { return false; }
        };
        const isInstallmentText = (value) => /\\b\\d{1,2}\\s*x\\b|\\bem\\s+\\d{1,2}\\s*x\\b|\\bparcel|sem\\s+juros/i.test(String(value || ""));
        const hasInstallmentContext = (element, root) => {
          let current = element;
          let depth = 0;
          while (current && current !== root && depth < 4) {
            const text = cleanText(current.textContent);
            const moneyCount = current.querySelectorAll ? current.querySelectorAll(".andes-money-amount").length : 0;
            if (text && isInstallmentText(text) && moneyCount <= 1) return true;
            current = current.parentElement;
            depth += 1;
          }
          return false;
        };
        const isMercadoLivreReferenceAmount = (element) => hasClosest(
          element,
          ".andes-money-amount--previous, .andes-money-amount--strike, .andes-money-amount--discount, s, del, [class*='previous'], [class*='old-price'], [class*='original']"
        );
        const moneyTextFrom = (root, selectors) => {
          const element = findFirst(root, selectors);
          if (!element) return null;
          const amount = matches(element, ".andes-money-amount")
            ? element
            : (element.closest ? element.closest(".andes-money-amount") : null);
          if (amount) {
            const fraction = cleanText(amount.querySelector(".andes-money-amount__fraction")?.textContent);
            const cents = cleanText(amount.querySelector(".andes-money-amount__cents")?.textContent);
            if (fraction) return cents ? "R$ " + fraction + "," + cents : "R$ " + fraction + ",00";
            const aria = cleanText(amount.getAttribute("aria-label"));
            if (aria) return aria;
          }
          return readTextValue(element);
        };
        const mercadoLivreMoneyTextFrom = (root, selectors) => {
          const elements = findAll(root, selectors);
          for (const element of elements) {
            const amount = matches(element, ".andes-money-amount")
              ? element
              : (element.closest ? element.closest(".andes-money-amount") : null);
            const target = amount || element;
            const rawContext =
              cleanText(target.getAttribute?.("aria-label")) ||
              cleanText(target.textContent) ||
              readTextValue(target);

            if (!target || isMercadoLivreReferenceAmount(target)) continue;
            if (rawContext && isInstallmentText(rawContext)) continue;
            if (hasInstallmentContext(target, root)) continue;

            if (amount) {
              const fraction = cleanText(amount.querySelector(".andes-money-amount__fraction")?.textContent);
              const cents = cleanText(amount.querySelector(".andes-money-amount__cents")?.textContent);
              if (fraction) return cents ? "R$ " + fraction + "," + cents : "R$ " + fraction + ",00";
              const aria = cleanText(amount.getAttribute("aria-label"));
              if (aria) return aria;
            }

            const text = readTextValue(target);
            if (text && !isInstallmentText(text)) return text;
          }
          return null;
        };
        const amazonMoneyTextFrom = (root, selectors) => {
          const elements = findAll(root, selectors);
          for (const element of elements) {
            if (hasClosest(element, ".a-text-price")) continue;
            const text = readTextValue(element);
            if (text) return text;
          }
          return null;
        };
        const shopeeMoneyTextFrom = (root, selectors) => {
          const hasPriceSignal = (value) => /r\\$\\s*\\d|\\d+[,.]\\d{2}/i.test(String(value || ""));
          const elements = findAll(root, selectors);
          for (const element of elements) {
            const text = readTextValue(element) || cleanText(element?.textContent);
            if (!text || !hasPriceSignal(text)) continue;
            if (isInstallmentText(text) || hasInstallmentContext(element, root)) continue;
            return text;
          }

          const descendants = Array.from(root.querySelectorAll ? root.querySelectorAll("*") : []);
          for (const element of descendants) {
            const text = readTextValue(element) || cleanText(element?.textContent);
            if (!text || !hasPriceSignal(text)) continue;
            if (isInstallmentText(text) || hasInstallmentContext(element, root)) continue;
            return text;
          }

          return null;
        };
        const searchPriceTextFrom = (root) => {
          if (options.store === "amazon") return amazonMoneyTextFrom(root, options.priceSelectors);
          if (options.store === "mercadolivre") return mercadoLivreMoneyTextFrom(root, options.priceSelectors);
          if (options.store === "shopee") return shopeeMoneyTextFrom(root, options.priceSelectors);
          return moneyTextFrom(root, options.priceSelectors);
        };
        const bestSrcset = (value) => {
          const entries = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
          if (entries.length === 0) return null;
          return entries[entries.length - 1].split(/\\s+/)[0] || null;
        };
        const bestDynamicImage = (value) => {
          try {
            const parsed = JSON.parse(value);
            const entries = Object.entries(parsed).map(([url, size]) => {
              const width = Array.isArray(size) ? Number(size[0] || 0) : 0;
              const height = Array.isArray(size) ? Number(size[1] || 0) : 0;
              return { url, score: width * height };
            }).sort((a, b) => b.score - a.score);
            return entries[0]?.url || null;
          } catch {
            return null;
          }
        };
        const isBadImage = (value) => {
          const normalized = String(value || "").trim().toLowerCase();
          return !normalized ||
            normalized === "#" ||
            normalized === "about:blank" ||
            normalized.startsWith("data:") ||
            normalized.includes("placeholder") ||
            normalized.includes("transparent") ||
            normalized.includes("spacer") ||
            normalized.includes("pixel.gif") ||
            normalized.includes("no-image");
        };
        const imageFrom = (root) => {
          const image = findFirst(root, options.imageSelectors);
          if (!image) return null;
          for (const attr of options.imageAttributes) {
            const raw = image.getAttribute(attr);
            if (!raw) continue;
            const candidate = attr === "srcset" || attr === "data-srcset"
              ? bestSrcset(raw)
              : attr === "data-a-dynamic-image"
                ? bestDynamicImage(raw)
                : raw;
            if (!isBadImage(candidate)) return candidate;
          }
          return null;
        };

        const nodes = Array.from(document.querySelectorAll(options.cardSelectors.join(",")));
        const roots = nodes.length > 0
          ? nodes
          : Array.from(document.querySelectorAll(options.linkSelectors.join(",")));

        return roots.map((root) => {
          const link = findFirst(root, options.linkSelectors);
          const url = readAttribute(link, ["href", "data-href", "data-url", "data-link", "data-item-url"]);
          const title = textFrom(root, options.titleSelectors) || cleanText(link ? (link.textContent || link.getAttribute("title")) : null);
          const priceText = searchPriceTextFrom(root);
          const referencePriceText = textFrom(root, options.referencePriceSelectors);
          const imageUrl = imageFrom(root);
          const storeItemIdHint =
            readAttribute(root, ["data-asin", "data-item-id", "data-id"]) ||
            readAttribute(link, ["data-asin", "data-item-id", "data-id"]);

          return { url, title, priceText, referencePriceText, imageUrl, storeItemIdHint };
        }).filter((item) => item.url || item.title);
      })()
    `;

    return page.evaluate<RawSearchCard[]>(script);
  }

  private async extractProductDetailsFromPage(page: Page): Promise<ScrapedProductDetails | null> {
    const script = `
      (() => {
        const options = ${JSON.stringify({
          titleSelectors: this.selectors.productTitleSelectors,
          priceSelectors: this.selectors.productPriceSelectors,
          referencePriceSelectors: this.selectors.productReferencePriceSelectors,
          imageSelectors: this.selectors.productImageSelectors,
          skuSelectors: this.selectors.skuSelectors,
          brandSelectors: this.selectors.brandSelectors,
          modelSelectors: this.selectors.modelSelectors,
          categorySelectors: this.selectors.categorySelectors,
          imageAttributes: IMAGE_ATTRIBUTES,
        })};

        const cleanText = (value) => String(value || "").replace(/\\s+/g, " ").trim() || null;
        const matches = (element, selector) => {
          try { return element.matches && element.matches(selector); } catch { return false; }
        };
        const findFirst = (root, selectors) => {
          for (const selector of selectors) {
            if (matches(root, selector)) return root;
            let found = null;
            try { found = root.querySelector(selector); } catch { found = null; }
            if (found) return found;
          }
          return null;
        };
        const readTextValue = (element) => {
          if (!element) return null;
          return cleanText(
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            element.getAttribute("content") ||
            element.getAttribute("value")
          );
        };
        const textFrom = (selectors) => {
          const element = findFirst(document, selectors);
          return readTextValue(element);
        };
        const moneyTextFrom = (selectors) => {
          const element = findFirst(document, selectors);
          if (!element) return null;
          const amount = matches(element, ".andes-money-amount")
            ? element
            : (element.closest ? element.closest(".andes-money-amount") : null);
          if (amount) {
            const fraction = cleanText(amount.querySelector(".andes-money-amount__fraction")?.textContent);
            const cents = cleanText(amount.querySelector(".andes-money-amount__cents")?.textContent);
            if (fraction) return cents ? "R$ " + fraction + "," + cents : "R$ " + fraction + ",00";
            const aria = cleanText(amount.getAttribute("aria-label"));
            if (aria) return aria;
          }
          return readTextValue(element);
        };
        const attrFrom = (selectors, attrs) => {
          const element = findFirst(document, selectors);
          if (!element) return null;
          for (const attr of attrs) {
            const value = element.getAttribute(attr);
            if (value && value.trim()) return value.trim();
          }
          return null;
        };
        const bestSrcset = (value) => {
          const entries = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
          if (entries.length === 0) return null;
          return entries[entries.length - 1].split(/\\s+/)[0] || null;
        };
        const bestDynamicImage = (value) => {
          try {
            const parsed = JSON.parse(value);
            const entries = Object.entries(parsed).map(([url, size]) => {
              const width = Array.isArray(size) ? Number(size[0] || 0) : 0;
              const height = Array.isArray(size) ? Number(size[1] || 0) : 0;
              return { url, score: width * height };
            }).sort((a, b) => b.score - a.score);
            return entries[0]?.url || null;
          } catch {
            return null;
          }
        };
        const isBadImage = (value) => {
          const normalized = String(value || "").trim().toLowerCase();
          return !normalized ||
            normalized === "#" ||
            normalized === "about:blank" ||
            normalized.startsWith("data:") ||
            normalized.includes("placeholder") ||
            normalized.includes("transparent") ||
            normalized.includes("spacer") ||
            normalized.includes("pixel.gif") ||
            normalized.includes("no-image");
        };
        const imageFrom = () => {
          const image = findFirst(document, options.imageSelectors);
          if (!image) return null;
          for (const attr of options.imageAttributes) {
            const raw = image.getAttribute(attr);
            if (!raw) continue;
            const candidate = attr === "srcset" || attr === "data-srcset"
              ? bestSrcset(raw)
              : attr === "data-a-dynamic-image"
                ? bestDynamicImage(raw)
                : raw;
            if (!isBadImage(candidate)) return candidate;
          }
          return null;
        };

        return {
          title: textFrom(options.titleSelectors),
          basePriceText: moneyTextFrom(options.priceSelectors),
          referencePriceText: textFrom(options.referencePriceSelectors),
          imageUrl: imageFrom(),
          storeItemId: attrFrom(["[data-asin]", "#ASIN", "[data-item-id]", "[data-id]"], ["data-asin", "value", "data-item-id", "data-id"]),
          sku: textFrom(options.skuSelectors),
          brand: textFrom(options.brandSelectors),
          model: textFrom(options.modelSelectors),
          category: textFrom(options.categorySelectors),
        };
      })()
    `;

    const raw = await page.evaluate<RawProductDetails>(script);
    const basePrice = parsePrimaryPriceText(raw.basePriceText) ?? parsePriceText(raw.basePriceText);

    if (basePrice === null || !Number.isFinite(basePrice) || basePrice <= 0) {
      return null;
    }

    const referencePrice =
      parsePrimaryPriceText(raw.referencePriceText) ?? parsePriceText(raw.referencePriceText);

    return {
      title: normalizeText(raw.title),
      storeItemId: normalizeText(raw.storeItemId),
      imageUrl: this.normalizeImageUrl(raw.imageUrl, page.url()),
      basePrice,
      referencePrice,
      sku: normalizeText(raw.sku),
      gtin: null,
      brand: normalizeText(raw.brand),
      model: normalizeText(raw.model),
      category: normalizeText(raw.category),
      coupons: [],
      shippingOptions: [],
      taxAmount: null,
    };
  }

  private toCandidateLinks(rawCards: RawSearchCard[], searchUrl: string): SearchCandidateLink[] {
    const links: SearchCandidateLink[] = [];
    const maxItems = Math.max(1, this.config.searchMaxItemsPerStore);

    for (const raw of rawCards) {
      const candidate = this.toCandidateLink(raw, searchUrl);
      if (!candidate) continue;

      links.push(candidate);
      if (links.length >= maxItems) break;
    }

    return links;
  }

  private toCandidateLink(raw: RawSearchCard, searchUrl: string): SearchCandidateLink | null {
    const url = this.normalizeCandidateUrl(raw.url ?? "", searchUrl);
    if (!url) return null;

    if (raw.priceText) {
      this.logger.debug(
        {
          store: this.store,
          productUrl: url,
          rawPriceText: raw.priceText,
        },
        "Preco bruto extraido da listagem.",
      );
    }

    return {
      url,
      title: normalizeText(raw.title),
      imageUrlHint: this.normalizeImageUrl(raw.imageUrl, searchUrl),
      basePriceHint: this.parseListingPriceHint(raw.priceText),
      referencePriceHint: this.parseListingPriceHint(raw.referencePriceText),
      storeItemIdHint: normalizeText(raw.storeItemIdHint) ?? this.extractStoreItemId(url),
    };
  }

  private parseListingPriceHint(raw: string | null | undefined): number | null {
    const primary = parsePrimaryPriceText(raw);
    if (primary !== null) return primary;

    if (/\b\d{1,2}\s*x\b|\bem\s+\d{1,2}\s*x\b|\bparcel|sem\s+juros/i.test(String(raw ?? ""))) {
      return null;
    }

    return parsePriceText(raw);
  }

  private normalizeCandidateUrl(rawHref: string, baseUrl: string): string | null {
    if (!rawHref) return null;

    let absolute: string;
    try {
      absolute = new URL(rawHref, baseUrl).toString();
    } catch {
      return null;
    }

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
      return this.normalizeCandidateUrl(safeDecode(target), `${url.protocol}//${url.hostname}`);
    }

    if (host.startsWith("click1.mercadolivre")) {
      const target =
        url.searchParams.get("url") ||
        url.searchParams.get("target") ||
        url.searchParams.get("redirect");
      if (!target) return null;
      return this.normalizeCandidateUrl(safeDecode(target), "https://www.mercadolivre.com.br");
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
          if (host === "aax-us-east-retail-direct.amazon.com") {
            url.protocol = "https:";
            url.hostname = "www.amazon.com.br";
          }
          url.pathname = `/dp/${dpMatch[1]}`;
          url.search = "";
          return url.toString();
        }

        const gpMatch = url.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
        if (gpMatch) {
          if (host === "aax-us-east-retail-direct.amazon.com") {
            url.protocol = "https:";
            url.hostname = "www.amazon.com.br";
          }
          url.pathname = `/gp/product/${gpMatch[1]}`;
          url.search = "";
          return url.toString();
        }

        return null;
      }

      if (host.includes("mercadolivre.")) {
        if (host.startsWith("click1.mercadolivre")) return null;
        url.search = "";
        return url.toString();
      }

      if (host.includes("shopee.")) {
        if (!/(?:product-i\.|-i\.)\d+\.\d+/i.test(url.pathname)) return null;
        url.search = "";
        return url.toString();
      }

      return url.toString();
    } catch {
      return null;
    }
  }

  private normalizeImageUrl(raw: string | null | undefined, baseUrl: string): string | null {
    const clean = normalizeText(raw)
      ?.replace(/^url\(["']?/, "")
      .replace(/["']?\)$/, "");

    if (!clean || this.isInvalidImageUrl(clean)) return null;

    try {
      return new URL(clean, baseUrl).toString();
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

  private toScraperError(error: unknown, fallbackMessage: string): ScraperError {
    if (error instanceof ScraperError) return error;

    const message = (error as Error)?.message ?? fallbackMessage;
    const normalized = message.toLowerCase();

    if (normalized.includes("timeout") || normalized.includes("timed out")) {
      return new ScraperError("timeout", `${fallbackMessage}: ${message}`, this.store);
    }

    if (normalized.includes("headless fallback desabilitado")) {
      return new ScraperError("headless_error", `${fallbackMessage}: ${message}`, this.store);
    }

    return new ScraperError("headless_error", `${fallbackMessage}: ${message}`, this.store);
  }

  private hasMinimumDetails(details: ScrapedProductDetails): boolean {
    return Boolean(
      details.title &&
      Number.isFinite(details.basePrice) &&
      Number(details.basePrice) > 0,
    );
  }

  private toListingFallbackCandidate(link: SearchCandidateLink): MarketplaceProductCandidate | null {
    const title = normalizeText(link.title);
    const basePrice = Number(link.basePriceHint ?? 0);

    if (!title || !Number.isFinite(basePrice) || basePrice <= 0) {
      return null;
    }

    const referencePrice = link.referencePriceHint ?? null;
    const storeItemId =
      link.storeItemIdHint ??
      this.extractStoreItemId(link.url) ??
      this.hashStoreItem(link.url);

    return {
      store: this.store,
      storeItemId,
      title,
      category: null,
      imageUrl: link.imageUrlHint ?? null,
      productUrl: link.url,
      affiliateUrl: link.url,
      basePrice: sanitizePrice(basePrice),
      referencePrice: referencePrice === null ? null : sanitizePrice(referencePrice),
      sku: null,
      gtin: null,
      brand: null,
      model: null,
      coupons: [],
      shippingOptions: [],
      taxAmount: null,
      capturedAt: nowIso(),
      priceSource: "listing",
    };
  }

  private toMarketplaceCandidate(
    link: SearchCandidateLink,
    details: ScrapedProductDetails,
  ): MarketplaceProductCandidate {
    const basePrice = sanitizePrice(Number(details.basePrice ?? 0));
    const referencePrice = details.referencePrice ?? link.referencePriceHint ?? null;

    const storeItemId =
      details.storeItemId ??
      link.storeItemIdHint ??
      this.extractStoreItemId(link.url) ??
      this.hashStoreItem(link.url);

    return {
      store: this.store,
      storeItemId,
      title: String(details.title ?? link.title ?? "Produto sem titulo"),
      category: details.category ?? null,
      imageUrl: details.imageUrl ?? link.imageUrlHint ?? null,
      productUrl: link.url,
      affiliateUrl: link.url,
      basePrice,
      referencePrice: referencePrice === null ? null : sanitizePrice(referencePrice),
      sku: details.sku ?? null,
      gtin: details.gtin ?? null,
      brand: details.brand ?? null,
      model: details.model ?? null,
      coupons: details.coupons ?? [],
      shippingOptions: details.shippingOptions ?? [],
      taxAmount: details.taxAmount ?? null,
      capturedAt: nowIso(),
      priceSource: "product",
    };
  }

  private extractStoreItemId(productUrl: string): string | null {
    const shopeeMatch = productUrl.match(/(?:product-i\.|-i\.)(\d+)\.(\d+)/i);
    if (shopeeMatch) return `${shopeeMatch[1]}.${shopeeMatch[2]}`;

    const match = productUrl.match(/\/([A-Z0-9]{8,15})(?:[/?]|$)/i);
    return match ? match[1] : null;
  }

  private hashStoreItem(url: string): string {
    return crypto.createHash("sha1").update(`${this.store}|${url}`).digest("hex").slice(0, 16);
  }

  private dedupeCandidateLinks(candidates: SearchCandidateLink[]): SearchCandidateLink[] {
    const unique = new Map<string, SearchCandidateLink>();

    for (const candidate of candidates) {
      const existing = unique.get(candidate.url);
      if (!existing) {
        unique.set(candidate.url, candidate);
        continue;
      }

      unique.set(candidate.url, {
        ...existing,
        title: existing.title ?? candidate.title ?? null,
        imageUrlHint: existing.imageUrlHint ?? candidate.imageUrlHint ?? null,
        basePriceHint: existing.basePriceHint ?? candidate.basePriceHint ?? null,
        referencePriceHint: existing.referencePriceHint ?? candidate.referencePriceHint ?? null,
        storeItemIdHint: existing.storeItemIdHint ?? candidate.storeItemIdHint ?? null,
      });
    }

    return [...unique.values()];
  }

  private dedupeByProductUrl(candidates: MarketplaceProductCandidate[]): MarketplaceProductCandidate[] {
    const unique = new Map<string, MarketplaceProductCandidate>();

    for (const candidate of candidates) {
      if (!unique.has(candidate.productUrl)) {
        unique.set(candidate.productUrl, candidate);
      }
    }

    return [...unique.values()];
  }
}
