interface ScoreInput {
  currentPrice: number;
  referencePrice?: number | null;
  historicalAverage?: number | null;
  discountPercent: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function calculateDealScore(input: ScoreInput): number {
  const discountComponent = clamp(input.discountPercent, 0, 90) * 0.55;

  const cheapnessBase = clamp(300 - input.currentPrice, 0, 300) / 3;
  const cheapnessComponent = cheapnessBase * 0.2;

  let trendComponent = 0;
  if (input.historicalAverage && input.historicalAverage > 0) {
    const trend = ((input.historicalAverage - input.currentPrice) / input.historicalAverage) * 100;
    trendComponent = clamp(trend, -20, 40) * 0.25;
  }

  const score = discountComponent + cheapnessComponent + trendComponent;
  return Number(clamp(score, 0, 100).toFixed(2));
}
