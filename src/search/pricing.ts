import { CouponCandidate, CouponEvaluation, ShippingOption } from "./types";

const MONEY_FACTOR = 100;

export const toMoney = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * MONEY_FACTOR) / MONEY_FACTOR);
};

const isCouponExpired = (expiresAt: string | null | undefined, now = new Date()): boolean => {
  if (!expiresAt) return false;
  const expiration = new Date(expiresAt);
  if (Number.isNaN(expiration.getTime())) return false;
  return expiration.getTime() < now.getTime();
};

export const evaluateCoupons = (
  basePrice: number,
  coupons: CouponCandidate[],
  now = new Date(),
): CouponEvaluation[] => {
  const cleanBasePrice = toMoney(basePrice);

  return coupons.map((coupon) => {
    const minOrderValue = coupon.minOrderValue ?? null;
    const isActive = coupon.isActive && !isCouponExpired(coupon.expiresAt, now);
    const minOrderSatisfied = minOrderValue === null || cleanBasePrice >= minOrderValue;
    const isEligible = isActive && minOrderSatisfied;

    let discountAmount = 0;
    if (isEligible) {
      if (coupon.discountType === "percent") {
        discountAmount = cleanBasePrice * (coupon.discountValue / 100);
      } else {
        discountAmount = coupon.discountValue;
      }
    }

    discountAmount = toMoney(Math.min(cleanBasePrice, Math.max(0, discountAmount)));
    const finalPriceIfApplied = toMoney(cleanBasePrice - discountAmount);

    return {
      name: coupon.name,
      code: coupon.code,
      rules: coupon.rules,
      discountType: coupon.discountType,
      discountValue: toMoney(coupon.discountValue),
      minOrderValue,
      isEligible,
      isActive,
      discountAmount,
      finalPriceIfApplied,
    };
  });
};

export const chooseBestCoupon = (evaluations: CouponEvaluation[]): CouponEvaluation | null => {
  const eligible = evaluations.filter((coupon) => coupon.isEligible);
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    if (a.finalPriceIfApplied !== b.finalPriceIfApplied) {
      return a.finalPriceIfApplied - b.finalPriceIfApplied;
    }
    if (a.discountAmount !== b.discountAmount) {
      return b.discountAmount - a.discountAmount;
    }
    return a.code.localeCompare(b.code);
  });

  return eligible[0];
};

export const chooseLowestShipping = (options: ShippingOption[]): ShippingOption | null => {
  const cleanOptions = options
    .map((option) => ({
      name: option.name,
      cost: toMoney(option.cost),
      etaDays: option.etaDays ?? null,
    }))
    .filter((option) => Number.isFinite(option.cost));

  if (cleanOptions.length === 0) return null;

  cleanOptions.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.name.localeCompare(b.name);
  });

  return cleanOptions[0];
};