import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {createLabProxy} from "../laboratorio/lab-proxy.mjs";
const listen=(s)=>new Promise((ok,fail)=>
  s.once("error",fail).listen(0,"127.0.0.1",()=>ok(s.address().port)));
const close=(s)=>new Promise((ok,fail)=>s.close(e=>e?fail(e):ok()));
test("Puente LAN limita Auth y REST locales, no expone admin ni otras APIs",async()=>{
  const upstream=http.createServer((req,res)=>{
    res.writeHead(200,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});
    res.end(JSON.stringify({path:req.url,method:req.method}));
  });
  const u=await listen(upstream);
  const proxy=createLabProxy({bindHost:"127.0.0.1",port:58423,
    upstreamUrl:"http://127.0.0.1:"+u});
  const p=await listen(proxy);
  try{
    const base="http://127.0.0.1:"+p;
    const health=await fetch(base+"/__atlas_lab_health");
    assert.equal((await health.json()).production,false);
    const auth=await fetch(base+"/auth/v1/token?grant_type=password",{method:"POST"});
    assert.equal(auth.status,200);
    assert.match((await auth.json()).path,/grant_type=password/);
    assert.equal((await fetch(base+"/rest/v1/products?select=id")).status,200);
    assert.equal((await fetch(base+"/auth/v1/admin/users")).status,403);
    assert.equal((await fetch(base+"/storage/v1/object")).status,403);
    assert.throws(()=>createLabProxy({bindHost:"8.8.8.8",port:58423}),/privadas/);
    assert.throws(()=>createLabProxy({bindHost:"127.0.0.1",port:58423,
      upstreamUrl:"https://example.com"}),/BLOQUEADO/);
  }finally{await close(proxy);await close(upstream);}
});
