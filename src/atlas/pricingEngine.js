const DEFAULTS = {
  exchangeRate: 20,
  commissionPercent: 15,
  taxPercent: 8.25,
  extraCostMxn: 0,
  minimumMarginPercent: 50,
  opportunityThresholdMxn: 5000,
  marketFraction: 0.5,
  roundingStep: 50,
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundPrice(value, step = DEFAULTS.roundingStep) {
  const safeStep = Math.max(1, number(step, 50));
  return Math.round(number(value) / safeStep) * safeStep;
}

function getReferencePrice(product = {}) {
  const candidates = [
    product.referencePrice,
    product.rawResult?.price,
    product.rawResult?.extracted_price,
    product.rawResult?.metadata?.price,
    product.rawResult?.raw?.price?.extracted_value,
    product.rawResult?.raw?.extracted_price,
  ];

  for (const candidate of candidates) {
    const value = number(candidate, 0);
    if (value > 0) return value;
  }

  return 0;
}

function getReferenceCurrency(product = {}) {
  return (
    product.referenceCurrency ||
    product.rawResult?.currency ||
    product.rawResult?.raw?.price?.currency ||
    "USD"
  );
}

export function calculateTotalCostMxn({
  costUsd,
  exchangeRate = DEFAULTS.exchangeRate,
  commissionPercent = DEFAULTS.commissionPercent,
  taxPercent = DEFAULTS.taxPercent,
  extraCostMxn = DEFAULTS.extraCostMxn,
} = {}) {
  const baseCostMxn = Math.max(0, number(costUsd)) * Math.max(0, number(exchangeRate, 20));
  const commissionMxn = baseCostMxn * (Math.max(0, number(commissionPercent, 15)) / 100);
  const taxMxn = baseCostMxn * (Math.max(0, number(taxPercent, 8.25)) / 100);
  const totalCostMxn =
    baseCostMxn + commissionMxn + taxMxn + Math.max(0, number(extraCostMxn));

  return {
    baseCostMxn: Number(baseCostMxn.toFixed(2)),
    commissionMxn: Number(commissionMxn.toFixed(2)),
    taxMxn: Number(taxMxn.toFixed(2)),
    extraCostMxn: Math.max(0, number(extraCostMxn)),
    totalCostMxn: Number(totalCostMxn.toFixed(2)),
  };
}

export function applyPricingToProduct(product = {}, options = {}) {
  const config = { ...DEFAULTS, ...options };

  const costBreakdown = calculateTotalCostMxn({
    costUsd: product.costUsd,
    exchangeRate: config.exchangeRate,
    commissionPercent: config.commissionPercent,
    taxPercent: config.taxPercent,
    extraCostMxn: config.extraCostMxn,
  });

  const marginDecimal = Math.min(
    0.95,
    Math.max(0, number(config.minimumMarginPercent, 50) / 100)
  );

  const minimumPrice = roundPrice(
    costBreakdown.totalCostMxn / (1 - marginDecimal),
    config.roundingStep
  );

  const referencePrice = getReferencePrice(product);
  const referenceCurrency = getReferenceCurrency(product).toUpperCase();
  const marketValueMxn =
    referencePrice > 0
      ? referenceCurrency === "MXN"
        ? referencePrice
        : referencePrice * number(config.exchangeRate, 20)
      : 0;

  const marketOpportunityPrice =
    marketValueMxn > 0
      ? roundPrice(
          marketValueMxn * number(config.marketFraction, 0.5),
          config.roundingStep
        )
      : 0;

  let suggestedPrice = minimumPrice;
  let strategy = "minimum_margin";

  if (
    marketValueMxn >= number(config.opportunityThresholdMxn, 5000) &&
    marketOpportunityPrice > minimumPrice
  ) {
    suggestedPrice = marketOpportunityPrice;
    strategy = "market_opportunity";
  } else if (
    marketOpportunityPrice >= minimumPrice &&
    marketOpportunityPrice > 0
  ) {
    suggestedPrice = marketOpportunityPrice;
    strategy = "balanced_market";
  }

  suggestedPrice = Math.max(minimumPrice, suggestedPrice);

  const profitMxn = suggestedPrice - costBreakdown.totalCostMxn;
  const marginPercent =
    suggestedPrice > 0 ? (profitMxn / suggestedPrice) * 100 : 0;
  const savingsMxn =
    marketValueMxn > 0 ? Math.max(0, marketValueMxn - suggestedPrice) : 0;
  const savingsPercent =
    marketValueMxn > 0 ? (savingsMxn / marketValueMxn) * 100 : 0;

  return {
    ...product,
    referencePrice: referencePrice || null,
    referenceCurrency,
    suggestedPrice: suggestedPrice || "",
    pricing: {
      strategy,
      minimumPrice,
      marketValueMxn: Number(marketValueMxn.toFixed(2)),
      marketOpportunityPrice,
      suggestedPrice,
      profitMxn: Number(profitMxn.toFixed(2)),
      marginPercent: Number(marginPercent.toFixed(1)),
      savingsMxn: Number(savingsMxn.toFixed(2)),
      savingsPercent: Number(savingsPercent.toFixed(1)),
      costBreakdown,
    },
  };
}

export const PRICING_ENGINE_CONFIG = { ...DEFAULTS };
