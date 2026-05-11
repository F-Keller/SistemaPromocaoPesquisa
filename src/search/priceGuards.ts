import { MarketplaceName } from "./types";

const HIGH_VALUE_TERMS = [
  "ar condicionado",
  "celular",
  "computador",
  "console",
  "desktop",
  "drone",
  "eletro",
  "fogao",
  "gamer",
  "geladeira",
  "iphone",
  "ipad",
  "laptop",
  "lavadora",
  "lava e seca",
  "macbook",
  "monitor",
  "notebook",
  "playstation",
  "projetor",
  "smartphone",
  "tablet",
  "televisao",
  "televisor",
  "tv",
  "xbox",
];

const ACCESSORY_TERMS = [
  "adaptador",
  "bateria",
  "bolsa",
  "cabo",
  "capa",
  "capinha",
  "carregador",
  "case",
  "controle remoto",
  "display",
  "fonte",
  "hdmi",
  "memoria",
  "mouse",
  "pelicula",
  "peca",
  "ssd",
  "suporte",
  "teclado",
  "tela",
];

const normalizeForPriceGuard = (value: string | null | undefined): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function isHighValueProductText(...values: Array<string | null | undefined>): boolean {
  const text = normalizeForPriceGuard(values.join(" "));
  if (!text) return false;
  return HIGH_VALUE_TERMS.some((term) => text.includes(term));
}

export function isAccessoryLikeProductText(...values: Array<string | null | undefined>): boolean {
  const text = normalizeForPriceGuard(values.join(" "));
  if (!text) return false;
  return ACCESSORY_TERMS.some((term) => text.includes(term));
}

export function isSuspiciousMarketplacePrice(input: {
  store: MarketplaceName;
  price: number;
  query?: string | null;
  title?: string | null;
}): boolean {
  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0) return true;
  if (input.store !== "mercadolivre") return false;
  if (price >= 100) return false;

  return isHighValueProductText(input.query, input.title) && !isAccessoryLikeProductText(input.query, input.title);
}
