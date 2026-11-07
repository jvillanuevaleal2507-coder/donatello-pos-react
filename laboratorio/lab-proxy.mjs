import http from "node:http";
import {isIP} from "node:net";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

// LAN adapter: only GoTrue login/user/logout and PostgREST from local Supabase.
// No remote URL or admin endpoint; never distributes service-role credentials.
export function createLabProxy({bindHost,port,upstreamUrl="http://127.0.0.1:58421"}){
  if(isIP(bindHost)!==4)throw Error("IP invalida");
  if(!(/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(bindHost)
       ||bindHost==="127.0.0.1"))throw Error("Solo redes privadas");
  const upstream=new URL(upstreamUrl);
  if(upstream.protocol!=="http:"||
     !["127.0.0.1","localhost"].includes(upstream.hostname))
    throw Error("BLOQUEADO: no se permite una API remota");
  return http.createServer((req,res)=>{
    const path=new URL(req.url||"/","http://"+bindHost+":"+port).pathname;
    if(path==="/__atlas_lab_health"){
      res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
      res.end(JSON.stringify({mode:"ATLAS_LOCAL_LAB",production:false}));
      return;
    }
    const auth=/^\/auth\/v1\/(?:token|user|logout)(?:\/|$)/.test(path);
    const rest=/^\/rest\/v1(?:\/|$)/.test(path);
    if((!auth&&!rest)||!["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"].includes(req.method)){
      res.writeHead(403,{"Content-Type":"text/plain","Cache-Control":"no-store"});
      res.end("Ruta del laboratorio no permitida");
      return;
    }
    const headers={...req.headers,host:upstream.host};
    delete headers.connection;
    delete headers["x-forwarded-host"];
    delete headers["x-forwarded-for"];
    delete headers["x-forwarded-proto"];
    const outgoing=http.request({protocol:upstream.protocol,hostname:upstream.hostname,
        port:upstream.port,path:req.url,method:req.method,headers,timeout:15000},up=>{
      const h={...up.headers,"cache-control":"no-store"};
      delete h.connection;
      res.writeHead(up.statusCode||502,h);
      up.pipe(res);
    });
    outgoing.on("timeout",()=>outgoing.destroy(new Error("Timeout")));
    outgoing.on("error",()=>{
      if(!res.headersSent)res.writeHead(502,{"Content-Type":"text/plain"});
      if(!res.writableEnded)res.end("El servidor de prueba no responde");
    });
    req.pipe(outgoing);
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const host=process.argv[2],port=Number(process.argv[3]||58423);
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error("Puerto invalido");
  const server=createLabProxy({bindHost:host,port});
  server.listen(port,host,()=>process.stdout.write("ATLAS API en red privada "+host+":"+port+"\n"));
}
