import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
process.env.LOCAL_DATA_DIR=resolve('../output/api-tests',randomUUID());
process.env.DEMO_INVITE_CODE='test-invite-only';
process.env.AI_API_KEY='';process.env.AI_MODEL='';process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';delete process.env.VERCEL;
const {default:handler}=await import('../api/index.mjs');
const {basicReport}=await import('../lib/analyze.mjs');
const mockReport=()=>({...basicReport(manifest,files,context),assessment:{brief:{takeaway:'先确认型号和报价，再决定是否采购。',price:{quote:'未知',comparison:'未知',judgment:'补报价后再比较。',refs:[]},facts:[],priorities:[{title:'型号未确认',why:'无法对应报价。',action:'请供应商确认型号。',refs:[]}],portfolio:'暂无现有商品数据。',nextAction:'先确认型号。'},criteria:['fit','quality','commercial','portfolio','economics'].map(id=>({id,status:'missing',basis:'未提供本维度依据',refs:[]})),opportunities:[],skuImpact:{summary:'未提供现有 SKU',rows:[]},economics:null}});
const {updateJob}=await import('../lib/store.mjs');
const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const source='暖包产品资料，型号未知。';const files=[{name:'supplier.txt',size:Buffer.byteLength(source),type:'text/plain'}];
const manifest={version:1,pages:[{file:0,page:1,label:'片段 1',text:source,images:[],limitations:[]}],warnings:[]};
const context={market:'中国',purpose:'转售商品',focus:''};
async function request(action,{body,token,id,method=body?'POST':'GET',headers={}}={}){const r=await fetch(`${base}/api/index?action=${action}${id?'&id='+id:''}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
async function create(){const result=await request('create',{body:{invite:'test-invite-only',files,context}});assert.equal(result.status,201);const j=result.data;for(const [target,content] of [[j.targets[0],source],[j.manifestTarget,JSON.stringify(manifest)]]){const r=await fetch(base+target.url,{method:'PUT',headers:{Authorization:'Bearer '+j.token},body:content});assert.equal(r.status,200);}return j;}
test('Upload, basic report, private ownership, share expiry and revocation',async()=>{
  assert.equal((await request('create',{body:{invite:'wrong',files,context}})).status,403);
  assert.equal((await request('create',{body:{invite:'test-invite-only',files,context},headers:{Origin:'https://attacker.example'}})).status,403);
  const j=await create();assert.equal((await request('job',{id:j.id})).status,403);
  assert.equal((await request('job',{id:j.id,token:'x'.repeat(64)})).status,403);
  const generated=await request('generate',{id:j.id,token:j.token,body:{}});assert.equal(generated.status,200);assert.equal(generated.data.report.mode,'basic');
  const shared=await request('share',{id:j.id,token:j.token,body:{audience:'supplier'}});assert.equal(shared.status,200);const token=shared.data.path.split('#')[1];
  const read=await request('shared&token='+token);assert.equal(read.status,200);assert.equal(read.data.report.mode,'supplier');assert.equal(read.data.report.files,undefined);
  await updateJob(j.id,{share_expires_at:new Date(0).toISOString()});assert.equal((await request('shared&token='+token)).status,404);
  await request('revoke',{id:j.id,token:j.token,body:{}});assert.equal((await request('shared&token='+token)).status,404);
});
test('AI adapter mock: concurrent generation charges once, valid JSON persists',async()=>{
  const j=await create();let calls=0;const mock=http.createServer(async(req,res)=>{calls++;for await(const _ of req){}await new Promise(r=>setTimeout(r,100));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'test-completion-id',model:'mock-vision-snapshot',usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150},choices:[{finish_reason:'stop',message:{content:JSON.stringify(mockReport())}}]}));});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
  process.env.AI_BASE_URL=`http://127.0.0.1:${mock.address().port}`;process.env.AI_API_KEY='test';process.env.AI_MODEL='mock-vision-json';
  try{const responses=await Promise.all([request('generate',{id:j.id,token:j.token,body:{}}),request('generate',{id:j.id,token:j.token,body:{}})]);assert.equal(calls,1);assert.equal(responses.filter(r=>r.status===200).length,1);const report=responses.find(r=>r.status===200).data.report;assert.equal(report.mode,'ai');assert.equal(report.model,'mock-vision-snapshot');assert.equal(report.requestId,'test-completion-id');assert.equal(report.usage.total_tokens,150);const persisted=await request('job',{id:j.id,token:j.token});assert.deepEqual(persisted.data.report.usage,report.usage);}finally{process.env.AI_API_KEY='';process.env.AI_MODEL='';await new Promise(r=>mock.close(r));}
});
test('AI service failure stays failed, never silently falls back to basic mode',async()=>{
  const j=await create();const mock=http.createServer((req,res)=>{res.statusCode=429;res.end('{}');});await new Promise(r=>mock.listen(0,'127.0.0.1',r));process.env.AI_BASE_URL=`http://127.0.0.1:${mock.address().port}`;process.env.AI_API_KEY='test';process.env.AI_MODEL='mock';
  try{const result=await request('generate',{id:j.id,token:j.token,body:{}});assert.equal(result.status,400);const job=await request('job',{id:j.id,token:j.token});assert.equal(job.data.status,'failed');assert.equal(job.data.report,null);}finally{process.env.AI_API_KEY='';process.env.AI_MODEL='';await new Promise(r=>mock.close(r));}
});
test('A new AI upload without a decision brief is rejected instead of saving a verbose legacy report',async()=>{
  const j=await create();const old=mockReport();delete old.assessment.brief;
  const mock=http.createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(old)}}]}));});
  await new Promise(r=>mock.listen(0,'127.0.0.1',r));process.env.AI_BASE_URL=`http://127.0.0.1:${mock.address().port}`;process.env.AI_API_KEY='test';process.env.AI_MODEL='mock';
  try{const result=await request('generate',{id:j.id,token:j.token,body:{}});assert.equal(result.status,400);assert.match(result.data.error,/决策摘要/);const persisted=await request('job',{id:j.id,token:j.token});assert.equal(persisted.data.report,null);assert.equal(persisted.data.status,'failed');}
  finally{process.env.AI_API_KEY='';process.env.AI_MODEL='';await new Promise(r=>mock.close(r));}
});
test.after(async()=>{await new Promise(r=>server.close(r));});
