// ATLAS / Donatello: optional, local-only Windows POS test lab.
// No hosted Supabase URL, real user credentials, cloud projects or restore tasks.
import {readFileSync,existsSync,mkdirSync,writeFileSync,rmSync,openSync,closeSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync,spawn} from "node:child_process";
import {networkInterfaces} from "node:os";
import {createClient} from "@supabase/supabase-js";

const folder=dirname(fileURLToPath(import.meta.url));
const root=resolve(folder,"..");
const runner=resolve(folder,"runner");
const pidFile=resolve(folder,".atlas-mobile-lab.pid");
const logFile=resolve(folder,".atlas-mobile-lab.log");
const PROJECT="donatello-mobilelab";
const DB_CONTAINER="supabase_db_"+PROJECT;
const LOCAL_API="http://127.0.0.1:58421";
const EMAIL="atlas-admin@laboratorio.invalid";
const PASSWORD="DonatelloLAB-2026!";
const VITE_PORT=4173;

function output(msg){process.stdout.write(msg+"\n");}
function execute(exe,args,{cwd=root,input,quiet=false,allowFailure=false}={}){
  const shell=process.platform==="win32" && (exe==="npm"||exe==="npx");
  const result=spawnSync(exe,args,{cwd,input,encoding:"utf8",shell,windowsHide:true,maxBuffer:10*1024*1024});
  if(result.error||(!allowFailure&&result.status!==0)){
    const details=(result.stderr||result.stdout||String(result.error)||"").trim().slice(-1400);
    throw Error(exe+" no pudo completar la operacion. "+details);
  }
  if(!quiet&&result.status===0&&result.stdout?.trim())output(result.stdout.trim().slice(-750));
  return result;
}
function supabase(args,opts={}){
  // npx executes the official CLI without adding dependencies or changing package files.
  return execute("npx",["--yes","supabase",...args],{cwd:runner,...opts});
}
function statusEnv(){
  const text=supabase(["status","-o","env"],{quiet:true}).stdout;
  const kv=Object.fromEntries(text.split(/\r?\n/).map(x=>x.trim())
    .filter(x=>/^[A-Z][A-Z_]*=/.test(x))
    .map(x=>{const p=x.indexOf("=");return[x.slice(0,p),x.slice(p+1).replace(/^["']|["']$/g,"")]}));
  if(!kv.API_URL||!kv.ANON_KEY||!kv.SERVICE_ROLE_KEY)
    throw Error("Supabase local no entrego las claves de prueba");
  if(kv.API_URL.replace(/\/$/,"")!==LOCAL_API)
    throw Error("BLOQUEADO: la URL no corresponde al laboratorio LOCAL");
  return kv;
}
function dockerSql(sql){
  return execute("docker",["exec","-i",DB_CONTAINER,"psql","-X","-v","ON_ERROR_STOP=1",
     "-U","postgres","-d","postgres","-t","-A"],{input:sql,quiet:true}).stdout.trim();
}
function file(path){return readFileSync(resolve(root,path),"utf8");}
function initDatabase(){
  const marker=dockerSql("SELECT to_regclass('private.pos_payment_pending') IS NOT NULL;");
  if(marker==="t"){
    output("El laboratorio ya contiene datos de prueba; se conservaran.");
    return false;
  }
  if(marker!=="f")throw Error("No fue posible reconocer el estado local");
  const fixture=file("tests/sql/checkout_fixture.sql");
  const index=fixture.indexOf("CREATE TABLE public.pos_authorized_users (");
  const insert="INSERT INTO public.pos_authorized_users(user_id,role,active)\n"+
    "VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);";
  if(index<0||!fixture.includes(insert))throw Error("Cambio la estructura del fixture; se cancelo la preparacion");
  dockerSql("CREATE SCHEMA IF NOT EXISTS private;\n"+fixture.slice(index).replace(insert,""));
  dockerSql("ALTER TABLE public.products "+
    "ADD COLUMN IF NOT EXISTS category text, "+
    "ADD COLUMN IF NOT EXISTS image_url text, "+
    "ADD COLUMN IF NOT EXISTS image_url_2 text, "+
    "ADD COLUMN IF NOT EXISTS image_url_3 text, "+
    "ADD COLUMN IF NOT EXISTS image_url_4 text;");
  dockerSql("INSERT INTO public.products(id,code,name,category,cost,price,stock) VALUES "+
   "(17,'LAB-SILLA','Silla de prueba','Sillas',35,100,20),"+
   "(18,'LAB-MESA','Mesa de prueba','Mesas',150,300,10),"+
   "(19,'LAB-LAMPARA','Lampara de prueba','Iluminacion',60,150,10);");
  dockerSql(file("supabase/migrations/20261105_pos_checkout_idempotency.sql"));
  const layaway=file("tests/sql/layaway_fixture.sql");
  const markerStart=layaway.indexOf("-- Forced journal failure");
  const markerEnd=layaway.indexOf("GRANT SELECT, INSERT ON public.layaway_payments",markerStart);
  if(markerStart<0||markerEnd<0)throw Error("Cambio la estructura de apartados");
  dockerSql(layaway.slice(0,markerStart)+layaway.slice(markerEnd));
  dockerSql(file("supabase/migrations/20261106_pos_layaway_payments.sql"));
  dockerSql(file("supabase/migrations/20261106_pos_pending_recovery.sql"));
  dockerSql(file("supabase/migrations/20261106_pos_operator_read_guards.sql"));
  dockerSql(file("tests/sql/void_sale_production_fixture.sql"));
  dockerSql(file("supabase/migrations/20261103_pos_payment_fee_settings.sql"));
  output("Base de prueba preparada con productos y apartados ficticios.");
  return true;
}
async function seedAuth(keys,isNew){
  const admin=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false}});
  if(isNew){
    const {data,error}=await admin.auth.admin.createUser({
      email:EMAIL,password:PASSWORD,email_confirm:true});
    if(error||!data?.user?.id)throw Error("No se pudo crear el usuario ficticio: "+error?.message);
    const {error:grant}=await admin.from("pos_authorized_users").insert({
      user_id:data.user.id,role:"admin",active:true});
    if(grant)throw Error("No se pudo asignar el rol ficticio: "+grant.message);
  }
  const client=createClient(keys.API_URL,keys.ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false}});
  const {error:login}=await client.auth.signInWithPassword({email:EMAIL,password:PASSWORD});
  if(login)throw Error("No fue posible probar el login local: "+login.message);
  const {data,error}=await client.from("products").select("id").eq("id",17);
  if(error||data?.length!==1)throw Error("El inventario local no paso la comprobacion de acceso");
}
function privateIp(){
  const candidates=[];
  for(const [adapter,items] of Object.entries(networkInterfaces())){
    if(/wsl|docker|hyper-v|virtual|vEthernet|vmware|tailscale|zerotier|vpn/i.test(adapter))continue;
    for(const net of items||[]){
      if((net.family==="IPv4"||net.family===4)&&!net.internal&&
          (/^192\.168\./.test(net.address)||/^10\./.test(net.address)||
           /^172\.(1[6-9]|2\d|3[01])\./.test(net.address)))
        candidates.push({adapter,ip:net.address});
    }
  }
  candidates.sort((a,b)=>Number(/Wi-Fi|WLAN|Wireless/i.test(b.adapter))-
                        Number(/Wi-Fi|WLAN|Wireless/i.test(a.adapter)));
  return candidates;
}
function stopSite(){
  if(!existsSync(pidFile))return;
  const raw=readFileSync(pidFile,"utf8").trim();
  const pid=Number(raw);
  if(Number.isSafeInteger(pid)&&pid>0){
    try{execute("taskkill",["/PID",String(pid),"/T","/F"],{quiet:true,allowFailure:true});}
    catch{/* process could be gone */}
  }
  rmSync(pidFile,{force:true});
}
async function startSite(keys){
  const addresses=privateIp();
  if(!addresses.length)throw Error("Conecta esta computadora al Wi-Fi privado y vuelve a iniciar.");
  const ip=addresses[0].ip;
  stopSite();
  const outputFd=openSync(logFile,"w");
  const child=spawn("cmd.exe",["/d","/c","npm","run","dev","--","--host","0.0.0.0",
     "--port",String(VITE_PORT),"--strictPort"],{
    cwd:root,detached:true,windowsHide:true,
    stdio:["ignore",outputFd,outputFd],
    env:{...process.env,VITE_SUPABASE_URL:LOCAL_API.replace("127.0.0.1",ip),
         VITE_SUPABASE_ANON_KEY:keys.ANON_KEY,VITE_ATLAS_LAB:"true"}
  });
  closeSync(outputFd);
  if(!child.pid)throw Error("No se pudo iniciar el servidor web local");
  writeFileSync(pidFile,String(child.pid),"utf8");
  child.unref();
  let ready=false;
  for(let i=0;i<18;i++){
    await new Promise(done=>setTimeout(done,650));
    try{
      const res=await fetch("http://127.0.0.1:"+VITE_PORT+"/",{signal:AbortSignal.timeout(1800)});
      if(res.ok){ready=true;break;}
    }catch{/* startup */}
  }
  if(!ready)throw Error("La pagina no arranco. Revisa "+logFile);
  output("");
  output("========== DONATELLO: LABORATORIO ==========");
  output("URL EN EL CELULAR: http://"+ip+":"+VITE_PORT+"/");
  if(addresses.length>1){
    for(const alt of addresses.slice(1,3))
      output("Alternativa de red: http://"+alt.ip+":"+VITE_PORT+"/");
  }
  output("Correo: "+EMAIL);
  output("Contrasena: "+PASSWORD);
  output("===========================================");
  output("Celular y PC: MISMO Wi-Fi privado. Sin datos reales.");
  output("Si Windows pide permiso de red, permitir solo redes PRIVADAS.");
  output("Para terminar, usa CERRAR_LABORATORIO.cmd.");
  try{spawn("cmd.exe",["/c","start","","http://127.0.0.1:"+VITE_PORT+"/"],{
    detached:true,windowsHide:true,stdio:"ignore"}).unref();}catch{/* manual browser */}
}
async function start(){
  if(process.platform!=="win32")throw Error("Este lanzador esta preparado para Windows");
  const major=Number(process.versions.node.split(".")[0]);
  if(major<22)throw Error("Necesitas Node.js 22 o superior para este laboratorio");
  output("1/4 Comprobando Docker Desktop y Node.js...");
  const d=execute("docker",["info","--format","{{.ServerVersion}}"],{
    quiet:true,allowFailure:true});
  if(d.status!==0)throw Error("Abre Docker Desktop, verifica que funcione y vuelve a hacer doble clic.");
  if(!existsSync(resolve(root,"node_modules","@supabase","supabase-js"))||
     !existsSync(resolve(root,"node_modules","vite"))){
    output("2/4 Preparando dependencias la primera vez...");
    execute("npm",["ci","--ignore-scripts","--no-audit","--no-fund"],{quiet:true});
  }else output("2/4 Dependencias listas.");
  output("3/4 Iniciando Supabase SOLO en esta PC (sin cuenta remota)...");
  supabase(["start","-x","studio,storage,realtime,edge-runtime,analytics,imgproxy"],{quiet:true});
  const keys=statusEnv();
  const dockerNames=execute("docker",["ps","--format","{{.Names}}"],{quiet:true}).stdout
    .split(/\r?\n/).map(x=>x.trim());
  if(!dockerNames.includes(DB_CONTAINER))
    throw Error("Contenedor esperado no encontrado; no se ejecutara SQL en otra base.");
  const newDb=initDatabase();
  await seedAuth(keys,newDb);
  output("4/4 Publicando la pantalla SOLO en tu red local...");
  await startSite(keys);
}
async function stop(){
  if(process.platform!=="win32")throw Error("Este cierre es para Windows");
  stopSite();
  output("Cerrando los contenedores exclusivos del laboratorio...");
  const result=supabase(["stop","--no-backup"],{quiet:true,allowFailure:true});
  if(result.status!==0)
    output("No se pudo detener automaticamente Supabase: revisa Docker Desktop.");
  else output("Laboratorio cerrado. Los datos de prueba se descartaron (sin respaldos).");
}
const cmd=process.argv[2];
if(!["start","stop"].includes(cmd))throw Error("Modo permitido: start o stop");
try{if(cmd==="start")await start();else await stop();}
catch(error){
  console.error("\nNO SE MODIFICO PRODUCCION. "+error.message);
  console.error("Puedes usar CERRAR_LABORATORIO.cmd para limpiar el laboratorio.");
  process.exitCode=1;
}
