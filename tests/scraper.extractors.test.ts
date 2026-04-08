import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAmazonExtractor } from "../src/search/scraping/extractors/amazonExtractor";
import { createMercadoLivreExtractor } from "../src/search/scraping/extractors/mercadoLivreExtractor";
import { createShopeeExtractor } from "../src/search/scraping/extractors/shopeeExtractor";

const fixture = (...parts: string[]) =>
  fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "scraping", ...parts), "utf-8");

const address = {
  street: "Rua Teste",
  number: "100",
  district: "Centro",
  city: "Sao Paulo",
  state: "SP",
  zipCode: "01000-000",
  complement: null,
};

describe("store extractors", () => {
  it("amazon deve extrair candidatos da busca e detalhes do produto", () => {
    const extractor = createAmazonExtractor("https://www.amazon.com.br/s?k={query}");
    const searchHtml = fixture("amazon", "search.html");
    const productHtml = fixture("amazon", "product.html");

    const links = extractor.extractSearchCandidates(searchHtml, "https://www.amazon.com.br/s?k=console");
    expect(links.length).toBeGreaterThan(0);

    const details = extractor.extractProductDetails(productHtml, links[0].url, address);
    expect(details?.title).toContain("Console Game Prime");
    expect(details?.basePrice).toBe(1799.9);
    expect(details?.shippingOptions?.length).toBeGreaterThan(0);
    expect(details?.coupons?.length).toBeGreaterThan(0);
    expect(details?.taxAmount).toBe(39.9);
  });

  it("mercado livre deve extrair candidatos e detalhes", () => {
    const extractor = createMercadoLivreExtractor("https://lista.mercadolivre.com.br/{query}");
    const searchHtml = fixture("mercadolivre", "search.html");
    const productHtml = fixture("mercadolivre", "product.html");

    const links = extractor.extractSearchCandidates(searchHtml, "https://lista.mercadolivre.com.br/notebook");
    expect(links.length).toBeGreaterThan(0);

    const details = extractor.extractProductDetails(productHtml, links[0].url, address);
    expect(details?.title).toContain("Notebook ZX Pro");
    expect(details?.basePrice).toBe(4499);
    expect(details?.coupons?.length).toBeGreaterThan(0);
  });

  it("shopee deve extrair candidatos e detalhes", () => {
    const extractor = createShopeeExtractor("https://shopee.com.br/search?keyword={query}");
    const searchHtml = fixture("shopee", "search.html");
    const productHtml = fixture("shopee", "product.html");

    const links = extractor.extractSearchCandidates(searchHtml, "https://shopee.com.br/search?keyword=fone");
    expect(links.length).toBeGreaterThan(0);

    const details = extractor.extractProductDetails(productHtml, links[0].url, address);
    expect(details?.title).toContain("Fone Turbo X");
    expect(details?.basePrice).toBe(249.9);
    expect(details?.taxAmount).toBe(9.9);
  });
});