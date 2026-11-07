import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  newLayawayPaymentId, readPendingLayawayPayment,storePendingLayawayPayment,
  clearPendingLayawayPayment,buildLayawayPaymentParams,
  submitLayawayPayment,checkLayawayPayment,cancelLayawayPayment,assertLayawayPaymentOwner
} from "../src/lib/atomicLayawayPayments.js";
const OP="1fbc9d2a-721f-48de-9ca8-3ed00cf93681";
const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const pending={operationId:OP,layawayId:200,userId:OWNER};
const receipt={id:200,payment_id:300,type:"payment",total:100,
  payment_amount:30,items:[{name:"Producto sintetico"}],balance:50};
test("UUID y storage sin PII",()=>{
  assert.equal(newLayawayPaymentId({randomUUID:()=>OP}),OP);
  const store=new Map();
  const storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  storePendingLayawayPayment(pending,storage);
  assert.deepEqual(readPendingLayawayPayment(storage),pending);
  const serial=JSON.stringify([...store.values()]);
  assert.ok(!serial.includes("Cliente") && !serial.includes("Monto"));
  assert.ok(!serial.includes("payment_amount"));
  clearPendingLayawayPayment(storage);
  assert.equal(readPendingLayawayPayment(storage),null);
});
test("valida UUID, monto y dos decimales",()=>{
  assert.deepEqual(buildLayawayPaymentParams({...pending,amount:30}),{
    p_operation_id:OP,p_layaway_id:200,p_amount:30
  });
  for(const amount of [-1,0,1.333,Infinity,NaN]){
    assert.throws(()=>buildLayawayPaymentParams({...pending,amount}),/invalido/);
  }
  assert.throws(()=>buildLayawayPaymentParams({...pending,operationId:"x",amount:30}),/invalido/);
});
test("solo RPC de abono registra movimiento",async()=>{
  let calls=0;
  const params=buildLayawayPaymentParams({...pending,amount:30});
  const api={rpc:async (name,args)=>{
    calls++;assert.equal(name,"donatello_layaway_payment_once");
    assert.deepEqual(args,params);return {data:receipt,error:null};
  }};
  assert.equal((await submitLayawayPayment(api,params)).payment_id,300);
  assert.equal(calls,1);
});
test("revisión y cancelación solo llaman RPC sin INSERT directo",async()=>{
  const called=[];
  const api={rpc:async (name,args)=>{
    called.push(name);assert.deepEqual(args,{p_operation_id:OP});
    return {data:{state:"cancelled"},error:null};
  }};
  assert.deepEqual(await checkLayawayPayment(api,pending,OWNER),{state:"cancelled"});
  assert.deepEqual(await cancelLayawayPayment(api,pending,OWNER),{state:"cancelled"});
  assert.deepEqual(called,["donatello_checkout_status","donatello_checkout_cancel"]);
});
test("NULL no equivale a cancelación confirmada",async()=>{
  const api={rpc:async ()=>({data:null,error:null})};
  assert.equal(await checkLayawayPayment(api,pending,OWNER),null);
  await assert.rejects(cancelLayawayPayment(api,pending,OWNER),/Recibo incompleto/);
});
test("fallo de red no reintenta ni emite éxito",async()=>{
  let calls=0;
  const api={rpc:async()=>{calls++;return {data:null,error:{message:"timeout"}}}};
  await assert.rejects(submitLayawayPayment(api,buildLayawayPaymentParams({...pending,amount:30})),/timeout/);
  assert.equal(calls,1);
});
test("el nuevo flujo de liquidación no hace escrituras independientes",()=>{
  const source=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  const section=source.split("  async function liquidateLayaway() {")[1]?.split("  const totalLayawayValue")[0];
  assert.ok(section);
  assert.match(section,/submitLayawayPayment/);
  assert.doesNotMatch(section,/\.from\(["'](?:sales|sale_items|layaways|layaway_payments)["']\)/);
  assert.match(source,/pendingLayawayPayment/);
  assert.match(source,/cancelPendingLayawayPayment/);
});


test("no permite recuperar ni cancelar pago con otra cuenta de administrador", async () => {
  let calls=0;
  const api={rpc:async()=>{calls++;return {data:null,error:null}}};
  assert.throws(()=>assertLayawayPaymentOwner(pending,OTHER),/otra cuenta/);
  await assert.rejects(checkLayawayPayment(api,pending,OTHER),/otra cuenta/);
  await assert.rejects(cancelLayawayPayment(api,pending,OTHER),/otra cuenta/);
  assert.equal(calls,0);
});
test("entrada previa sin usuario queda bloqueada (fail closed)",() => {
  const store={getItem:()=>JSON.stringify({operationId:OP,layawayId:200})};
  const old=readPendingLayawayPayment(store);
  assert.equal(old.userId,null);
  assert.throws(()=>assertLayawayPaymentOwner(old,OWNER),/otra cuenta/);
});
test("pantalla vincula la comprobación del recibo a la sesión original",()=>{
  const src=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  assert.match(src,/userId=\{session\?\.user\?\.id\}/);
  assert.match(src,/checkLayawayPayment\(supabase, pendingLayawayPayment, userId\)/);
  assert.match(src,/cancelLayawayPayment\(supabase, pendingLayawayPayment, userId\)/);
  assert.match(src,/operationId:params\.p_operation_id,layawayId:params\.p_layaway_id,userId/);
});


test("abono pendiente se mantiene tras reiniciar pestaña o cerrar sesión",()=>{
  const durable=new Map();
  const local={setItem:(k,v)=>durable.set(k,v),getItem:k=>durable.get(k)||null,
    removeItem:k=>durable.delete(k)};
  const tab={getItem:()=>null,removeItem:()=>{},clear:()=>{}};
  storePendingLayawayPayment(pending,local,tab);
  tab.clear();
  assert.deepEqual(readPendingLayawayPayment(local,tab),pending);
  assert.throws(()=>storePendingLayawayPayment({...pending,
    operationId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},local,tab),/pendiente/);
  clearPendingLayawayPayment(local,tab);
  assert.equal(readPendingLayawayPayment(local,tab),null);
});
test("abono pendiente antiguo se migra a almacenamiento persistente",()=>{
  const record=new Map([["donatello.pos.pendingLayawayPayment.v1",JSON.stringify(pending)]]);
  const localMap=new Map();
  const local={setItem:(k,v)=>localMap.set(k,v),getItem:k=>localMap.get(k)||null,
    removeItem:k=>localMap.delete(k)};
  const legacy={getItem:k=>record.get(k)||null,removeItem:k=>record.delete(k)};
  assert.deepEqual(readPendingLayawayPayment(local,legacy),pending);
  assert.equal(record.size,0);
  assert.deepEqual(readPendingLayawayPayment(local,legacy),pending);
});
test("abono bloquea caja si almacenamiento no permite lectura fiable",()=>{
  const bad={getItem:()=>"{invalido"};
  const denied={getItem:()=>{throw Error("Storage disabled")},setItem:()=>{}};
  assert.equal(readPendingLayawayPayment(bad,null).storageUnavailable,true);
  assert.equal(readPendingLayawayPayment(denied,null).storageUnavailable,true);
  assert.throws(()=>storePendingLayawayPayment(pending,denied,null),/pendiente/);
});


test("abono conserva UUID durable aunque ya no exista acceso a la sesión anterior",()=>{
  const localMap=new Map();
  const storage={setItem:(k,v)=>localMap.set(k,v),getItem:k=>localMap.get(k)||null,
    removeItem:k=>localMap.delete(k)};
  const brokenSession={getItem:()=>{throw Error("session inaccessible")}};
  storePendingLayawayPayment(pending,storage,null);
  assert.deepEqual(readPendingLayawayPayment(storage,brokenSession),pending);
});
