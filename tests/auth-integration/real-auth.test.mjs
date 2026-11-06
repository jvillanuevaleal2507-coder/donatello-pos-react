// ATLAS: real local GoTrue + PostgREST authentication; no production credentials.
// Synthetic accounts and inventory only, ephemeral GitHub Actions container.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createClient} from "@supabase/supabase-js";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"../.."),cwd=resolve(here,"runner");
const info=execFileSync("supabase",["status","-o","env"],{cwd,encoding:"utf8"});
function variable(name) {
 const line=info.split(/\r?\n/).find(x=>x.startsWith(name+"="));
 if(!line) throw Error("Missing local CLI status key "+name);
 return line.slice(name.length+1).trim().replace(/^['"]|['"]$/g,"");
}
const url=variable("API_URL");
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))
 throw Error("Non-local API URL prohibited in synthetic Auth tests");
const anon=variable("ANON_KEY"),service=variable("SERVICE_ROLE_KEY");
function execSql(sql) {
 execFileSync("psql",["-X","-v","ON_ERROR_STOP=1","-h","127.0.0.1",
   "-p","54322","-U","postgres","-d","postgres"],{
   encoding:"utf8",input:sql,env:{...process.env,PGPASSWORD:"postgres"}
 });
}
const sqlFile=(path)=>readFileSync(resolve(root,path),"utf8");
const fixture=sqlFile("tests/sql/checkout_fixture.sql");
const begin=fixture.indexOf("CREATE TABLE public.pos_authorized_users (");
assert.ok(begin>0);
const initial="INSERT INTO public.pos_authorized_users(user_id,role,active)\n"+
 "VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);";
assert.ok(fixture.includes(initial));
const baseline=fixture.slice(begin).replace(initial,"");
// Preserve local Supabase's real auth.uid(), roles and Auth-managed schema.
execSql("CREATE SCHEMA IF NOT EXISTS private;\n"+baseline);
execSql(sqlFile("supabase/migrations/20261105_pos_checkout_idempotency.sql"));
execSql(sqlFile("tests/sql/layaway_fixture.sql"));
execSql(sqlFile("supabase/migrations/20261106_pos_layaway_payments.sql"));
execSql(sqlFile("supabase/migrations/20261106_pos_pending_recovery.sql"));
execSql(sqlFile("supabase/migrations/20261106_pos_operator_read_guards.sql"));
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const definitions=[
 {name:"owner",role:"admin",active:true},
 {name:"second",role:"admin",active:true},
 {name:"operator",role:"operator",active:true},
 {name:"suspended",role:"admin",active:false},
 {name:"unknown",role:null,active:false},
];
const users={};
for(const spec of definitions){
 const email="atlas-"+spec.name+"@auth-ci.invalid";
 const password="AtlasCI-"+spec.name+"-!9345";
 const {data:created,error:e}=await admin.auth.admin.createUser({
   email,password,email_confirm:true
 });
 assert.ifError(e);
 assert.ok(created?.user?.id);
 users[spec.name]={...spec,id:created.user.id,email,password};
}
const {error:registryError}=await admin.from("pos_authorized_users").insert(
 Object.values(users).filter(u=>u.role).map(u=>({
   user_id:u.id,role:u.role,active:u.active
 }))
);
assert.ifError(registryError);
for(const u of Object.values(users)){
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.signInWithPassword({
   email:u.email,password:u.password
 });
 assert.ifError(error);
 assert.equal(data.user.id,u.id);
 assert.ok(data.session.access_token);
 const {data:verified,error:verifyError}=await client.auth.getUser();
 assert.ifError(verifyError);
 assert.equal(verified.user.id,u.id);
 u.client=client;
 u.token=data.session.access_token;
}
const A="f1234567-1234-4234-8234-123456789001";
const B="f1234567-1234-4234-8234-123456789002";
async function denied(client,name,args){
 const {error}=await client.rpc(name,args);
 assert.ok(error,"Expected denied RPC: "+name);
}

test("admin no puede usar checkout antiguo ni INSERT financiero directo",async()=>{
 const c=users.second.client;
 await denied(c,"donatello_checkout",{
   p_mode:"sale",p_items:[{id:12,qty:1,expected_price:10}],
   p_discount_percent:0,p_received:10,p_customer_name:null,
   p_customer_phone:null,p_deposit:0,p_due_date:null
 });
 for(const [table,body] of [
   ["sales",{total:88,received:88,profit:88}],
   ["layaways",{customer_name:"CI",total:88,balance:88}],
   ["sale_items",{sale_id:99,qty:1}],
   ["layaway_payments",{layaway_id:201,payment_amount:1}]
 ]) {
   const {error}=await c.from(table).insert(body);
   assert.ok(error,"Admin directly inserted into "+table);
 }
});

