'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');

const URL_BASE = 'http://127.0.0.1:5179';
const MOCK_BACKEND = 'https://unit-tests.supabase.test';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@example.invalid',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z'
};
const expiresAt = Math.floor(Date.now() / 1000) + 86400;
const token = [
  Buffer.from('{}').toString('base64url'),
  Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt })).toString('base64url'),
  'e2e-fake-no-real-authorization'
].join('.');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOdbe04AAAAASUVORK5CYII=', 'base64');

async function startServer() {
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: MOCK_BACKEND,
      VITE_SUPABASE_ANON_KEY: 'mock-test-publishable-key-no-live-credentials'
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', d => { output += d.toString(); });
  child.stderr.on('data', d => { output += d.toString(); });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Vite exited: ' + output.slice(-2000));
    try {
      const r = await fetch(URL_BASE, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return child;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Vite did not start: ' + output.slice(-2000));
}

async function makePage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const uploads = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const session = {access_token: token, token_type:'bearer',expires_at:expiresAt,
    expires_in:86400,refresh_token:'fixture-refresh-not-real',user};
  await page.addInitScript(({session}) => {
    localStorage.setItem('sb-unit-tests-auth-token', JSON.stringify(session));
  }, {session});
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 'unit-tests.supabase.test') return route.abort('blockedbyclient');
    const path = url.pathname, method = route.request().method();
    const cors = {
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'GET,POST,OPTIONS,PATCH,DELETE',
      'access-control-allow-headers':'apikey,authorization,content-type,x-client-info,prefer'
    };
    if (method === 'OPTIONS') return route.fulfill({status:204,headers:cors,body:''});
    const send = (data,status=200) => route.fulfill({
      status, headers:cors,contentType:'application/json',body:JSON.stringify(data)
    });
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/user')) return send(user);
      if (path.endsWith('/token')) return send(session);
    }
    if (method === 'GET' && path === '/rest/v1/products') return send([]);
    if (method === 'GET' && path === '/rest/v1/sales') return send([]);
    if (method === 'GET' && path === '/rest/v1/layaways') return send([]);
    if (method === 'POST' && path.startsWith('/storage/v1/object/product-images/products/')) {
      uploads.push(path);
      return send({ Key: path.split('/storage/v1/object/')[1] });
    }
    return send({message:'No mock configured for '+method+' '+path}, 404);
  });
  return {page, uploads, errors};
}

test('Real Chromium image upload buttons open the correct file picker and upload to mock Storage',
  {timeout:90000}, async t => {
    const server = await startServer();
    let browser;
    try {
      browser = await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
      for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
        await t.test('Image pickers work at '+viewport.width+'px', async () => {
          const {page,uploads,errors} = await makePage(browser,viewport);
          try {
            const response = await page.goto(URL_BASE + '/agregar',{waitUntil:'domcontentloaded',timeout:25000});
            assert.equal(response.status(),200);
            await page.locator('.add-image-field').first().waitFor({timeout:20000});
            if (viewport.width < 600) {
              await page.locator('.add-product-images-card .add-mobile-section-toggle').click();
            }
            const fields=['image_url','image_url_2','image_url_3','image_url_4'];
            assert.equal(await page.locator('.add-image-field').count(),4);
            for (const field of fields) {
              const row = page.locator('.add-image-field').filter({has: page.locator('#donatello-'+field+'-file')});
              assert.equal(await row.locator('input[type="file"]').count(),1);
              const chooserPromise = page.waitForEvent('filechooser',{timeout:7000});
              await row.getByRole('button',{name:'Subir archivo'}).click();
              const chooser = await chooserPromise;
              const actualID = await chooser.element().getAttribute('id');
              assert.equal(actualID,'donatello-'+field+'-file');
              // Upload a tiny simulated PNG; do NOT use a real Supabase connection.
              await chooser.setFiles({
                name:field+'.png', mimeType:'image/png',buffer:image
              });
              await page.waitForFunction(
                f => document.getElementById('donatello-'+f+'-url')?.value.includes('/storage/v1/object/public/product-images/products/'),
                field,{timeout:10000}
              );
            }
            assert.equal(uploads.length,4,'One Storage request per selected image');
            assert.equal(errors.length,0,'No browser JS exceptions: '+errors.join('; '));
            console.log('DONATELLO_IMAGE_PICKERS_PASS '+JSON.stringify({
              viewport:viewport.width,fields:4,uploads:uploads.length,
              storage:'fake',savedProducts:0
            }));
          } finally { await page.close(); }
        });
      }
    } finally {
      if (browser) await browser.close();
      try { process.kill(-server.pid,'SIGKILL'); } catch { server.kill('SIGKILL'); }
    }
  }
);
