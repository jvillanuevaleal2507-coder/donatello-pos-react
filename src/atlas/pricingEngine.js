const DEFAULTS = {
  exchangeRate: 20,
  commissionPercent: 15,
  taxPercent: 8.25,
  extraCostMxn: 0,
  minimumMarginPercent: 50,
  opportunityThresholdMxn: 5000,
  marketFraction: 0.5,
  roundingStep: 50,
  maximumMarketFraction: 0.85,
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function money(value) {
  return Number(number(value).toFixed(2));
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
    options.referencePrice,
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
      options.referenceCurrency ||
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

function calculateMarkupPercent(salePrice, totalCostMxn) {
  const price = Math.max(0, number(salePrice));
  const cost = Math.max(0, number(totalCostMxn));

  if (cost <= 0) return 0;

  return ((price - cost) / cost) * 100;
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

  const exactMinimumPrice =
    totalCostMxn > 0
      ? totalCostMxn / (1 - targetMargin / 100)
      : 0;

  let safePrice = roundPriceUp(
    Math.max(number(candidatePrice), exactMinimumPrice),
    roundingStep
  );

  while (
    safePrice > 0 &&
    calculateMarginPercent(safePrice, totalCostMxn) + 1e-9 < targetMargin
  ) {
    safePrice += Math.max(1, number(roundingStep, DEFAULTS.roundingStep));
  }

  return {
    exactMinimumPrice: money(exactMinimumPrice),
    safeMinimumPrice: safePrice,
    targetMarginPercent: targetMargin,
  };
}

function resolveMarketValueMxn({
  referencePrice,
  referenceCurrency,
  fixedMarketValueMxn,
  exchangeRate,
}) {
  const lockedMarketValue = number(fixedMarketValueMxn, 0);

  if (lockedMarketValue > 0) {
    return money(lockedMarketValue);
  }

  if (!(referencePrice > 0)) return 0;

  return money(
    referenceCurrency === "MXN"
      ? referencePrice
      : referencePrice * exchangeRate
  );
}

function buildStrategy({
  fixedSuggestedPrice,
  marketValueMxn,
  opportunityThresholdMxn,
  marketOpportunityPrice,
}) {
  if (number(fixedSuggestedPrice, 0) > 0) {
    return {
      candidatePrice: number(fixedSuggestedPrice),
      strategy: "locked_reference",
    };
  }

  if (
    marketValueMxn >= opportunityThresholdMxn &&
    marketOpportunityPrice > 0
  ) {
    return {
      candidatePrice: marketOpportunityPrice,
      strategy: "market_opportunity",
    };
  }

  if (marketOpportunityPrice > 0) {
    return {
      candidatePrice: marketOpportunityPrice,
      strategy: "balanced_market",
    };
  }

  return {
    candidatePrice: 0,
    strategy: "minimum_margin",
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
  const commissionMxn = baseCostMxn * (normalizedCommission / 100);
  const taxMxn = baseCostMxn * (normalizedTax / 100);
  const totalCostMxn =
    baseCostMxn + commissionMxn + taxMxn + normalizedExtra;

  return {
    costUsd: normalizedCostUsd,
    exchangeRate: normalizedExchangeRate,
    commissionPercent: normalizedCommission,
    taxPercent: normalizedTax,
    baseCostMxn: money(baseCostMxn),
    commissionMxn: money(commissionMxn),
    taxMxn: money(taxMxn),
    extraCostMxn: money(normalizedExtra),
    totalCostMxn: money(totalCostMxn),
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

  const exchangeRate = Math.max(
    0,
    number(config.exchangeRate, DEFAULTS.exchangeRate)
  );

  const referencePrice = getReferencePrice(product, config);
  const referenceCurrency = getReferenceCurrency(product, config);

  const marketValueMxn = resolveMarketValueMxn({
    referencePrice,
    referenceCurrency,
    fixedMarketValueMxn: config.fixedMarketValueMxn,
    exchangeRate,
  });

  const marketFraction = clamp(
    number(config.marketFraction, DEFAULTS.marketFraction),
    0.25,
    number(config.maximumMarketFraction, DEFAULTS.maximumMarketFraction)
  );

  const marketOpportunityPrice =
    marketValueMxn > 0
      ? roundPriceUp(
          marketValueMxn * marketFraction,
          config.roundingStep
        )
      : 0;

  const initialStrategy = buildStrategy({
    fixedSuggestedPrice: config.fixedSuggestedPrice,
    marketValueMxn,
    opportunityThresholdMxn: number(
      config.opportunityThresholdMxn,
      DEFAULTS.opportunityThresholdMxn
    ),
    marketOpportunityPrice,
  });

  const marginGuard = enforceMinimumMargin({
    candidatePrice: initialStrategy.candidatePrice,
    totalCostMxn: costBreakdown.totalCostMxn,
    minimumMarginPercent: config.minimumMarginPercent,
    roundingStep: config.roundingStep,
  });

  let suggestedPrice = marginGuard.safeMinimumPrice;
  let strategy = initialStrategy.strategy;

  if (
    strategy !== "locked_reference" &&
    initialStrategy.candidatePrice < marginGuard.safeMinimumPrice
  ) {
    strategy = "minimum_margin";
  }

  // Nunca sugerir por encima del valor de mercado salvo que el costo real
  // exija un precio mayor para respetar el margen mínimo.
  const exceedsMarketBecauseOfCost =
    marketValueMxn > 0 &&
    marginGuard.safeMinimumPrice > marketValueMxn;

  if (
    marketValueMxn > 0 &&
    suggestedPrice > marketValueMxn &&
    !exceedsMarketBecauseOfCost
  ) {
    suggestedPrice = roundPriceUp(
      marketValueMxn,
      config.roundingStep
    );
  }

  // Segunda validación obligatoria después de cualquier ajuste.
  const finalGuard = enforceMinimumMargin({
    candidatePrice: suggestedPrice,
    totalCostMxn: costBreakdown.totalCostMxn,
    minimumMarginPercent: config.minimumMarginPercent,
    roundingStep: config.roundingStep,
  });

  suggestedPrice = finalGuard.safeMinimumPrice;

  const profitMxn = suggestedPrice - costBreakdown.totalCostMxn;
  const marginPercent = calculateMarginPercent(
    suggestedPrice,
    costBreakdown.totalCostMxn
  );
  const markupPercent = calculateMarkupPercent(
    suggestedPrice,
    costBreakdown.totalCostMxn
  );

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
      ? "La alternativa conserva el precio comercial de la mejor coincidencia. Atlas solo lo eleva si fuera necesario para proteger el margen mínimo."
      : strategy === "market_opportunity"
      ? "El valor de mercado permite vender cerca de la mitad de su precio normal, manteniendo el margen mínimo."
      : strategy === "balanced_market"
      ? "El precio mantiene una ventaja clara frente al mercado y respeta el margen mínimo."
      : exceedsMarketBecauseOfCost
      ? "El costo real obliga a superar el valor de mercado detectado para no vender por debajo del margen mínimo."
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
      minimumMarginPercent: finalGuard.targetMarginPercent,
      exactMinimumPrice: finalGuard.exactMinimumPrice,
      minimumPrice: finalGuard.safeMinimumPrice,
      referencePrice: referencePrice || null,
      referenceCurrency,
      marketValueMxn,
      marketFraction: money(marketFraction),
      marketOpportunityPrice,
      suggestedPrice,
      profitMxn: money(profitMxn),
      marginPercent: money(marginPercent),
      markupPercent: money(markupPercent),
      savingsMxn: money(savingsMxn),
      savingsPercent: money(savingsPercent),
      costBreakdown,
      marginGuaranteed:
        marginPercent + 1e-9 >= finalGuard.targetMarginPercent,
      marketValueLocked:
        number(config.fixedMarketValueMxn, 0) > 0,
      priceLocked:
        number(config.fixedSuggestedPrice, 0) > 0,
      exceedsMarketBecauseOfCost,
    },
  };
}

export const PRICING_ENGINE_CONFIG = { ...DEFAULTS };
