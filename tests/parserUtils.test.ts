import { describe, expect, it } from "vitest";
import { detectBlockedHtml, parsePrimaryPriceText } from "../src/search/scraping/parserUtils";

describe("parserUtils", () => {
  it("nao deve marcar pagina valida com style_blocked:false como bloqueada", () => {
    const html = "<html><body>{\"style_blocked\":false,\"label\":\"Comprar agora\"}</body></html>";
    expect(detectBlockedHtml(html)).toBe(false);
  });

  it("deve detectar bloqueio por sinais explicitos", () => {
    const html = "<html><body>Request blocked due to suspicious traffic.</body></html>";
    expect(detectBlockedHtml(html)).toBe(true);
  });

  it("deve priorizar preco total quando texto mistura parcela e valor a vista", () => {
    const text = "12x de R$ 172,05 sem juros ou R$ 1.999,99 a vista";
    expect(parsePrimaryPriceText(text)).toBe(1999.99);
  });
});
