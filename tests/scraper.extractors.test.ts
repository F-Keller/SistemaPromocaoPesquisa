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
    expect(details?.imageUrl).toBe("https://images.example.com/console-game-prime-large.jpg");
    expect(details?.shippingOptions?.length).toBeGreaterThan(0);
    expect(details?.coupons?.length).toBeGreaterThan(0);
    expect(details?.taxAmount).toBe(39.9);
  });

  it("amazon deve usar preco principal da listagem e ignorar preco riscado", () => {
    const extractor = createAmazonExtractor("https://www.amazon.com.br/s?k={query}");
    const searchHtml = `
      <div class="s-result-item" data-asin="B0PRICE001">
        <h2>
          <a class="a-link-normal" href="/dp/B0PRICE001">
            <span>Notebook Gamer Amazon</span>
          </a>
        </h2>
        <span class="a-price a-text-price">
          <span class="a-offscreen">R$ 9.999,90</span>
        </span>
        <span class="a-price">
          <span class="a-offscreen">R$ 4.999,90</span>
        </span>
      </div>
    `;

    const links = extractor.extractSearchCandidates(searchHtml, "https://www.amazon.com.br/s?k=notebook");

    expect(links).toHaveLength(1);
    expect(links[0].basePriceHint).toBe(4999.9);
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
    expect(details?.imageUrl).toBe("https://www.mercadolivre.com.br/images/notebook-zx-pro.jpg");
    expect(details?.coupons?.length).toBeGreaterThan(0);
  });

  it("mercado livre deve usar preco a vista e ignorar parcelamento na listagem", () => {
    const extractor = createMercadoLivreExtractor("https://lista.mercadolivre.com.br/{query}");
    const searchHtml = `
      <li class="ui-search-layout__item">
        <a class="ui-search-link" href="https://produto.mercadolivre.com.br/MLB-PRECO-001">
          Notebook Gamer Mercado Livre
        </a>
        <div class="poly-price__current">
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">4.999</span>
            <span class="andes-money-amount__cents">90</span>
          </span>
        </div>
        <div class="poly-price__installments">
          10x de
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">900</span>
          </span>
          sem juros
        </div>
      </li>
    `;

    const links = extractor.extractSearchCandidates(searchHtml, "https://lista.mercadolivre.com.br/notebook");

    expect(links).toHaveLength(1);
    expect(links[0].basePriceHint).toBe(4999.9);
  });

  it("mercado livre nao deve usar parcela como preco principal quando nao ha preco a vista", () => {
    const extractor = createMercadoLivreExtractor("https://lista.mercadolivre.com.br/{query}");
    const searchHtml = `
      <li class="ui-search-layout__item">
        <a class="ui-search-link" href="https://produto.mercadolivre.com.br/MLB-PRECO-002">
          Notebook Gamer Sem Preco A Vista
        </a>
        <div class="poly-price__installments">
          10x de
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">900</span>
          </span>
          sem juros
        </div>
      </li>
    `;

    const links = extractor.extractSearchCandidates(searchHtml, "https://lista.mercadolivre.com.br/notebook");

    expect(links).toHaveLength(1);
    expect(links[0].basePriceHint).toBeNull();
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
    expect(details?.imageUrl ?? null).toBeNull();
    expect(details?.taxAmount).toBe(9.9);
  });
});
