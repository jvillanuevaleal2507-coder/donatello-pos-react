'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');

const URL_BASE = 'http://127.0.0.1:5179';
const MOCK_BACKEND = 'https://unit-tests.supabase.test';
const testUser = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z'
};
const expiresAt = Math.floor(Date.now() / 1000) + 86400;
const token = [
  Buffer.from('{}').toString('base64url'),
  Buffer.from(JSON.stringify({ sub: testUser.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt })).toString('base64url'),
  'testing-only-no-real-signature'
].join('.');

async function serverStart() {
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: MOCK_BACKEND,
      VITE_SUPABASE_ANON_KEY: 'e2e-public-test-only' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { output += data.toString(); });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Vite exited: ' + output.slice(-3000));
    try {
      const r = await fetch(URL_BASE, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return child;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Vite did not start: ' + output.slice(-3000));
}

async function pageWithMock(browser) {
  const page = await browser.newPage();
  const rpcCalls = [];
  const session = { access_token: token, token_type: 'bearer', expires_at: expiresAt,
    expires_in: 86400, refresh_token: 'fixture-not-valid', user: testUser };
  await page.addInitScript(({ session }) => {
    window.localStorage.setItem('sb-unit-tests-auth-token', JSON.stringify(session));
  }, { session });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 'unit-tests.supabase.test') return route.abort('blockedbyclient');
    const method = route.request().method();
    const path = url.pathname;
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS,PATCH,DELETE',
      'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info,prefer'
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const send = (json, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(json) });
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/user')) return send(testUser);
      if (path.endsWith('/token')) return send(session);
    }
    const products = [{
      id: 101, name: 'Mesa E2E', code: 'PRUEBA-101', category: 'Prueba',
      stock: 3, price: 500, cost: 200,
      image_url: null, image_url_2: null, image_url_3: null, image_url_4: null
    }];
    if (method === 'GET' && path === '/rest/v1/products') return send(products);
    if (method === 'GET' && path === '/rest/v1/sales') return send([]);
    if (method === 'GET' && path === '/rest/v1/layaways') return send([]);
    if (method === 'POST' && path === '/rest/v1/rpc/donatello_checkout') {
      const params = route.request().postDataJSON();
      rpcCalls.push(params);
      const items = [{
        code: 'PRUEBA-101', product_id: 101, name: 'Mesa E2E', qty: 1,
        price: 500, cost: 200, subtotal: 500, profit: 300
      }];
      const discount = 500 * Number(params.p_discount_percent || 0) / 100;
      const total = 500 - discount;
      return send({
        id: 9999, type: params.p_mode, sale_date: '2026-10-08T12:00:00Z',
        items_count: 1, sale_items: items, total, received: params.p_received,
        subtotal_original: 500, discount_percent: params.p_discount_percent,
        discount_amount: discount, profit: 300-discount,
        change_amount: params.p_mode === 'sale' ? params.p_received-total : 0,
        customer_name: params.p_customer_name, customer_phone: params.p_customer_phone,
        deposit: params.p_deposit,
        balance: params.p_mode === 'layaway' ? total-params.p_deposit : null,
        due_date: params.p_due_date
      });
    }
    return send({ message: 'No mock for ' + method + ' ' + path }, 404);
  });
  return { page, rpcCalls };
}

async function addProduct(page) {
  await page.getByPlaceholder('Escribe nombre, código o categoría...').waitFor({ timeout: 20000 });
  await page.getByPlaceholder('Escribe nombre, código o categoría...').fill('Mesa E2E');
  await page.locator('.quick-result-btn', { hasText: 'Mesa E2E' }).click();
  await page.locator('.sale-cart-item', { hasText: 'Mesa E2E' }).waitFor();
}

test('Real-browser POS checkout with mocked Supabase: sale, layaway and ticket', { timeout: 90000 }, async t => {
  const server = await serverStart();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });

    await t.test('Sale with 10% discount and receipt', async () => {
      const { page, rpcCalls } = await pageWithMock(browser);
      try {
        await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
        await addProduct(page);
        await page.getByRole('button', { name: '10%', exact: true }).click();
        await page.getByPlaceholder('0.00').fill('500');
        await page.getByRole('button', { name: 'Cobrar venta' }).click();
        await page.locator('.ticket-print-area').waitFor({ timeout: 20000 });
        const receipt = await page.locator('.ticket-print-area').innerText();
        assert.match(receipt, /Comprobante de Venta/);
        assert.match(receipt, /Mesa E2E/);
        assert.match(receipt, /450\.00/);
        assert.equal(rpcCalls.length, 1);
        assert.equal(rpcCalls[0].p_discount_percent, 10);
        assert.equal(rpcCalls[0].p_received, 500);
      } finally { await page.close(); }
    });

    await t.test('Layaway with deposit and receipt', async () => {
      const { page, rpcCalls } = await pageWithMock(browser);
      try {
        await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
        await addProduct(page);
        await page.getByRole('button', { name: 'Apartado', exact: true }).click();
        await page.getByPlaceholder('Nombre del cliente').fill('Cliente ficticio E2E');
        await page.getByPlaceholder('Anticipo').fill('100');
        await page.getByRole('button', { name: 'Registrar apartado' }).click();
        await page.locator('.ticket-print-area').waitFor({ timeout: 20000 });
        const receipt = await page.locator('.ticket-print-area').innerText();
        assert.match(receipt, /Comprobante de Apartado/);
        assert.match(receipt, /Cliente ficticio E2E/);
        assert.match(receipt, /400\.00/);
        assert.equal(rpcCalls.length, 1);
        assert.equal(rpcCalls[0].p_mode, 'layaway');
        assert.equal(rpcCalls[0].p_deposit, 100);
      } finally { await page.close(); }
    });
  } finally {
    if (browser) await browser.close();
    try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  }
});
