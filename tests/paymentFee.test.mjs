import test from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_FEE_DEFAULTS,
  cardProcessingFee,
  publicPriceIncludingCardFee,
  validatePaymentFeeConfig,
} from "../src/utils/paymentFee.js";

test("valor de partida desactivado, no configura precios públicos por sí solo", () => {
  assert.equal(PAYMENT_FEE_DEFAULTS.enabled, false);
});

test("3.50% + IVA del 16% conserva $2,400 después de comisión", () => {
  const config = { rate_percent: 3.5, fixed_fee_mxn: 0, vat_percent: 16 };
  const finalPrice = publicPriceIncludingCardFee(2400, config);
  assert.equal(finalPrice, 2501.56);
  assert.equal(cardProcessingFee(finalPrice, config), 101.56);
  assert.ok(finalPrice - cardProcessingFee(finalPrice, config) >= 2400);
});

test("cuota fija más tasa variable e IVA se calculan sobre el precio público", () => {
  const config = { rate_percent: 2.99, fixed_fee_mxn: 1, vat_percent: 16 };
  const finalPrice = publicPriceIncludingCardFee(2400, config);
  assert.ok(finalPrice - cardProcessingFee(finalPrice, config) >= 2400);
  assert.ok(finalPrice - 0.01 - cardProcessingFee(finalPrice - 0.01, config) < 2400);
});

test("IVA de la comisión no se confunde con IVA de la venta", () => {
  const config = { rate_percent: 3.5, fixed_fee_mxn: 0, vat_percent: 0 };
  assert.equal(cardProcessingFee(2400, config), 84);
});

test("objetivo de cero no genera precio positivo por cuota fija", () => {
  assert.equal(publicPriceIncludingCardFee(0, { rate_percent: 4, fixed_fee_mxn: 5, vat_percent: 16 }), 0);
});

test("tarifas negativas y desproporcionadas se rechazan", () => {
  const config = { rate_percent: -1, fixed_fee_mxn: 0, vat_percent: 16 };
  assert.equal(validatePaymentFeeConfig(config), false);
  assert.throws(() => publicPriceIncludingCardFee(2400, config), /inválida/);
  assert.equal(validatePaymentFeeConfig({ rate_percent: 30, fixed_fee_mxn: 0, vat_percent: 16 }), false);
});
