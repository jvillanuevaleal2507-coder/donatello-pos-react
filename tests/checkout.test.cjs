'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Execute the actual checkout() function with an in-memory Supabase stand-in.
// No credential, network request, database write or real customer data is used.
const app = readFileSync(join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const start = app.indexOf('  async function checkout() {');
const end = app.indexOf('\n  async function startScanner()', start);
assert.ok(start >= 0 && end > start, 'checkout() source is available');
const code = app.slice(start, end);
const makeCheckout = new Function(
  'd',
  'const {cart,discountPercent,totalFinal,saleMode,received,customerName,customerPhone,depositAmount,dueDate,products,subtotal,change,originalProfit,adjustedProfit,checkoutRunningRef,supabase,setScanStatus,setLastReceipt,clearCart,loadProducts,loadSales,loadLayaways,money,window,alert,console}=d;\n'
  + code + '\nreturn checkout;'
);

function setup(overrides = {}) {
  const state = { calls: [], receipts: [], statuses: [], alerts: [], errors: [], clears: 0, loads: { products: 0, sales: 0, layaways: 0 } };
  const d = {
    cart: [{ id: 1, qty: 2, price: 2200, name: 'Lámpara' }, { id: 5, qty: 1, price: 650, name: 'Mesa' }],
    products: [{ id: 1, stock: 3 }, { id: 5, stock: 2 }],
    discountPercent: 10, totalFinal: 4545, saleMode: 'sale', received: 5000,
    customerName: '', customerPhone: '', depositAmount: '', dueDate: '2026-10-23',
    subtotal: 5050, change: 455, originalProfit: 0, adjustedProfit: 0,
    checkoutRunningRef: { current: false },
    supabase: { rpc: async (name, params) => {
      state.calls.push({ name, params });
      return { data: { id: 77, type: 'sale', total: 4545, change_amount: 455,
        items_count: 3, subtotal_original: 5050, discount_amount: 505,
        sale_items: [{ name: 'Lámpara', qty: 2, subtotal: 4400 }, { name: 'Mesa', qty: 1, subtotal: 650 }] }, error: null };
    } },
    setScanStatus: (value) => state.statuses.push(value),
    setLastReceipt: (value) => state.receipts.push(value),
    clearCart: () => { state.clears++; },
    loadProducts: async () => { state.loads.products++; },
    loadSales: async () => { state.loads.sales++; },
    loadLayaways: async () => { state.loads.layaways++; },
    money: (value) => '$' + Number(value).toFixed(2),
    window: { confirm: () => true },
    alert: (value) => state.alerts.push(value),
    console: { error: (...args) => state.errors.push(args.join(' ')) }
  };
  Object.assign(d, overrides);
  return { checkout: makeCheckout(d), state, d };
}

test('sale sends discount and items to atomic RPC, produces receipt and refreshes', async () => {
  const { checkout, state } = setup();
  await checkout();
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].name, 'donatello_checkout');
  assert.equal(state.calls[0].params.p_discount_percent, 10);
  assert.equal(state.calls[0].params.p_received, 5000);
  assert.equal(state.calls[0].params.p_items.length, 2);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].sale_items.length, 2);
  assert.equal(state.clears, 1);
  assert.equal(state.loads.products, 1);
  assert.equal(state.loads.sales, 1);
});

test('layaway sends deposit, customer and due date, produces receipt', async () => {
  const { checkout, state } = setup({
    cart: [{ id: 1, qty: 1, price: 2200, name: 'Lámpara' }],
    products: [{ id: 1, stock: 3 }], totalFinal: 2200,
    discountPercent: 0, saleMode: 'layaway', received: '',
    customerName: 'Prueba local', depositAmount: '250',
    supabase: { rpc: async (name, params) => {
      state.calls.push({ name, params });
      return { data: { id: 8, type: 'layaway', deposit: 250, balance: 1950,
        total: 2200, sale_items: [{ name: 'Lámpara', qty: 1, subtotal: 2200 }] }, error: null };
    } }
  });
  await checkout();
  assert.equal(state.calls[0].params.p_mode, 'layaway');
  assert.equal(state.calls[0].params.p_deposit, 250);
  assert.equal(state.calls[0].params.p_customer_name, 'Prueba local');
  assert.equal(state.calls[0].params.p_due_date, '2026-10-23');
  assert.equal(state.receipts.length, 1);
  assert.equal(state.loads.layaways, 1);
});

