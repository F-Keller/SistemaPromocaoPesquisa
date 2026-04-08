import { describe, expect, it } from "vitest";
import { renderSearchPage } from "../src/ui/searchTemplates";

describe("search page template", () => {
  it("deve renderizar formulario de busca com endereco completo", () => {
    const html = renderSearchPage();

    expect(html).toContain("Comparador de Precos");
    expect(html).toContain("id=\"query\"");
    expect(html).toContain("id=\"street\"");
    expect(html).toContain("id=\"zipCode\"");
    expect(html).toContain("/api/searches");
  });
});