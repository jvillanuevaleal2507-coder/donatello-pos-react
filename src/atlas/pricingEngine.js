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

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundPriceUp(value, step = DEFAULTS.roundingStep) {
  const amount = Math.max(0, number(value));
  const safeStep = Math.max(1, number(step, DEFAULTS.roundingStep));

  if (amount <= 0) return 0;

  return Math.ceil(amount / safeStep) * safeStep;
}

function getReferencePrice(product = {}, options = {}) {
  const candidates = [
    options.fixedReferencePrice,
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

function getReferenceCurrency(product = {}, options = {}) {
  return String(
    options.fixedReferenceCurrency ||
      product.referenceCurrency ||
      product.rawResult?.currency ||
      product.rawResult?.raw?.price?.currency ||
      "USD"
  ).toUpperCase();
}

function calculateMarginPercent(salePrice, totalCostMxn) {
  const price = Math.max(0, number(salePrice));
  const cost = Math.max(0, number(totalCostMxn));

  if (price <= 0) return 0;

  return ((price - cost) / price) * 100;
}

function enforceMinimumMargin({
  candidatePrice,
  totalCostMxn,
  minimumMarginPercent,
  roundingStep,
}) {
  const targetMargin = clamp(
    number(minimumMarginPercent, DEFAULTS.minimumMarginPercent),
    0,
    95
  );

  const marginDecimal = targetMargin / 100;

  const exactMinimumPrice =
    totalCostMxn > 0
      ? totalCostMxn / (1 - marginDecimal)
      : 0;

  let safePrice = roundPriceUp(
    Math.max(candidatePrice, exactMinimumPrice),
    roundingStep
  );

  while (
    safePrice > 0 &&
    calculateMarginPercent(safePrice, totalCostMxn) + 1e-9 < targetMargin
  ) {
    safePrice += Math.max(1, number(roundingStep, 50));
  }

  return {
    exactMinimumPrice: Number(exactMinimumPrice.toFixed(2)),
    safeMinimumPrice: safePrice,
    targetMarginPercent: targetMargin,
  };
}

export function calculateTotalCostMxn({
  costUsd,
  exchangeRate = DEFAULTS.exchangeRate,
  commissionPercent = DEFAULTS.commissionPercent,
  taxPercent = DEFAULTS.taxPercent,
  extraCostMxn = DEFAULTS.extraCostMxn,
} = {}) {
  const normalizedCostUsd = Math.max(0, number(costUsd));
  const normalizedExchangeRate = Math.max(
    0,
    number(exchangeRate, DEFAULTS.exchangeRate)
  );
  const normalizedCommission = Math.max(
    0,
    number(commissionPercent, DEFAULTS.commissionPercent)
  );
  const normalizedTax = Math.max(
    0,
    number(taxPercent, DEFAULTS.taxPercent)
  );
  const normalizedExtra = Math.max(0, number(extraCostMxn));

  const baseCostMxn = normalizedCostUsd * normalizedExchangeRate;
  const commissionMxn =
    baseCostMxn * (normalizedCommission / 100);
  const taxMxn =
    baseCostMxn * (normalizedTax / 100);

  const totalCostMxn =
    baseCostMxn +
    commissionMxn +
    taxMxn +
    normalizedExtra;

  return {
    costUsd: normalizedCostUsd,
    exchangeRate: normalizedExchangeRate,
    commissionPercent: normalizedCommission,
    taxPercent: normalizedTax,
    baseCostMxn: Number(baseCostMxn.toFixed(2)),
    commissionMxn: Number(commissionMxn.toFixed(2)),
    taxMxn: Number(taxMxn.toFixed(2)),
    extraCostMxn: normalizedExtra,
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

  const referencePrice = getReferencePrice(product, config);
  const referenceCurrency = getReferenceCurrency(product, config);

  const marketValueMxn =
    referencePrice > 0
      ? referenceCurrency === "MXN"
        ? referencePrice
        : referencePrice * number(config.exchangeRate, DEFAULTS.exchangeRate)
      : 0;

  const marketOpportunityPrice =
    marketValueMxn > 0
      ? roundPriceUp(
          marketValueMxn *
            clamp(
              number(config.marketFraction, DEFAULTS.marketFraction),
              0.25,
              0.9
            ),
          config.roundingStep
        )
      : 0;

  let candidatePrice = 0;
  let strategy = "minimum_margin";

  if (number(config.fixedSuggestedPrice, 0) > 0) {
    candidatePrice = number(config.fixedSuggestedPrice);
    strategy = "locked_reference";
  } else if (
    marketValueMxn >=
      number(
        config.opportunityThresholdMxn,
        DEFAULTS.opportunityThresholdMxn
      ) &&
    marketOpportunityPrice > 0
  ) {
    candidatePrice = marketOpportunityPrice;
    strategy = "market_opportunity";
  } else if (marketOpportunityPrice > 0) {
    candidatePrice = marketOpportunityPrice;
    strategy = "balanced_market";
  }

  const marginGuard = enforceMinimumMargin({
    candidatePrice,
    totalCostMxn: costBreakdown.totalCostMxn,
    minimumMarginPercent: config.minimumMarginPercent,
    roundingStep: config.roundingStep,
  });

  const suggestedPrice = marginGuard.safeMinimumPrice;

  if (
    strategy !== "locked_reference" &&
    candidatePrice < marginGuard.safeMinimumPrice
  ) {
    strategy = "minimum_margin";
  }

  const profitMxn =
    suggestedPrice - costBreakdown.totalCostMxn;

  const marginPercent = calculateMarginPercent(
    suggestedPrice,
    costBreakdown.totalCostMxn
  );

  const markupPercent =
    costBreakdown.totalCostMxn > 0
      ? (profitMxn / costBreakdown.totalCostMxn) * 100
      : 0;

  const savingsMxn =
    marketValueMxn > 0
      ? Math.max(0, marketValueMxn - suggestedPrice)
      : 0;

  const savingsPercent =
    marketValueMxn > 0
      ? (savingsMxn / marketValueMxn) * 100
      : 0;

  const strategyLabel =
    strategy === "locked_reference"
      ? "Precio conservado de la mejor coincidencia"
      : strategy === "market_opportunity"
      ? "Aproximadamente la mitad del valor de mercado"
      : strategy === "balanced_market"
      ? "Equilibrio entre margen y valor de mercado"
      : "Margen mínimo garantizado";

  const explanation =
    strategy === "locked_reference"
      ? "La alternativa conserva la decisión comercial de la mejor coincidencia, pero Atlas eleva el precio si fuera necesario para respetar el margen mínimo."
      : strategy === "market_opportunity"
      ? "El producto tiene un valor de mercado alto y el precio sugerido aprovecha esa oportunidad sin bajar del margen mínimo."
      : strategy === "balanced_market"
      ? "El precio mantiene una ventaja frente al mercado y respeta el margen mínimo."
      : "El precio fue redondeado hacia arriba para garantizar el margen mínimo configurado.";

  return {
    ...product,
    referencePrice: referencePrice || null,
    referenceCurrency,
    suggestedPrice: suggestedPrice || "",
    pricing: {
      strategy,
      strategyLabel,
      explanation,
      minimumMarginPercent: marginGuard.targetMarginPercent,
      exactMinimumPrice: marginGuard.exactMinimumPrice,
      minimumPrice: marginGuard.safeMinimumPrice,
      marketValueMxn: Number(marketValueMxn.toFixed(2)),
      marketOpportunityPrice,
      suggestedPrice,
      profitMxn: Number(profitMxn.toFixed(2)),
      marginPercent: Number(marginPercent.toFixed(2)),
      markupPercent: Number(markupPercent.toFixed(2)),
      savingsMxn: Number(savingsMxn.toFixed(2)),
      savingsPercent: Number(savingsPercent.toFixed(2)),
      costBreakdown,
      marginGuaranteed:
        marginPercent + 1e-9 >= marginGuard.targetMarginPercent,
    },
  };
}

export const PRICING_ENGINE_CONFIG = { ...DEFAULTS };