test('RPC refusal retains cart and shows error', async () => {
  const { checkout, state } = setup({
    supabase: { rpc: async (name, params) => {
      state.calls.push({ name, params });
      return { data: null, error: { message: 'Existencia insuficiente' } };
    } }
  });
  await checkout();
  assert.equal(state.clears, 0);
  assert.equal(state.receipts.length, 0);
  assert.match(state.statuses.at(-1), /antes de intentarlo/i);
});

test('uncertain network response keeps cart and warns about duplicates', async () => {
  const { checkout, state } = setup({
    supabase: { rpc: async () => { throw new Error('network'); } }
  });
  await checkout();
  assert.equal(state.clears, 0);
  assert.equal(state.receipts.length, 0);
  assert.match(state.statuses.at(-1), /evitar duplicados/i);
});

test('insufficient stock does not call RPC', async () => {
  const { checkout, state } = setup({ products: [{ id: 1, stock: 1 }, { id: 5, stock: 2 }] });
  await checkout();
  assert.equal(state.calls.length, 0);
  assert.match(state.statuses.at(-1), /Stock insuficiente/);
});

test('double click sends a single concurrent RPC', async () => {
  let finish;
  const { checkout, state } = setup({ supabase: {
    rpc: (name, params) => { state.calls.push({ name, params }); return new Promise(resolve => { finish = resolve; }); }
  } });
  const one = checkout(); const two = checkout();
  assert.equal(state.calls.length, 1);
  finish({ data: { id: 22, total: 4545, type: 'sale', change_amount: 455 }, error: null });
  await Promise.all([one, two]);
  assert.equal(state.clears, 1);
  assert.equal(state.calls.length, 1);
});

test('insufficient received money blocks RPC', async () => {
  const { checkout, state } = setup({ received: 4500 });
  await checkout();
  assert.equal(state.calls.length, 0);
  assert.match(state.statuses.at(-1), /insuficiente/);
});

test('layaway without customer is rejected before RPC', async () => {
  const { checkout, state } = setup({ cart: [{ id: 1, qty: 1, price: 2200 }],
    products: [{ id: 1, stock: 3 }], saleMode: 'layaway', totalFinal: 2200,
    discountPercent: 0, customerName: '', depositAmount: '200'
  });
  await checkout();
  assert.equal(state.calls.length, 0);
  assert.match(state.alerts[0], /nombre/);
});

test('100 percent discount blocks sale', async () => {
  const { checkout, state } = setup({ discountPercent: 100, totalFinal: 0 });
  await checkout();
  assert.equal(state.calls.length, 0);
  assert.match(state.alerts[0], /total final/i);
});

test('unexpectedly large change asks confirmation', async () => {
  const { checkout, state } = setup({ received: 30000,
    window: { confirm: () => false }
  });
  await checkout();
  assert.equal(state.calls.length, 0);
});

test('UI returns lock to idle after rejected RPC', async () => {
  const { checkout, state, d } = setup({ supabase: {
    rpc: async () => ({ data: null, error: { message: 'Test only' } })
  } });
  await checkout();
  assert.equal(d.checkoutRunningRef.current, false);
  assert.equal(state.clears, 0);
});

test('receipt fields expected by ticket are returned from SQL', () => {
  const sql = readFileSync(join(__dirname, '..', 'db', 'checkout_atomic.sql'), 'utf8');
  for (const key of ['sale_date', 'sale_items', 'discount_amount', 'items_count', 'change_amount', 'balance', 'due_date']) {
    assert.ok(sql.includes("'" + key + "'"), 'missing ticket field: ' + key);
  }
  assert.match(sql, /IF p_mode IS NULL OR p_mode NOT IN/);
  assert.match(sql, /SECURITY INVOKER/);
});
