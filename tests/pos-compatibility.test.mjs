import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {join,resolve,extname} from "node:path";

// ATLAS regression gate: versioned code must use idempotent RPCs. External
// integrations beyond this repository require a separate compatibility check.
const root=resolve(import.meta.dirname,"..");
const dirs=["src","api","server","supabase/functions"];
const extensions=new Set([".js",".jsx",".ts",".tsx",".mjs",".cjs"]);
const forbidden=[
  ["legacy checkout RPC",/\.rpc\s*\(\s*["']donatello_checkout["']\s*[,)]/g],
  ["direct financial write",/\.from\s*\(\s*["'](?:sales|sale_items|layaways|layaway_payments)["']\s*\)\s*\.\s*(?:insert|upsert|delete)\s*\(/g],
  ["raw financial SQL",/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+(?:public\.)?(?:sales|sale_items|layaways|layaway_payments)\b/gi]
];
const files=[];
function walk(dir){
  for(const entry of readdirSync(join(root,dir),{withFileTypes:true})){
    if(entry.name==="node_modules"||entry.name===".git")continue;
    const path=join(dir,entry.name);
    if(entry.isDirectory())walk(path);
    else if(entry.isFile()&&extensions.has(extname(entry.name)))files.push(path);
  }
}
for(const dir of dirs)walk(dir);

test("No hay checkout legado ni INSERT/UPSERT/DELETE financiero en codigo ejecutable",()=>{
  assert.ok(files.length>=20,"Expected runtime sources missing");
  const failures=[];
  for(const file of files){
    const source=readFileSync(join(root,file),"utf8");
    for(const [label,regex] of forbidden) {
      regex.lastIndex=0;
      for(const match of source.matchAll(regex)){
        failures.push(file+":"+source.slice(0,match.index).split("\n").length+
          " "+label+": "+match[0]);
      }
    }
  }
  assert.deepEqual(failures,[],"Remove unsafe callsites before release");
});
test("Las protecciones y RPC idempotentes no pueden desaparecer de la PR",()=>{
  const read=(p)=>readFileSync(join(root,p),"utf8");
  const guard=read("supabase/migrations/20261106_pos_operator_read_guards.sql");
  const layaway=read("supabase/migrations/20261106_pos_layaway_payments.sql");
  const checkout=read("supabase/migrations/20261105_pos_checkout_idempotency.sql");
  const recovery=read("supabase/migrations/20261106_pos_pending_recovery.sql");
  assert.match(guard,/REVOKE EXECUTE ON FUNCTION public\.donatello_checkout\s*\(/);
  assert.match(guard,/REVOKE INSERT ON TABLE[\s\S]*public\.sales/);
  assert.match(layaway,/CREATE TRIGGER pos_block_liquidation_sale_void/);
  assert.match(layaway,/p\.payment_type\s*=\s*'liquidation'/);
  assert.match(checkout,/CREATE FUNCTION public\.donatello_checkout_once\s*\(/);
  assert.match(recovery,/CREATE FUNCTION public\.donatello_payment_reserve\s*\(/);
  assert.match(recovery,/CREATE FUNCTION public\.donatello_payment_recover\s*\(/);
  assert.match(recovery,/CREATE FUNCTION public\.donatello_payment_ack\s*\(/);
});
