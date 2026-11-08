import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import handler from '../api/index.mjs';
const production=process.argv.includes('--production');
const vite=production?null:await (await import('vite')).createServer({server:{middlewareMode:true,fs:{strict:true}},appType:'spa'});
const root=resolve('dist');
const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/'))return handler(req,res);
  // One explicitly allowlisted local fixture; never expose repository or local-data directories.
  if(req.url==='/local-fixture/warmies.pdf'){
    try{const path=resolve('../assets/warmies-brand-book.pdf');const s=await stat(path);res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':s.size});createReadStream(path).pipe(res);}catch{res.writeHead(404);res.end();}return;
  }
  if(vite)return vite.middlewares(req,res);
  try{let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root+ '/')&&!path.startsWith(root+'\\')&&path!==root)throw new Error('invalid');try{if(!(await stat(path)).isFile())throw new Error();}catch{if(extname(path)){res.statusCode=404;res.end();return;}path=resolve(root,'index.html');}const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.svg':'image/svg+xml','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.pdf':'application/pdf'};res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}
});
server.requestTimeout=300000;
server.listen(Number(process.env.PORT)||8151,'127.0.0.1',()=>console.log('Purchase Review: http://127.0.0.1:'+(process.env.PORT||8151)));
