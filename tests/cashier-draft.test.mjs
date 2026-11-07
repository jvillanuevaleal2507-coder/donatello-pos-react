import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {saveCashierDraft, readCashierDraft, forgetCashierDraft} from "../src/lib/cashierDraft.js";

const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW=1770000000000;
const products=[{id:18,name:"Mesa",price:300,cost:120,stock:10}];
function storage(){
  const map=new Map();
  return {
    map,
    getItem:key=>map.get(key)||null,
    setItem:(key,value)=>map.set(key,value),
    removeItem:key=>map.delete(key)
  };
}

test("draft de venta se restaura tras recargar Android con precio fresco",()=>{
  const store=storage();
  const original={userId:OWNER,cart:[{id:18,qty:1,name:"Mesa",cost:9999,price:1}],
    received:"300",discountPercent:0,saleMode:"sale",depositAmount:""};
  assert.equal(saveCashierDraft(original,store,NOW),true);
  assert.equal(store.map.size,1);
  const raw=[...store.map.values()][0];
  assert.ok(!raw.includes("9999"));
  assert.ok(!raw.includes('"name"'));
  assert.ok(!raw.includes('"cost"'));
  const restored=readCashierDraft(OWNER,products,store,NOW+1000);
  assert.equal(restored.cart[0].price,300);
  assert.equal(restored.cart[0].qty,1);
  assert.equal(restored.received,"300");
});

test("no se filtra borrador a otro usuario",()=>{
  const store=storage();
  saveCashierDraft({userId:OWNER,cart:[{id:18,qty:1}],received:"300"},store,NOW);
  assert.equal(readCashierDraft(OTHER,products,store,NOW+500),null);
  assert.equal(store.map.size,0);
});

test("expira 30 minutos; se descarta si inventario o JSON cambian",()=>{
  const store=storage();
  saveCashierDraft({userId:OWNER,cart:[{id:18,qty:1}],received:"300"},store,NOW);
  assert.equal(readCashierDraft(OWNER,products,store,NOW+30*60*1000+1),null);
  saveCashierDraft({userId:OWNER,cart:[{id:18,qty:1}],received:"300"},store,NOW);
  assert.equal(readCashierDraft(OWNER,[{id:19,stock:10}],store,NOW),null);
  store.setItem("donatello.pos.cashierDraft.v1","{invalid");
  assert.equal(readCashierDraft(OWNER,products,store,NOW),null);
});

test("no almacena datos de clientes ni identificadores de cobro",()=>{
  const store=storage();
  saveCashierDraft({userId:OWNER,cart:[{id:18,qty:1}],saleMode:"layaway",
    received:"0",depositAmount:"100",customerName:"NOMBRE SENSIBLE",
    customerPhone:"8991122334",operationId:"cobro-secreto"},store,NOW);
  const raw=[...store.map.values()][0];
  assert.ok(!raw.includes("NOMBRE SENSIBLE"));
  assert.ok(!raw.includes("8991122334"));
  assert.ok(!raw.includes("cobro-secreto"));
  assert.equal(readCashierDraft(OWNER,products,store,NOW).saleMode,"layaway");
  assert.equal(readCashierDraft(OWNER,products,store,NOW).depositAmount,"100");
});

test("draft corrupto o sin piezas no crea operaciones",()=>{
  const store=storage();
  assert.equal(saveCashierDraft({userId:OWNER,cart:[],received:"300"},store,NOW),false);
  assert.equal(saveCashierDraft({userId:OWNER,cart:[{id:18,qty:-1}],received:"300"},store,NOW),false);
  assert.equal(store.map.size,0);
  assert.equal(readCashierDraft(OWNER,products,store,NOW),null);
  assert.equal(forgetCashierDraft(store),true);
});

test("regla UI: solo rehidrata después de conciliación y no despacha RPC",()=>{
  const code=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  assert.match(code,/readCashierDraft\(userId, products\)/);
  assert.match(code,/serverPending !== null \|\| pendingCheckoutId/);
  assert.match(code,/saveCashierDraft\(/);
  assert.match(code,/forgetCashierDraft\(/);
  const lib=readFileSync(new URL("../src/lib/cashierDraft.js",import.meta.url),"utf8");
  assert.doesNotMatch(lib,/\.rpc\(/);
  assert.doesNotMatch(lib,/localStorage/);
});