test("Admin Auth token permite leer y hacer venta atómica con PostgREST",async()=>{
 const c=users.owner.client;
 const {data:products,error:e}=await c.from("products").select("id,cost,stock");
 assert.ifError(e);
 assert.equal(products.length,1);
 assert.equal(Number(products[0].cost),3);
 const {data:mine,error:me}=await c.from("pos_authorized_users").select("role,active");
 assert.ifError(me);
 assert.equal(mine.length,1);
 assert.equal(mine[0].role,"admin");
 const {data:reserved,error:r}=await c.rpc("donatello_payment_reserve",{
   p_operation_id:A,p_kind:"checkout",p_layaway_id:null
 });
 assert.ifError(r);
 assert.equal(reserved.state,"reserved");
 const {data:receipt,error:ce}=await c.rpc("donatello_checkout_once",{
   p_operation_id:A,p_mode:"sale",
   p_items:[{id:12,qty:1,expected_price:10}],p_discount_percent:0,
   p_received:10,p_customer_name:null,p_customer_phone:null,
   p_deposit:0,p_due_date:null
 });
 assert.ifError(ce);
 assert.equal(receipt.type,"sale");
 assert.equal(Number(receipt.total),10);
 const {data:pending,error:pe}=await c.rpc("donatello_payment_recover");
 assert.ifError(pe);
 assert.equal(pending.state,"completed");
 assert.equal(pending.operation_id,A);
 assert.equal(pending.receipt.id,receipt.id);
 const {data:sales,error:se}=await c.from("sales").select("id,profit,total");
 assert.ifError(se);
 assert.equal(sales.length,1);
 assert.equal(Number(sales[0].profit),7);
 const {data:ack,error:ae}=await c.rpc("donatello_payment_ack",{p_operation_id:A});
 assert.ifError(ae);
 assert.equal(ack.state,"acknowledged");
});
test("Segundo administrador no consulta la reserva o recibo del primero",async()=>{
 const c=users.second.client;
 const {data:receipt,error:e}=await c.rpc("donatello_checkout_status",{p_operation_id:A});
 assert.ifError(e);
 assert.equal(receipt,null);
 const {data:pending,error:pe}=await c.rpc("donatello_payment_recover");
 assert.ifError(pe);
 assert.equal(pending,null);
});
test("Operador firmado no puede leer costos ni insertar ventas",async()=>{
 const c=users.operator.client;
 for(const [table,cols] of [["products","id,cost"],["sales","id,profit"],
 ["sale_items","id,cost,profit"],["layaways","id,items"],
 ["layaway_payments","id,items"]]) {
   const {data,error}=await c.from(table).select(cols);
   assert.ifError(error);
   assert.deepEqual(data,[],table+" leaked");
 }
 await denied(c,"donatello_payment_reserve",{
   p_operation_id:B,p_kind:"checkout",p_layaway_id:null
 });
 const {error:e}=await c.from("sales").insert({total:99,profit:99,received:99});
 assert.ok(e,"Operator bypassed financial write RLS");
});
test("Admin suspendido y cuenta sin registrar no pueden operar",async()=>{
 for(const who of ["suspended","unknown"]){
   const c=users[who].client;
   const {data,error}=await c.from("sales").select("id,profit");
   assert.ifError(error);
   assert.deepEqual(data,[]);
   await denied(c,"donatello_payment_recover",{});
 }
 const {error:e}=await admin.from("pos_authorized_users")
   .update({active:false}).eq("user_id",users.owner.id);
 assert.ifError(e);
 const {data:rows,error:readError}=await users.owner.client.from("sales").select("id");
 assert.ifError(readError);
 assert.deepEqual(rows,[]);
 await denied(users.owner.client,"donatello_checkout_status",{p_operation_id:A});
});
test("Anon y JWT manipulado quedan fuera de API real",async()=>{
 const c=createClient(url,anon,{auth:{persistSession:false}});
 await denied(c,"donatello_checkout_status",{p_operation_id:A});
 const token=users.second.token;
 const bad=token.slice(0,-6)+"ABCDEF";
 const res=await fetch(url+"/rest/v1/sales?select=id",{
  headers:{apikey:anon,Authorization:"Bearer "+bad}
 });
 assert.equal(res.status,401);
});
