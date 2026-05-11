import { describe, expect, it } from "vitest";
import { AppConfig } from "../src/config/env";
import { AffiliateService } from "../src/search/affiliateService";

const makeConfig = (
  store: {
    amazon?: Partial<AppConfig["store"]["amazon"]>;
    mercadolivre?: Partial<AppConfig["store"]["mercadolivre"]>;
    shopee?: Partial<AppConfig["store"]["shopee"]>;
  } = {},
): AppConfig =>
  ({
    store: {
      amazon: {
        feedUrl: "",
        apiKey: "",
        affiliateTag: "",
        searchUrlTemplate: "",
        ...store.amazon,
      },
      mercadolivre: {
        feedUrl: "",
        apiKey: "",
        affiliateId: "",
        affiliateUrlTemplate: "",
        searchUrlTemplate: "",
        ...store.mercadolivre,
      },
      shopee: {
        feedUrl: "",
        apiKey: "",
        affiliateId: "",
        affiliateUrlTemplate: "",
        searchUrlTemplate: "",
        ...store.shopee,
      },
    },
  }) as AppConfig;

describe("AffiliateService", () => {
  it("deve adicionar tag da Amazon preservando parametros existentes", () => {
    const service = new AffiliateService(makeConfig({ amazon: { affiliateTag: "loja-20" } }));

    const url = service.buildAffiliateUrl("amazon", "https://www.amazon.com.br/dp/B0ABC12345?psc=1");

    expect(url).toBe("https://www.amazon.com.br/dp/B0ABC12345?psc=1&tag=loja-20");
  });

  it("deve substituir tag existente da Amazon", () => {
    const service = new AffiliateService(makeConfig({ amazon: { affiliateTag: "nova-20" } }));

    const url = service.buildAffiliateUrl("amazon", "https://www.amazon.com.br/dp/B0ABC12345?tag=antiga-20");

    expect(url).toBe("https://www.amazon.com.br/dp/B0ABC12345?tag=nova-20");
  });

  it("deve usar ML_AFFILIATE_ID com template do Mercado Livre", () => {
    const service = new AffiliateService(makeConfig({
      mercadolivre: {
        affiliateId: "ml-123",
        affiliateUrlTemplate: "https://afiliados.example/ml?u={url}&id={affiliateId}",
      },
    }));

    const url = service.buildAffiliateUrl("mercadolivre", "https://www.mercadolivre.com.br/MLB-123456");

    expect(url).toBe(
      "https://afiliados.example/ml?u=https%3A%2F%2Fwww.mercadolivre.com.br%2FMLB-123456&id=ml-123",
    );
  });

  it("deve manter compatibilidade com MERCADOLIVRE_AFFILIATE_ID", () => {
    const service = new AffiliateService(makeConfig({ mercadolivre: { affiliateId: "ml-legado" } }));

    const url = service.buildAffiliateUrl("mercadolivre", "https://www.mercadolivre.com.br/MLB-123456");

    expect(url).toBe("https://www.mercadolivre.com.br/MLB-123456?matt_tool=ml-legado");
  });

  it("deve usar template universal da Shopee", () => {
    const service = new AffiliateService(makeConfig({
      shopee: {
        affiliateId: "shp-77",
        affiliateUrlTemplate:
          "https://affiliate.shopee.com.br/universal-link?target={url}&affiliate_id={affiliateId}",
      },
    }));

    const url = service.buildAffiliateUrl("shopee", "https://shopee.com.br/product-i.123.987");

    expect(url).toBe(
      "https://affiliate.shopee.com.br/universal-link?target=https%3A%2F%2Fshopee.com.br%2Fproduct-i.123.987&affiliate_id=shp-77",
    );
  });

  it("deve retornar URL original quando nao houver id de afiliado", () => {
    const service = new AffiliateService(makeConfig());
    const original = "https://shopee.com.br/product-i.123.987";

    expect(service.buildAffiliateUrl("shopee", original)).toBe(original);
  });

  it("deve retornar URL original quando URL for invalida", () => {
    const service = new AffiliateService(makeConfig({ amazon: { affiliateTag: "loja-20" } }));
    const original = "not a valid url";

    expect(service.buildAffiliateUrl("amazon", original)).toBe(original);
  });
});
