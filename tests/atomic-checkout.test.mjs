import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAtomicCheckoutParams, submitAtomicCheckout,
  checkAtomicCheckoutStatus, cancelAtomicCheckout, newCheckoutOperationId,
  storePendingCheckoutId, readPendingCheckoutId, clearPendingCheckoutId,
} from "../src/lib/atomicCheckout.js";
const ID = "ad889d9e-b395-4a96-a178-e3cec00db661";
const item = { id: 12, qty: 2, price: 1300, cost: 200, name: "Silla" };
const sale = () => buildAtomicCheckoutParams({
  cart: [item], saleMode: "sale", discountPercent: 5, received: 2600,
  operationId: ID,
});
test("genera y persiste UUID seguro sin guardar datos del cliente", () => {
  assert.equal(newCheckoutOperationId({randomUUID:()=>ID}),ID);
  const values = new Map();
  const storage = {setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k),removeItem:k=>values.delete(k)};
  storePendingCheckoutId(ID, storage);
  assert.equal(readPendingCheckoutId(storage),ID);
  assert.equal(values.size,1);
  assert.ok(!JSON.stringify([...values]).includes("Silla"));
  clearPendingCheckoutId(storage);
  assert.equal(readPendingCheckoutId(storage),null);
});
test("exige UUID de operación para enviar cobro", () => {
  assert.throws(() => buildAtomicCheckoutParams({
    cart:[item],saleMode:"sale",discountPercent:0,received:2600,
  }),/identificador/i);
});
test("envía exclusivamente producto, precio esperado y UUID, nunca costo/utilidad", () => {
  const params = sale();
  assert.deepEqual(params.p_items,[{id:12,qty:2,expected_price:1300}]);
  assert.equal(params.p_operation_id, ID);
  assert.equal(params.p_received,2600);
  assert.ok(!JSON.stringify(params).includes('"cost"'));
  assert.ok(!JSON.stringify(params).includes('"profit"'));
});
test("aparta con datos mínimos y rechaza descuentos y duplicados", () => {
  const layaway=buildAtomicCheckoutParams({
    cart:[item],saleMode:"layaway",discountPercent:0,received:0,
    customerName:" Cliente ", depositAmount:300, dueDate:"2026-12-15",
    operationId:ID,
  });
  assert.equal(layaway.p_mode,"layaway");
  assert.equal(layaway.p_customer_name,"Cliente");
  assert.equal(layaway.p_deposit,300);
  assert.throws(()=>buildAtomicCheckoutParams({
    cart:[item],saleMode:"sale",discountPercent:100,received:2600,operationId:ID,
  }),/Descuento/);
  assert.throws(()=>buildAtomicCheckoutParams({
    cart:[item,item],saleMode:"sale",discountPercent:0,received:2600,operationId:ID,
  }),/duplicado/);
});
test("RPC usa exactamente una operación y expone el mismo UUID", async () => {
  let calls=0;
  const params=sale();
  const supabase={rpc:async (name,args)=>{
    calls++;assert.equal(name,"donatello_checkout_once");
    assert.deepEqual(args,params);
    return {data:{id:99,type:"sale",total:2470,sale_items:[]},error:null};
  }};
  const receipt=await submitAtomicCheckout(supabase,params);
  assert.equal(receipt.id,99);
  assert.equal(calls,1);
});
test("comprobar estado nunca registra una venta", async () => {
  const names=[];
  const supabase={rpc:async (name,args)=>{
    names.push(name);
    assert.deepEqual(args,{p_operation_id:ID});
    return {data:null,error:null};
  }};
  assert.equal(await checkAtomicCheckoutStatus(supabase,ID),null);
  assert.deepEqual(names,["donatello_checkout_status"]);
});
test("consulta de estado devuelve comprobante cuando el servidor confirmó", async () => {
  const supabase={rpc:async ()=>({data:{id:77,type:"layaway",total:500,sale_items:[]},error:null})};
  const r=await checkAtomicCheckoutStatus(supabase,ID);
  assert.equal(r.id,77);
});
test("no reintenta automáticamente una operación de resultado ambiguo", async () => {
  let calls=0;
  const supabase={rpc:async ()=>{calls++;return {error:{message:"timeout"},data:null}}};
  await assert.rejects(submitAtomicCheckout(supabase,sale()),/timeout/);
  assert.equal(calls,1);
});
test("la pantalla no utiliza inserts directos en el checkout inicial", () => {
  const src=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  const checkout=src.split("  async function checkout() {")[1]?.split("  async function startScanner() {")[0];
  assert.ok(checkout);
  assert.match(checkout,/submitAtomicCheckout\(supabase, params\)/);
  assert.doesNotMatch(checkout,/\.from\(["'](?:sales|sale_items|products|layaways)["']\)/);
  assert.match(src,/pendingCheckoutId/);
  assert.match(src,/checkAtomicCheckoutStatus/);
});
test("migración aplica guardas SQL y transacción serial por identificador", () => {
  const sql=readFileSync(new URL("../supabase/migrations/20261105_pos_checkout_idempotency.sql",import.meta.url),"utf8");
  assert.match(sql,/CREATE TABLE private\.pos_checkout_requests/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/role = 'admin'/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/sha256/);
  assert.match(sql,/REVOKE ALL ON TABLE private\.pos_checkout_requests/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.donatello_checkout_status/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.donatello_checkout_once/);
});


test("estado cancelado y cancelación terminal no ejecutan cobro nuevo", async () => {
  const called = [];
  const supabase={rpc:async (name,args)=>{
    called.push(name);
    assert.deepEqual(args,{p_operation_id:ID});
    return {data:{state:"cancelled"},error:null};
  }};
  assert.deepEqual(await checkAtomicCheckoutStatus(supabase,ID),{state:"cancelled"});
  assert.deepEqual(await cancelAtomicCheckout(supabase,ID),{state:"cancelled"});
  assert.deepEqual(called,["donatello_checkout_status","donatello_checkout_cancel"]);
});
test("cancelar después de un cobro devuelve el comprobante original", async () => {
  const supabase={rpc:async (name,args)=>{
    assert.equal(name,"donatello_checkout_cancel");
    assert.deepEqual(args,{p_operation_id:ID});
    return {data:{id:47,type:"sale",total:2600,sale_items:[]},error:null};
  }};
  const r=await cancelAtomicCheckout(supabase,ID);
  assert.equal(r.id,47);
});
test("resultado NULL NO desbloquea el POS ni borra UUID", () => {
  const src=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  const check=src.split("  async function verifyPendingCheckout() {")[1]?.split("  async function cancelPendingCheckout() {")[0];
  assert.ok(check);
  const emptyBranch=check.split("      } else {")[1]?.split("    } catch")[0];
  assert.ok(emptyBranch);
  assert.doesNotMatch(emptyBranch,/clearPendingCheckoutId/);
  assert.doesNotMatch(emptyBranch,/setPendingCheckoutId\(null\)/);
  assert.match(emptyBranch,/NO vuelvas a cobrar/);
  assert.match(src,/onClick=\{cancelPendingCheckout\}/);
});
test("SQL reserva de forma permanente UUID cancelados, sin borrar ventas", () => {
  const sql=readFileSync(new URL("../supabase/migrations/20261105_pos_checkout_idempotency.sql",import.meta.url),"utf8");
  assert.match(sql,/CREATE FUNCTION public\.donatello_checkout_cancel/);
  assert.match(sql,/IF v_old_state='cancelled' THEN/);
  assert.match(sql,/VALUES \(v_user,p_operation_id,'cancelled',NULL,NULL\)/);
  assert.match(sql,/IF v_state='completed' THEN/);
  assert.doesNotMatch(sql,/DELETE FROM private\.pos_checkout_requests/);
});
