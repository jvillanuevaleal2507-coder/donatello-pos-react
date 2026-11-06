// Costeo de cobro con tarjeta, separado del costo de adquisición del producto.
// La tarifa se calcula sobre el precio final cobrado al cliente.
export const PAYMENT_FEE_DEFAULTS = Object.freeze({
  enabled: false,
  provider: "Por definir",
  rate_percent: 3.5,
  fixed_fee_mxn: 0,
  vat_percent: 16,
});

const cents = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validatePaymentFeeConfig(config) {
  const rate = Number(config?.rate_percent);
  const fixed = Number(config?.fixed_fee_mxn);
  const vat = Number(config?.vat_percent);
  return Number.isFinite(rate) && rate >= 0 && rate <= 20
    && Number.isFinite(fixed) && fixed >= 0 && fixed <= 1000
    && Number.isFinite(vat) && vat >= 0 && vat <= 30;
}

export function cardProcessingFee(publicPrice, config) {
  if (!validatePaymentFeeConfig(config)) throw new Error("Tarifa de tarjeta inválida");
  const gross = Math.max(0, Number(publicPrice) || 0);
  if (gross === 0) return 0;
  const rate = Number(config.rate_percent) / 100;
  const fixed = Number(config.fixed_fee_mxn);
  const vatFactor = 1 + Number(config.vat_percent) / 100;
  return cents((gross * rate + fixed) * vatFactor);
}

export function publicPriceIncludingCardFee(targetNetPrice, config) {
  if (!validatePaymentFeeConfig(config)) throw new Error("Tarifa de tarjeta inválida");
  const target = Number(targetNetPrice);
  if (!Number.isFinite(target) || target <= 0) return 0;
  const vatFactor = 1 + Number(config.vat_percent) / 100;
  const proportion = (Number(config.rate_percent) / 100) * vatFactor;
  const fixed = Number(config.fixed_fee_mxn) * vatFactor;
  if (proportion >= 1) throw new Error("La comisión absorbe toda la venta");
  // Despejar P de P - [(P * tasa + fijo) * (1 + IVA)] = precio objetivo.
  let publicPrice = Math.ceil(((target + fixed) / (1 - proportion) - 1e-9) * 100) / 100;
  // Garantiza objetivo neto incluso con redondeo de la comisión a centavos.
  for (let i = 0; i < 3 && publicPrice - cardProcessingFee(publicPrice, config) < target - 0.00001; i += 1) {
    publicPrice = cents(publicPrice + 0.01);
  }
  // La comisión real se redondea a centavos; un centavo menos puede
  // conservar el mismo neto. Buscar el menor precio sin perder utilidad.
  for (let i = 0; i < 3 && publicPrice >= 0.02; i += 1) {
    const candidate = cents(publicPrice - 0.01);
    if (candidate - cardProcessingFee(candidate, config) < target - 0.00001) break;
    publicPrice = candidate;
  }
  return publicPrice;
}

/**
 * Precio único comercial para efectivo o tarjeta: conserva el neto objetivo
 * bajo la tarifa configurada, sin publicar centavos o importes irregulares.
 *  $0-$999.99: múltiplos de $10; $1,000-$2,999.99: $50; desde $3,000: $100.
 * Redondeo siempre hacia arriba, nunca redondear hacia abajo una comisión.
 */
export function commercialPublicPriceIncludingCardFee(targetNetPrice, config) {
  const minimum = publicPriceIncludingCardFee(targetNetPrice, config);
  if (minimum === 0) return 0;
  const step = minimum < 1000 ? 10 : minimum < 3000 ? 50 : 100;
  let commercial = Math.ceil((minimum - 1e-9) / step) * step;
  for (let attempt = 0; attempt < 5 && commercial - cardProcessingFee(commercial, config) < Number(targetNetPrice) - 0.00001; attempt += 1) {
    commercial += step;
  }
  if (commercial - cardProcessingFee(commercial, config) < Number(targetNetPrice) - 0.00001) {
    throw new Error("No se puede conservar el neto al redondear el precio");
  }
  return commercial;
}
