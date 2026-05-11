import { describe, expect, it } from "vitest";
import { renderSearchPage } from "../src/ui/searchTemplates";

describe("search page template", () => {
  it("renderiza o front novo do garimpei", () => {
    const html = renderSearchPage();

    expect(html).toContain("garimpei - Comparador de Precos");
    expect(html).toContain('<span class="logo-text">garimpei</span>');
    expect(html).toContain('<span class="footer-logo">garimpei</span>');
    expect(html).toContain('<link rel="icon" type="image/png" href="/assets/imgs/garimpei-logo.png">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/assets/imgs/garimpei-logo.png">');
    expect(html).toContain('<img src="/assets/imgs/garimpei-logo.png" alt="garimpei">');
    expect(html).toContain("Compare precos e");
    expect(html).toContain("Buscar melhores ofertas");
    expect(html).toContain("id=\"product\"");
    expect(html).toContain("id=\"zipCode\"");
    expect(html).not.toContain("PreciFacil");
  });

  it("forca refresh no submit e ignora polling antigo", () => {
    const html = renderSearchPage();

    expect(html).toContain("forceRefresh: true");
    expect(html).toContain("let activeSearchId = null");
    expect(html).toContain("let searchSequence = 0");
    expect(html).toContain("expectedSearchId !== activeSearchId || sequence !== searchSequence");
  });

  it("usa logos png locais das lojas com mapa fixo", () => {
    const html = renderSearchPage();

    expect(html).toContain("const STORE_LOGOS");
    expect(html).toContain("/assets/store-logos/Amazon_icon.png");
    expect(html).toContain("/assets/store-logos/Logotipo_MercadoLivre.png");
    expect(html).toContain("/assets/store-logos/shopee-bag-logo-free-transparent-icon-17.png");
    expect(html).toContain("normalizeStoreKey");
    expect(html).not.toContain("'/assets/store-logos/' + result.store");
  });

  it("exibe cedulas/moedas inteiras na animacao de dinheiro", () => {
    const html = renderSearchPage();

    expect(html).toContain("/assets/imgs/moeda1real-removebg-preview.png");
    expect(html).toContain('"shape":"coin"');
    expect(html).toContain('"shape":"note"');
    expect(html).toContain("object-fit: contain");
    expect(html).toContain(".currency-animation.currency-shape-round");
    expect(html).toContain(".currency-animation.currency-shape-note");
    expect(html).toContain("currency-shape-round");
    expect(html).toContain("currency-shape-note");
    expect(html).toContain("applyCurrencyShape");
  });

  it("reforca bordas dos campos do formulario", () => {
    const html = renderSearchPage();

    expect(html).toContain("border: 1.5px solid var(--border-light)");
    expect(html).toContain(".dark .form-input { border-color: #475569; }");
    expect(html).toContain("html:not(.dark) .form-input { border-color: #cbd5e1; }");
  });
});
