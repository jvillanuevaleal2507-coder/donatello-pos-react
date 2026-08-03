const DEFAULT_PRICING_CONFIG = {
  exchangeRate: 20,
  commissionPercent: 15,
  taxPercent: 8.25,
  extraCostMxn: 0,
  minimumMarginPercent: 50,
  marketValueOpportunityThresholdMxn: 5000,
  targetMarketFraction: 0.5,
  commercialRounding: 50,
};

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function roundCommercialPrice(value, step = 50) {
  const amount = toFiniteNumber(value);
  const roundingStep = Math.max(1, toFiniteNumber(step, 50));

  if (amount <= 0) return 0;

  return Math.round(amount / roundingStep) * roundingStep;
}

export function calculateTotalCostMxn({
  costUsd,
  exchangeRate = DEFAULT_PRICING_CONFIG.exchangeRate,
  commissionPercent = DEFAULT_PRICING_CONFIG.commissionPercent,
  taxPercent = DEFAULT_PRICING_CONFIG.taxPercent,
  extraCostMxn = DEFAULT_PRICING_CONFIG.extraCostMxn,
} = {}) {
  const normalizedCostUsd = Math.max(0, toFiniteNumber(costUsd));
  const normalizedExchangeRate = Math.max(
    0,
    toFiniteNumber(exchangeRate, DEFAULT_PRICING_CONFIG.exchangeRate)
  );
  const normalizedCommission = Math.max(
    0,
    toFiniteNumber(
      commissionPercent,
      DEFAULT_PRICING_CONFIG.commissionPercent
    )
  );
  const normalizedTax = Math.max(
    0,
    toFiniteNumber(taxPercent, DEFAULT_PRICING_CONFIG.taxPercent)
  );
  const normalizedExtra = Math.max(0, toFiniteNumber(extraCostMxn));

  const baseCostMxn = normalizedCostUsd * normalizedExchangeRate;
  const commissionMxn = baseCostMxn * (normalizedCommission / 100);
  const taxMxn = baseCostMxn * (normalizedTax / 100);
  const totalCostMxn =
    baseCostMxn + commissionMxn + taxMxn + normalizedExtra;

  return {
    costUsd: normalizedCostUsd,
    exchangeRate: normalizedExchangeRate,
    baseCostMxn: Number(baseCostMxn.toFixed(2)),
    commissionPercent: normalizedCommission,
    commissionMxn: Number(commissionMxn.toFixed(2)),
    taxPercent: normalizedTax,
    taxMxn: Number(taxMxn.toFixed(2)),
    extraCostMxn: normalizedExtra,
    totalCostMxn: Number(totalCostMxn.toFixed(2)),
  };
}

export function calculateMinimumSalePrice({
  totalCostMxn,
  minimumMarginPercent = DEFAULT_PRICING_CONFIG.minimumMarginPercent,
  roundingStep = DEFAULT_PRICING_CONFIG.commercialRounding,
} = {}) {
  const cost = Math.max(0, toFiniteNumber(totalCostMxn));
  const marginPercent = clamp(
    toFiniteNumber(
      minimumMarginPercent,
      DEFAULT_PRICING_CONFIG.minimumMarginPercent
    ),
    0,
    95
  );

  if (cost <= 0) return 0;

  const marginDecimal = marginPercent / 100;
  const rawPrice = cost / (1 - marginDecimal);

  return roundCommercialPrice(rawPrice, roundingStep);
}

export function convertReferencePriceToMxn({
  referencePrice,
  referenceCurrency = "USD",
  exchangeRate = DEFAULT_PRICING_CONFIG.exchangeRate,
} = {}) {
  const price = Math.max(0, toFiniteNumber(referencePrice));
  const currency = String(referenceCurrency || "USD").toUpperCase();

  if (price <= 0) return 0;
  if (currency === "MXN") return Number(price.toFixed(2));

  return Number(
    (price * Math.max(0, toFiniteNumber(exchangeRate, 20))).toFixed(2)
  );
}

export function calculatePriceMetrics({
  salePrice,
  totalCostMxn,
} = {}) {
  const price = Math.max(0, toFiniteNumber(salePrice));
  const cost = Math.max(0, toFiniteNumber(totalCostMxn));
  const profitMxn = price - cost;
  const marginPercent =
    price > 0 ? (profitMxn / price) * 100 : 0;
  const markupPercent =
    cost > 0 ? (profitMxn / cost) * 100 : 0;

  return {
    salePrice: Number(price.toFixed(2)),
    profitMxn: Number(profitMxn.toFixed(2)),
    marginPercent: Number(marginPercent.toFixed(1)),
    markupPercent: Number(markupPercent.toFixed(1)),
  };
}

