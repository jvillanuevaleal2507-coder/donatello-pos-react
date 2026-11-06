import test from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_FEE_DEFAULTS,
  cardProcessingFee,
  publicPriceIncludingCardFee,
  commercialPublicPriceIncludingCardFee,
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

test("precios comerciales Donatello conservan el neto sin decimales", () => {
  const config = { rate_percent: 3.5, fixed_fee_mxn: 0, vat_percent: 16 };
  const expected = [[300,320],[350,370],[850,890],[950,1000],[1300,1400],[1450,1550],[1700,1800],[1800,1900],[2500,2650],[3200,3400]];
  for (const [net, gross] of expected) {
    assert.equal(commercialPublicPriceIncludingCardFee(net, config), gross);
    assert.ok(gross - cardProcessingFee(gross, config) >= net);
  }
});

test("regla de redondeo por tramos y cuotas fijas", () => {
  const config = { rate_percent: 2.99, fixed_fee_mxn: 1, vat_percent: 16 };
  for (const target of [80,500,960,1200,2400,2990,3600,6200]) {
    const price = commercialPublicPriceIncludingCardFee(target, config);
    const step = publicPriceIncludingCardFee(target, config) < 1000 ? 10 : publicPriceIncludingCardFee(target, config) < 3000 ? 50 : 100;
    assert.equal(price % step, 0);
    assert.ok(price - cardProcessingFee(price, config) >= target);
    assert.ok(price - step - cardProcessingFee(price - step, config) < target);
  }
});

test("objetivo cero sigue sin precio e inválidos siguen bloqueados", () => {
  const fee = { rate_percent: 3.5, fixed_fee_mxn: 0, vat_percent: 16 };
  assert.equal(commercialPublicPriceIncludingCardFee(0, fee), 0);
  assert.throws(() => commercialPublicPriceIncludingCardFee(500, { ...fee, rate_percent: -1 }), /inválida/);
});
