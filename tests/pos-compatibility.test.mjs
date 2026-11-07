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

// Operational safety gate: the production preflight is metadata/reporting
// only. This suite must reject accidental schema/data mutations in the file.
test("El preflight productivo contiene consultas SELECT, nunca operaciones mutables",()=>{
  const sql=readFileSync(join(root,"tests/sql/pos_release_preflight_readonly.sql"),"utf8")
    .replace(/--[^\n]*/g,"")
    .replace(/\/\*[\s\S]*?\*\//g,"");
  assert.match(sql,/\bSELECT\b/i);
  assert.match(sql,/\bto_regclass\s*\(/i);
  assert.match(sql,/\bactive_layaway_consistency\b/i);
  // One SQL result containing every checkpoint; an API that displays only the
  // last SELECT must never hide earlier failed checks.
  assert.equal(sql.split(";").filter(part=>part.trim()).length,1,
    "Preflight must be exactly one SQL statement");
  for(const name of ["schema_columns","pre_release_ledger_absent",
    "legacy_checkout_present","anonymous_cost_denied",
    "admin_only_operational_roles","active_layaway_consistency"]) {
    assert.ok(sql.includes("'"+name+"'"),"Missing preflight control: "+name);
  }
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|NOTIFY|DO|CALL|COPY|EXECUTE|VACUUM|REINDEX|REFRESH|SET|RESET)\b/i);
});

test("El postflight productivo verifica seis invariantes sin alterar datos",()=>{
  const sql=readFileSync(join(root,"tests/sql/pos_release_postflight_readonly.sql"),"utf8")
    .replace(/--[^\n]*/g,"")
    .replace(/\/\*[\s\S]*?\*\//g,"");
  assert.equal(sql.split(";").filter(part=>part.trim()).length,1,
    "Postflight must be one read-only SQL statement");
  for(const name of ["private_ledger_and_pending","new_financial_rpcs",
    "old_checkout_revoked","financial_inserts_revoked",
    "admin_only_financial_reads","ledger_and_liquidation_triggers"]) {
    assert.ok(sql.includes("'"+name+"'"),"Missing postflight control: "+name);
  }
  // The literal privilege name 'EXECUTE' is a read-only SQL argument.
  // Ignore string literals when scanning for mutable SQL keywords.
  const codeOnly=sql.replace(/'(?:''|[^'])*'/g,"''");
  assert.doesNotMatch(codeOnly,/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|NOTIFY|DO|CALL|COPY|EXECUTE|VACUUM|REINDEX|REFRESH|SET|RESET)\b/i);
});


test("Embedded Signup v4 de Donatello usa configuración y modo coexistencia sin extras heredados",()=>{
  const page=readFileSync(join(root,"src/pages/DonatelloWhatsAppBotPage.jsx"),"utf8");
  assert.match(page,/META_APP_ID\s*=\s*"2173704550192119"/);
  assert.match(page,/META_CONFIG_ID\s*=\s*"2133113274004543"/);
  const login=page.slice(page.indexOf('window.FB.login('),page.indexOf('\n  async function toggle()'));
  assert.ok(login.startsWith('window.FB.login('),"Missing login integration");
  assert.match(login,/response_type:\s*"code"/);
  assert.match(login,/version:\s*"v4"/);
  assert.match(login,/featureType:\s*"whatsapp_business_app_onboarding"/);
  // Meta v4 uses the login configuration for assets/permissions; do not send
  // legacy v2/v3 sessionInfoVersion or the redundant features: null key.
  const withoutComments=login.replace(/\/\/[^\n]*/g,"");
  assert.doesNotMatch(withoutComments,/\bsessionInfoVersion\s*:/);
  assert.doesNotMatch(withoutComments,/\bfeatures\s*:/);
  assert.match(page,/setBusy\("connect"\)/);
  assert.match(page,/El bot permanece apagado/);
});