export function suggestDonatelloPrice({
  costUsd,
  exchangeRate = DEFAULT_PRICING_CONFIG.exchangeRate,
  commissionPercent = DEFAULT_PRICING_CONFIG.commissionPercent,
  taxPercent = DEFAULT_PRICING_CONFIG.taxPercent,
  extraCostMxn = DEFAULT_PRICING_CONFIG.extraCostMxn,
  referencePrice = null,
  referenceCurrency = "USD",
  minimumMarginPercent = DEFAULT_PRICING_CONFIG.minimumMarginPercent,
  marketValueOpportunityThresholdMxn =
    DEFAULT_PRICING_CONFIG.marketValueOpportunityThresholdMxn,
  targetMarketFraction = DEFAULT_PRICING_CONFIG.targetMarketFraction,
  roundingStep = DEFAULT_PRICING_CONFIG.commercialRounding,
} = {}) {
  const costBreakdown = calculateTotalCostMxn({
    costUsd,
    exchangeRate,
    commissionPercent,
    taxPercent,
    extraCostMxn,
  });

  const minimumPrice = calculateMinimumSalePrice({
    totalCostMxn: costBreakdown.totalCostMxn,
    minimumMarginPercent,
    roundingStep,
  });

  const marketValueMxn = convertReferencePriceToMxn({
    referencePrice,
    referenceCurrency,
    exchangeRate,
  });

  const normalizedTargetFraction = clamp(
    toFiniteNumber(
      targetMarketFraction,
      DEFAULT_PRICING_CONFIG.targetMarketFraction
    ),
    0.25,
    0.9
  );

  const marketOpportunityPrice =
    marketValueMxn > 0
      ? roundCommercialPrice(
          marketValueMxn * normalizedTargetFraction,
          roundingStep
        )
      : 0;

  const isHighValueOpportunity =
    marketValueMxn >=
      Math.max(
        0,
        toFiniteNumber(
          marketValueOpportunityThresholdMxn,
          DEFAULT_PRICING_CONFIG.marketValueOpportunityThresholdMxn
        )
      ) &&
    marketOpportunityPrice > minimumPrice;

  let suggestedPrice = minimumPrice;
  let strategy = "minimum_margin";
  let explanation =
    "Usé el precio mínimo que conserva el margen objetivo.";

  if (isHighValueOpportunity) {
    suggestedPrice = marketOpportunityPrice;
    strategy = "market_opportunity";
    explanation =
      "El valor de mercado permite vender cerca de la mitad de su valor real y conservar una utilidad superior al margen mínimo.";
  } else if (
    marketValueMxn > 0 &&
    marketOpportunityPrice >= minimumPrice
  ) {
    suggestedPrice = marketOpportunityPrice;
    strategy = "balanced_market";
    explanation =
      "El precio sugerido equilibra el margen mínimo con una percepción clara de ahorro frente al mercado.";
  }

  // Nunca sugerir arriba del valor normal encontrado.
  if (marketValueMxn > 0) {
    suggestedPrice = Math.min(
      suggestedPrice,
      roundCommercialPrice(marketValueMxn, roundingStep)
    );
  }

  // Nunca bajar del precio requerido para el margen mínimo.
  suggestedPrice = Math.max(suggestedPrice, minimumPrice);

  const metrics = calculatePriceMetrics({
    salePrice: suggestedPrice,
    totalCostMxn: costBreakdown.totalCostMxn,
  });

  const customerSavingsMxn =
    marketValueMxn > 0
      ? Math.max(0, marketValueMxn - suggestedPrice)
      : 0;

  const customerSavingsPercent =
    marketValueMxn > 0
      ? (customerSavingsMxn / marketValueMxn) * 100
      : 0;

  return {
    suggestedPrice,
    strategy,
    explanation,
    minimumPrice,
    marketOpportunityPrice,
    marketValueMxn,
    referencePrice: toFiniteNumber(referencePrice, 0) || null,
    referenceCurrency: String(referenceCurrency || "USD").toUpperCase(),
    customerSavingsMxn: Number(customerSavingsMxn.toFixed(2)),
    customerSavingsPercent: Number(
      customerSavingsPercent.toFixed(1)
    ),
    ...metrics,
    costBreakdown,
  };
}

export function applyPricingToProduct(product = {}, options = {}) {
  const pricing = suggestDonatelloPrice({
    costUsd: product.costUsd,
    referencePrice:
      product.referencePrice ??
      product.rawResult?.price ??
      null,
    referenceCurrency:
      product.referenceCurrency ||
      product.rawResult?.currency ||
      "USD",
    ...options,
  });

  return {
    ...product,
    suggestedPrice: pricing.suggestedPrice || "",
    pricing,
  };
}

export const PRICING_ENGINE_CONFIG = {
  ...DEFAULT_PRICING_CONFIG,
};
