import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAtomicCheckoutParams, submitAtomicCheckout } from "../src/lib/atomicCheckout.js";
const product = {id:12,qty:2,price:1300,cost:200,stock:4,name:"Silla"};
const sale = () => buildAtomicCheckoutParams({cart:[product],saleMode:"sale",discountPercent:5,received:2600});
test("no envía costo/utilidad del navegador", () => {
  const x=sale();
  assert.deepEqual(x.p_items,[{id:12,qty:2,expected_price:1300}]);
  assert.equal(x.p_discount_percent,5);
  assert.equal(x.p_received,2600);
  assert.ok(!JSON.stringify(x).includes('"cost"'));
});
test("apartado con anticipo y cliente",()=>{
  const x=buildAtomicCheckoutParams({cart:[product],saleMode:"layaway",discountPercent:0,customerName:" Cliente ",customerPhone:"8990000000",depositAmount:300,dueDate:"2026-12-15"});
  assert.equal(x.p_mode,"layaway");
  assert.equal(x.p_customer_name,"Cliente");
  assert.equal(x.p_deposit,300);
  assert.equal(x.p_received,0);
});
test("rechaza descuentos, precios y duplicados",()=>{
  assert.throws(()=>buildAtomicCheckoutParams({cart:[product],saleMode:"sale",discountPercent:100,received:2600}),/Descuento/);
  assert.throws(()=>buildAtomicCheckoutParams({cart:[product,product],saleMode:"sale",discountPercent:0,received:2600}),/duplicado/);
  assert.throws(()=>buildAtomicCheckoutParams({cart:[{...product,price:-1}],saleMode:"sale",discountPercent:0,received:2600}),/Producto/);
});
test("una única llamada RPC produce el comprobante",async()=>{
  let count=0;
  const x=sale();
  const fake={rpc:async (name,params)=>{
    count++;assert.equal(name,"donatello_checkout");assert.deepEqual(params,x);
    return {data:{id:77,type:"sale",total:2470,change_amount:130,sale_items:[]},error:null};
  }};
  const result=await submitAtomicCheckout(fake,x);
  assert.equal(result.id,77);assert.equal(count,1);
});
test("no hay retry ante error del servidor",async()=>{
  let calls=0;
  const fake={rpc:async()=>{calls++;return {error:{message:"timeout"},data:null}}};
  await assert.rejects(submitAtomicCheckout(fake,sale()),/timeout/);
  assert.equal(calls,1);
});
test("checkout sin INSERTs independientes",()=>{
  const src=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  const portion=src.split("  async function checkout() {")[1]?.split("  async function startScanner() {")[0];
  assert.ok(portion);assert.match(portion,/submitAtomicCheckout\(supabase, params\)/);
  assert.doesNotMatch(portion,/\.from\(["'](?:sales|sale_items|products|layaways)["']\)/);
  assert.match(src,/processingCheckout \|\|/);
});
