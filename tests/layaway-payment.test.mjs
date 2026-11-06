import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  newLayawayPaymentId,keepPendingLayawayPaymentId,getPendingLayawayPaymentId,
  clearPendingLayawayPaymentId,buildLayawayPaymentParams,submitLayawayPayment,
  checkLayawayPayment,cancelLayawayPayment,
} from "../src/lib/layawayPayment.js";
const ID="a9119999-aaaa-4aaa-8aaa-000000001111";
const receipt={
  id:7,payment_id:101,type:"payment",total:1300,
  previous_deposit:650,total_deposit:850,
  previous_balance:650,payment_amount:200,balance:450,
  items:[{product_id:12,name:"Silla",qty:1}],sale_id:null,
  customer_name:"Prueba",payment_date:"2026-11-05T19:00:00Z"
};
test("UUID seguro, persistencia mínima y borrado",()=>{
  assert.equal(newLayawayPaymentId({randomUUID:()=>ID}),ID);
  const map=new Map();
  const store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  keepPendingLayawayPaymentId(ID,store);
  assert.equal(getPendingLayawayPaymentId(store),ID);
  assert.equal(map.size,1);
  assert.ok(!JSON.stringify([...map]).includes("Prueba"));
  clearPendingLayawayPaymentId(store);
  assert.equal(getPendingLayawayPaymentId(store),null);
});
test("parámetros mínimos sin costos, PII ni totales del cliente",()=>{
  const p=buildLayawayPaymentParams({operationId:ID,layawayId:7,amount:200,expectedBalance:650});
  assert.deepEqual(p,{
    p_operation_id:ID,p_layaway_id:7,p_amount:200,p_expected_balance:650
  });
  assert.ok(!JSON.stringify(p).includes("customer_name"));
  assert.ok(!JSON.stringify(p).includes("cost"));
});
test("acepta centavos, rechaza cantidades inválidas",()=>{
  assert.equal(buildLayawayPaymentParams({operationId:ID,layawayId:7,amount:0.29,expectedBalance:650}).p_amount,0.29);
  for(const amount of [0,-1,200.009,Infinity,NaN,651]){
    assert.throws(()=>buildLayawayPaymentParams({operationId:ID,layawayId:7,amount,expectedBalance:650}));
  }
  assert.throws(()=>buildLayawayPaymentParams({operationId:"invalid",layawayId:7,amount:10,expectedBalance:650}));
});
test("pago utiliza una sola RPC, y devuelve comprobante",async()=>{
  let calls=0;
  const p=buildLayawayPaymentParams({operationId:ID,layawayId:7,amount:200,expectedBalance:650});
  const client={rpc:async(name,args)=>{calls++;assert.equal(name,"donatello_layaway_payment_once");assert.deepEqual(args,p);return {data:receipt,error:null}}};
  assert.equal((await submitLayawayPayment(client,p)).payment_id,101);
  assert.equal(calls,1);
});
test("timeout nunca reintenta la RPC",async()=>{
  let n=0;
  const client={rpc:async()=>{n++;return {error:{message:"timeout"},data:null}}};
  const p=buildLayawayPaymentParams({operationId:ID,layawayId:7,amount:200,expectedBalance:650});
  await assert.rejects(submitLayawayPayment(client,p),/timeout/);
  assert.equal(n,1);
});
test("estado vacío, estado cancelado y comprobante",async()=>{
  const modes=[null,{state:"cancelled"},receipt];
  const names=[];
  const client={rpc:async(name,args)=>{names.push(name);assert.deepEqual(args,{p_operation_id:ID});return {data:modes.shift(),error:null}}};
  assert.equal(await checkLayawayPayment(client,ID),null);
  assert.deepEqual(await checkLayawayPayment(client,ID),{state:"cancelled"});
  assert.equal((await checkLayawayPayment(client,ID)).payment_id,101);
  assert.deepEqual(names,Array(3).fill("donatello_layaway_payment_status"));
});
test("cancelar una solicitud nunca lanza otra operación de pago",async()=>{
  const names=[];
  const client={rpc:async(name,args)=>{
    names.push(name);assert.deepEqual(args,{p_operation_id:ID});
    return {data:receipt,error:null};
  }};
  assert.equal((await cancelLayawayPayment(client,ID)).payment_id,101);
  assert.deepEqual(names,["donatello_layaway_payment_cancel"]);
});
test("el checkout de apartado no realiza escrituras directas",()=>{
  const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  const layaway=app.split("function LayawaysSection(")[1]?.split("function ImportCSV(")[0];
  const checkout=layaway?.split("  async function liquidateLayaway() {")[1]?.split("  const totalLayawayValue")[0];
  assert.ok(checkout);
  assert.match(checkout,/submitLayawayPayment\(supabase,args\)/);
  assert.doesNotMatch(checkout,/\.from\(["'](?:sales|sale_items|layaways|layaway_payments)["']\)/);
  assert.doesNotMatch(layaway,/savePaymentHistory/);
  assert.match(layaway,/cancelPendingLayawayPayment/);
  assert.match(layaway,/Comprobar abono pendiente/);
});
test("consulta sin confirmación no borra el UUID pendiente",()=>{
  const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  const verify=app.split("  async function verifyPendingLayawayPayment() {")[1]?.split("  async function cancelPendingLayawayPayment() {")[0];
  assert.ok(verify);
  const missing=verify.split("      }else{")[1]?.split("    }catch")[0];
  assert.ok(missing);
  assert.doesNotMatch(missing,/clearPendingLayawayPaymentId/);
  assert.doesNotMatch(missing,/setPendingPaymentId\(null\)/);
});
test("migración restringe roles y mantiene lápidas sin duplicar PII",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261105_atomic_layaway_payments.sql",import.meta.url),"utf8");
  assert.match(sql,/CREATE TABLE private\.pos_layaway_payment_requests/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/role='admin'/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/REFERENCES public\.layaway_payments\(id\)/);
  assert.match(sql,/CREATE FUNCTION public\.donatello_layaway_payment_cancel/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.donatello_layaway_payment_once/);
  assert.doesNotMatch(sql,/UPDATE public\.products/);
});
