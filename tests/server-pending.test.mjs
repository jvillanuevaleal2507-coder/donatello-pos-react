import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reservePosOperation,recoverPosOperation,acknowledgePosOperation}
  from "../src/lib/serverPendingOperations.js";
const ID="11111111-1111-4111-8111-111111111111";
const pending=(kind="checkout")=>({operation_id:ID,kind,
  layaway_id:kind==="checkout"?null:200,state:"reserved",receipt:null});
test("reservar checkout obliga a usar la función del servidor",async()=>{
  const calls=[];
  const api={rpc:async (name,args)=>{calls.push({name,args});
    return {data:{operation_id:ID,kind:"checkout",state:"reserved"},error:null}}};
  const result=await reservePosOperation(api,ID,"checkout");
  assert.equal(result.state,"reserved");
  assert.deepEqual(calls,[{name:"donatello_payment_reserve",
    args:{p_operation_id:ID,p_kind:"checkout",p_layaway_id:null}}]);
});
test("reservar abono incluye folio que el servidor debe recuperar",async()=>{
  const api={rpc:async(name,args)=>{
    assert.equal(name,"donatello_payment_reserve");
    assert.equal(args.p_layaway_id,200);
    return {data:{operation_id:ID,kind:"layaway_payment",state:"reserved"},error:null};
  }};
  const result=await reservePosOperation(api,ID,"layaway_payment",200);
  assert.equal(result.layawayId,200);
});
test("tras borrar datos del teléfono, servidor devuelve reserva propia",async()=>{
  let calls=0;
  const api={rpc:async(name)=>{
    calls++; assert.equal(name,"donatello_payment_recover");
    return {data:pending(),error:null};
  }};
  assert.deepEqual(await recoverPosOperation(api),
    {operationId:ID,kind:"checkout",layawayId:null,state:"reserved",receipt:null});
  assert.equal(calls,1);
});
test("servidor devuelve recibo confirmado, sin repetir pago",async()=>{
  const receipt={id:55,type:"sale",total:100,sale_items:[]};
  const api={rpc:async(name)=>({data:{...pending(),state:"completed",receipt},error:null})};
  assert.deepEqual((await recoverPosOperation(api)).receipt,receipt);
});
test("rechaza respuestas incompletas para impedir desbloqueos inseguros",async()=>{
  const api={rpc:async()=>({data:{state:"completed",kind:"checkout"},error:null})};
  await assert.rejects(recoverPosOperation(api),/no verificable/);
});
test("la reserva se libera solo mediante confirmación explícita",async()=>{
  const called=[];
  const api={rpc:async(name,args)=>{called.push(name);
    assert.deepEqual(args,{p_operation_id:ID});
    return {data:{state:"acknowledged"},error:null};
  }};
  assert.equal(await acknowledgePosOperation(api,ID),true);
  assert.deepEqual(called,["donatello_payment_ack"]);
});
test("corte de red antes de reserva nunca implica permiso para cobrar",async()=>{
  const api={rpc:async()=>({data:null,error:{message:"network timeout"}})};
  await assert.rejects(reservePosOperation(api,ID,"checkout"),/network timeout/);
  await assert.rejects(recoverPosOperation(api),/network timeout/);
});
test("la interfaz reserva antes de enviar y concilia al iniciar sesión",()=>{
  const source=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  assert.match(source,/reservePosOperation\(supabase/);
  assert.match(source,/recoverPosOperation\(supabase\)/);
  assert.match(source,/acknowledgePosOperation\(supabase/);
});


test("abono y checkout deben reservar antes de hacer la llamada financiera",()=>{
 const src=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
 const checkout=src.split("  async function checkout() {")[1]?.split("  async function startScanner() {")[0];
 const layaway=src.split("  async function liquidateLayaway() {")[1]?.split("  const totalLayawayValue")[0];
 assert.ok(checkout && layaway);
 assert.ok(checkout.indexOf("await reservePosOperation(")<checkout.indexOf("await submitAtomicCheckout("));
 assert.ok(layaway.indexOf("await reservePosOperation(")<layaway.indexOf("await submitLayawayPayment("));
 assert.match(src,/onClose=\{closeConfirmedCheckoutReceipt\}/);
 assert.match(src,/onClose=\{closeConfirmedLayawayReceipt\}/);
 assert.match(src,/setServerPending\(undefined\)/);
 assert.match(src,/serverPending!==null/);
});
