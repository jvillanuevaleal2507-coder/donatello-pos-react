'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

(async () => {
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const resp=await page.goto('https://pos.ventasdonatello.com/',{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(resp.status(),200);
  await page.getByPlaceholder('Correo',{exact:true}).waitFor({timeout:45000});
  await page.getByPlaceholder('Contraseña',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Ingresar'}).waitFor();
  assert.match(await page.locator('body').innerText(),/Ventas Donatello/);
  assert.equal(errors.length,0,errors.join('; '));
  const desktop={status:resp.status(),title:await page.title(),login:true};
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.getByRole('button',{name:'Ingresar'}).isVisible(),'Mobile login visible');
  console.log('DONATELLO_POS_PRODUCTION_SMOKE_PASS '+JSON.stringify({...desktop,mobile:true,nonMutating:true}));
  await page.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('DONATELLO_POS_PRODUCTION_SMOKE_FAIL',e.stack||String(e));process.exitCode=1;});
