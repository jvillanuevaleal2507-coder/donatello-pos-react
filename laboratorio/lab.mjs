// ATLAS / Donatello: optional, local-only Windows POS test lab.
// No hosted Supabase URL, real user credentials, cloud projects or restore tasks.
import {readFileSync,existsSync,mkdirSync,writeFileSync,rmSync,openSync,closeSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync,spawn} from "node:child_process";
import {networkInterfaces} from "node:os";


const folder=dirname(fileURLToPath(import.meta.url));
const root=resolve(folder,"..");
const runner=resolve(folder,"runner");
const pidFile=resolve(folder,".atlas-mobile-lab.pid");
const logFile=resolve(folder,".atlas-mobile-lab.log");
const qrFile=resolve(folder,".atlas-open.html");
const PROJECT="donatello-mobilelab";
const DB_CONTAINER="supabase_db_"+PROJECT;
const LOCAL_API="http://127.0.0.1:58421";
const EMAIL="atlas-admin@laboratorio.invalid";
const PASSWORD="DonatelloLAB-2026!";
const VITE_PORT=4173;
const LAN_API_PORT=58423;

function output(msg){process.stdout.write(msg+"\n");}
function execute(exe,args,{cwd=root,input,quiet=false,allowFailure=false,env=process.env}={}){
  const shell=process.platform==="win32" && (exe==="npm"||exe==="npx");
  const result=spawnSync(exe,args,{cwd,input,env,encoding:"utf8",shell,windowsHide:true,maxBuffer:10*1024*1024});
  if(result.error||(!allowFailure&&result.status!==0)){
    const details=(result.stderr||result.stdout||String(result.error)||"").trim().slice(-1400);
    throw Error(exe+" no pudo completar la operacion. "+details);
  }
  if(!quiet&&result.status===0&&result.stdout?.trim())output(result.stdout.trim().slice(-750));
  return result;
}
function supabase(args,opts={}){
  // npx executes the official CLI without adding dependencies or changing package files.
  return execute("npx",["--yes","supabase@3.0.0",...args],{cwd:runner,...opts});
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
  // Import only after npm ci completes on a fresh Windows PC.
  const {createClient}=await import("@supabase/supabase-js");
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
  rmSync(qrFile,{force:true});
  if(!existsSync(pidFile))return;
  const raw=readFileSync(pidFile,"utf8").trim();
  let pids=[];
  try {
    const parsed=JSON.parse(raw);
    pids=typeof parsed==="number"?[parsed]:Object.values(parsed);
  }catch{pids=[Number(raw)];}
  for(const pid of pids){
    if(Number.isSafeInteger(pid)&&pid>0){
      try{execute("taskkill",["/PID",String(pid),"/T","/F"],
        {quiet:true,allowFailure:true});}
      catch{/* process might already be gone */}
    }
  }
  rmSync(pidFile,{force:true});
}
async function startSite(keys){
  const addresses=privateIp();
  if(!addresses.length)throw Error("Conecta esta computadora al Wi-Fi privado y vuelve a iniciar");
  const ip=addresses[0].ip;
  stopSite();
  // Build once with the explicitly local Supabase endpoint. Unlike Vite dev,
  // preview has no HMR WebSocket that can reload an Android page after Wi-Fi
  // reconnects and silently discard an in-memory POS draft.
  const labEnv={...process.env,
    VITE_SUPABASE_URL:"http://"+ip+":"+LAN_API_PORT,
    VITE_SUPABASE_ANON_KEY:keys.ANON_KEY,
    VITE_ATLAS_LAB:"true"
  };
  output("Compilando POS local sin recargas automáticas de desarrollo...");
  execute("npm",["run","build"],{env:labEnv,quiet:true});
  const outputFd=openSync(logFile,"w");
  const proxy=spawn(process.execPath,["laboratorio/lab-proxy.mjs",ip,String(LAN_API_PORT)],{
    cwd:root,detached:true,windowsHide:true,
    stdio:["ignore",outputFd,outputFd]
  });
  if(!proxy.pid){
    closeSync(outputFd);
    throw Error("No se pudo iniciar el API de la red privada");
  }
  const site=spawn("cmd.exe",["/d","/c","npm","run","preview","--","--host",ip,
     "--port",String(VITE_PORT),"--strictPort"],{
    cwd:root,detached:true,windowsHide:true,
    stdio:["ignore",outputFd,outputFd],env:labEnv
  });
  closeSync(outputFd);
  writeFileSync(pidFile,JSON.stringify({proxy:proxy.pid,web:site.pid}),"utf8");
  proxy.unref();site.unref();
  if(!site.pid){
    stopSite();
    throw Error("No se pudo iniciar la pagina de prueba");
  }
  let ready=false;
  for(let i=0;i<22;i++){
    await new Promise(done=>setTimeout(done,600));
    try{
      const [web,api]=await Promise.all([
        fetch("http://"+ip+":"+VITE_PORT+"/",{signal:AbortSignal.timeout(1700)}),
        fetch("http://"+ip+":"+LAN_API_PORT+"/__atlas_lab_health",{
          signal:AbortSignal.timeout(1700)})
      ]);
      if(web.ok&&api.ok&&(await api.json()).production===false){ready=true;break;}
    }catch{/* Services starting */}
  }
  if(!ready){
    stopSite();
    throw Error("La pagina o el API local no iniciaron; revisa Docker y el Wi-Fi privado");
  }
  output("");
  output("========== DONATELLO: LABORATORIO ==========");
  output("URL EN ANDROID: http://"+ip+":"+VITE_PORT+"/");
  output("Correo: "+EMAIL);
  output("Contrasena: "+PASSWORD);
  output("===========================================");
  output("PC y Android: MISMO Wi-Fi privado. Sin datos reales.");
  output("Si Windows pide permiso de red, permitir solo redes PRIVADAS.");
  output("El escaner QR puede estar deshabilitado por HTTP: usa producto manual.");
  output("Para terminar, doble clic en CERRAR_LABORATORIO.cmd.");
  // Local QR image. No remote QR generation or production credentials.
  try {
    const {default:QRCode}=await import("qrcode");
    const localUrl="http://"+ip+":"+VITE_PORT+"/";
    const data=await QRCode.toDataURL(localUrl,{width:360,margin:2});
    const html=[
      '<!doctype html><html lang="es"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width">',
      '<title>ATLAS - Laboratorio Donatello</title></head>',
      '<body style="font:16px system-ui;background:#f9f6ed;color:#25231e;text-align:center;padding:26px">',
      '<main style="max-width:560px;margin:auto">',
      '<h1>Donatello · LABORATORIO</h1>',
      '<p><strong>SOLO DATOS FICTICIOS · NO PRODUCCION</strong></p>',
      '<p>Escanea con tu Android conectado al mismo Wi-Fi privado:</p>',
      '<img src="'+data+'" alt="QR para abrir el laboratorio" width="320" height="320">',
      '<p><a href="'+localUrl+'">'+localUrl+'</a></p>',
      '<p>Usuario ficticio: <strong>'+EMAIL+'</strong></p>',
      '<p>Contrasena ficticia: <strong>'+PASSWORD+'</strong></p>',
      '<p>Al terminar, doble clic en CERRAR_LABORATORIO.cmd</p>',
      '</main></body></html>'
    ].join("");
    writeFileSync(qrFile,html,"utf8");
    const escaped=qrFile.replaceAll("'","''");
    const opened=execute("powershell.exe",["-NoProfile","-NonInteractive",
      "-Command","Start-Process -FilePath '"+escaped+"'"],{
      quiet:true,allowFailure:true});
    if(opened.status!==0)output("No se abrio el QR automaticamente. Usa la URL mostrada arriba.");
  }catch(error){
    output("El QR no se pudo abrir. Usa la URL indicada. "+error.message);
  }
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
  supabase(["start","-x","studio,storage-api,realtime,edge-runtime,logflare,imgproxy,mailpit,postgres-meta,supavisor,vector"],{quiet:true});
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

async function smokeDatabase(){
  // The same bootstrap code used on Windows, tested against throwaway Docker.
  // This command is deliberately unavailable on user machines.
  if(process.env.GITHUB_ACTIONS!=="true"||process.platform!=="linux")
    throw Error("Prueba de arranque disponible solo en GitHub Actions");
  const keys=statusEnv();
  const names=execute("docker",["ps","--format","{{.Names}}"],{quiet:true}).stdout
    .split(/\r?\n/).map(x=>x.trim());
  if(!names.includes(DB_CONTAINER))throw Error("No se encontro el contenedor local esperado");
  const created=initDatabase();
  if(!created)throw Error("El laboratorio de CI no comenzo limpio");
  await seedAuth(keys,created);
  const {createClient}=await import("@supabase/supabase-js");
  const login=async()=>{
    const client=createClient(keys.API_URL,keys.ANON_KEY,{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {error}=await client.auth.signInWithPassword({
      email:EMAIL,password:PASSWORD});
    if(error)throw Error("Error autenticando cuenta sintetica: "+error.message);
    return client;
  };
  const deviceA=await login();
  const op="75c8b782-e253-4c94-898f-8b723973cc21";
  const {data:reserved,error:reserveError}=await deviceA.rpc("donatello_payment_reserve",{
    p_operation_id:op,p_kind:"checkout",p_layaway_id:null});
  if(reserveError||reserved?.state!=="reserved")
    throw Error("Reserva rechazada en el laboratorio: "+reserveError?.message);
  const {data:receipt,error:checkoutError}=await deviceA.rpc("donatello_checkout_once",{
    p_operation_id:op,p_mode:"sale",
    p_items:[{id:17,qty:1,expected_price:100}],
    p_discount_percent:0,p_received:100,p_customer_name:null,
    p_customer_phone:null,p_deposit:0,p_due_date:null
  });
  if(checkoutError||receipt?.type!=="sale"||Number(receipt?.total)!==100)
    throw Error("Cobro de prueba fallido: "+checkoutError?.message);
  const deviceB=await login();
  const {data:recovered,error:recoveryError}=await deviceB.rpc("donatello_payment_recover");
  if(recoveryError||recovered?.operation_id!==op||recovered?.state!=="completed")
    throw Error("La segunda sesion no recupero el cobro: "+recoveryError?.message);
  const {data:stock,error:stockError}=await deviceB.from("products")
    .select("stock").eq("id",17).single();
  if(stockError||Number(stock?.stock)!==19)
    throw Error("Inventario sintetico inconsistente");
  const {error:ackError}=await deviceB.rpc("donatello_payment_ack",{
    p_operation_id:op});
  if(ackError)throw Error("No se pudo liberar recibo ficticio: "+ackError.message);
  const {data:cleared,error:clearError}=await deviceA.rpc("donatello_payment_recover");
  if(clearError||cleared!==null)
    throw Error("La reserva no se libero tras el ACK");
  output("ATLAS_LAB_BOOTSTRAP_OK: Auth + venta + segunda sesion + stock + ACK");
}

async function selfCheck(){
  // CI Windows runner exercises both .cmd entrypoints without starting Docker.
  const required=[
    "laboratorio/runner/supabase/config.toml",
    "laboratorio/lab-proxy.mjs",
    "tests/sql/checkout_fixture.sql",
    "supabase/migrations/20261105_pos_checkout_idempotency.sql",
    "supabase/migrations/20261106_pos_layaway_payments.sql",
    "supabase/migrations/20261106_pos_pending_recovery.sql",
    "supabase/migrations/20261106_pos_operator_read_guards.sql",
    "tests/sql/void_sale_production_fixture.sql",
    "package-lock.json"
  ];
  for(const path of required){
    if(!existsSync(resolve(root,path)))throw Error("Falta archivo de laboratorio: "+path);
  }
  const config=file("laboratorio/runner/supabase/config.toml");
  if(!config.includes('project_id = "donatello-mobilelab"')||
      !config.includes("port = 58421")||!config.includes("port = 58422"))
    throw Error("Configuracion de laboratorio incompatible");
  if(!LOCAL_API.includes("127.0.0.1")||!DB_CONTAINER.includes(PROJECT))
    throw Error("No se garantiza aislamiento LOCAL");
  // A dev server would auto-reload on Wi-Fi recovery, invalidating the POS test.
  const launcher=file("laboratorio/lab.mjs");
  const forbiddenDevRunner=['"run"','"dev"','"--"'].join(",");
  if(!launcher.includes('"run","preview"') ||
      !launcher.includes('execute("npm",["run","build"]') ||
      launcher.includes(forbiddenDevRunner))
    throw Error("Laboratorio Android debe usar Vite preview, nunca HMR");
  output("ATLAS_WINDOWS_ENTRYPOINTS_OK: archivos, puertos, preview sin HMR y proyecto local");
}

const cmd=process.argv[2];
if(!["start","stop","smoke-db","selfcheck"].includes(cmd))throw Error("Modo no permitido");
try{if(cmd==="start")await start();else if(cmd==="stop")await stop();else if(cmd==="selfcheck")await selfCheck();else await smokeDatabase();}
catch(error){
  console.error("\nNO SE MODIFICO PRODUCCION. "+error.message);
  console.error("Puedes usar CERRAR_LABORATORIO.cmd para limpiar el laboratorio.");
  process.exitCode=1;
}
