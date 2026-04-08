import { formatCurrency } from "./utils";

interface MessageInput {
  hookText: string;
  ctaText: string;
  title: string;
  currentPrice: number;
  referencePrice?: number | null;
  discountPercent?: number;
  store: string;
  link: string;
}

export function renderDealMessage(input: MessageInput): string {
  const intro = `${input.hookText} ${input.title}`;

  const priceLine = input.referencePrice && input.referencePrice > input.currentPrice
    ? `de ${formatCurrency(input.referencePrice)} por ${formatCurrency(input.currentPrice)}`
    : `por apenas ${formatCurrency(input.currentPrice)}`;

  const discountLine = input.discountPercent && input.discountPercent > 0
    ? `Desconto: ${input.discountPercent.toFixed(1)}%`
    : "";

  const storeLine = `Loja: ${input.store}`;

  return [intro, priceLine, discountLine, storeLine, input.ctaText, input.link]
    .filter(Boolean)
    .join("\n");
}
