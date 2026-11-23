import {mkdir,readFile,writeFile,rename,stat,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHash} from 'node:crypto';
import {MB} from './contracts.mjs';
import {boundedMarketImageBody,maxMarketImageBytes} from './market-capture.mjs';
export {boundedMarketImageBody,maxMarketImageBytes} from './market-capture.mjs';
export const cloud=()=>Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
export const bucket='review-private';
const root=resolve(process.env.LOCAL_DATA_DIR||'.local-data');
let client;
const db=()=>client ||= createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let tail=Promise.resolve();
async function localTransaction(fn){let release;const before=tail;tail=new Promise(r=>release=r);await before;try{await mkdir(root,{recursive:true});let data;try{data=JSON.parse(await readFile(resolve(root,'jobs.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data=[];}const result=await fn(data);const temp=resolve(root,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(data));await rename(temp,resolve(root,'jobs.json'));return result;}finally{release();}}
function check(error){if(error)throw new Error('存储服务操作失败，请检查 Supabase 配置和数据库迁移。');}
export async function reserve(job){
  // Insert directly so existing deployments do not need a quota RPC migration.
  if(cloud()){const {error}=await db().from('review_jobs').insert(job);check(error);return;}
  await localTransaction(jobs=>{jobs.push(job);});
}
export async function getJob(id){if(cloud()){const {data,error}=await db().from('review_jobs').select('*').eq('id',id).maybeSingle();check(error);return data;}return localTransaction(jobs=>jobs.find(j=>j.id===id)||null);}
export async function updateJob(id,patch){if(cloud()){const {error}=await db().from('review_jobs').update(patch).eq('id',id);check(error);return;}await localTransaction(jobs=>{const j=jobs.find(j=>j.id===id);if(!j)throw new Error('任务不存在');Object.assign(j,patch);});}
// transform is synchronous and can be retried. Do I/O (search, OCR, storage) before this call.
export async function mutateReport(id,transform){
  function nextReport(previous){
    if(!previous)throw new Error('请先生成报告');
    const next=transform(previous);
    if(!next||typeof next!=='object'||Array.isArray(next)||typeof next.then==='function')throw new Error('报告更新结果无效');
    return {...next,editRevision:randomUUID()};
  }
  if(!cloud())return localTransaction(jobs=>{
    const job=jobs.find(row=>row.id===id);
    if(!job)throw new Error('任务不存在');
    job.report=nextReport(job.report);
    return job.report;
  });
  for(let attempt=0;attempt<6;attempt++){
    const {data:job,error}=await db().from('review_jobs').select('report').eq('id',id).maybeSingle();
    check(error);
    const revision=job?.report?.editRevision;
    const report=nextReport(job?.report);
    const update=db().from('review_jobs').update({report}).eq('id',id);
    const guarded=revision==null?update.is('report->>editRevision',null):update.eq('report->>editRevision',revision);
    const saved=await guarded.select('id');
    check(saved.error);
    if(saved.data.length)return report;
  }
  throw new Error('报告正在被其他操作更新，请重试');
}
export async function claimJob(id){
  if(cloud()){const {data,error}=await db().rpc('claim_review_job',{p_id:id});check(error);if(!data)throw new Error('任务正在分析、已完成或已达到重试上限');return;}
  await localTransaction(jobs=>{const j=jobs.find(j=>j.id===id);if(!j||j.report||j.attempts>=3||(j.status==='analyzing'&&Date.parse(j.lock_until)>Date.now()))throw new Error('任务正在分析、已完成或已达到重试上限');j.status='analyzing';j.attempts++;j.lock_until=new Date(Date.now()+600000).toISOString();});
}
export async function uploadTarget(job,index){
  const path=`${job.id}/${index==='manifest'?'manifest.json':`source-${index}`}`;
  if(!cloud())return {local:true,url:`/api/index?action=upload&id=${job.id}&slot=${index}`,path};
  const {data,error}=await db().storage.from(bucket).createSignedUploadUrl(path);check(error);
  return {local:false,url:data.signedUrl,token:data.token,path,bucket,endpoint:process.env.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/upload/resumable/sign'};
}
export async function putLocal(job,index,buffer){await mkdir(resolve(root,job.id),{recursive:true});await writeFile(resolve(root,job.id,index==='manifest'?'manifest.json':`source-${index}`),buffer);}
export async function getManifest(job){
  if(cloud()){const {data,error}=await db().storage.from(bucket).download(`${job.id}/manifest.json`);check(error);if(data.size>16*MB)throw new Error('解析结果超过 16 MB，请拆分文件');return JSON.parse(await data.text());}
  const path=resolve(root,job.id,'manifest.json');if((await stat(path)).size>16*MB)throw new Error('解析结果超过 16 MB');return JSON.parse(await readFile(path,'utf8'));
}
export async function firstFileDigest(job){
  if(job.files.length!==1||job.files[0].size!==12219934)return null;
  let bytes;
  if(cloud()){const {data,error}=await db().storage.from(bucket).download(`${job.id}/source-0`);check(error);bytes=Buffer.from(await data.arrayBuffer());}
  else bytes=await readFile(resolve(root,job.id,'source-0'));
  return createHash('sha256').update(bytes).digest('hex');
}
function requestPrivateBytes(path,range){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),Range:range};
  return fetch(process.env.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/authenticated/'+bucket+'/'+path,{
    headers,redirect:'error',signal:AbortSignal.timeout(20000)
  });
}
export async function verifyOriginals(job){
  for(let i=0;i<job.files.length;i++){
    let size;
    if(cloud()){
      const response=await requestPrivateBytes(job.id+'/source-'+i,'bytes=0-15');
      if(!response.ok)throw new Error('原文件未上传完整');size=Number(response.headers.get('content-range')?.split('/')[1]||response.headers.get('content-length'));await response.body?.cancel();
    }else size=(await stat(resolve(root,job.id,`source-${i}`))).size;
    if(size!==job.files[i].size)throw new Error('原文件大小与提交信息不一致，请重新上传');
  }
}
export async function getShared(hash){if(cloud()){const {data,error}=await db().from('review_jobs').select('id,shared_report,share_expires_at').eq('share_hash',hash).maybeSingle();check(error);return data;}return localTransaction(jobs=>{const j=jobs.find(x=>x.share_hash===hash);return j?{id:j.id,shared_report:j.shared_report,share_expires_at:j.share_expires_at}:null;});}

function marketImagePath(jobId,digest){
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(jobId)||!/^[0-9a-f]{64}$/.test(digest))throw new Error('无效价格凭证');
  return `${jobId}/market-evidence/${digest}`;
}
export async function putMarketImage(jobId,bytes,contentType){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>maxMarketImageBytes)throw new Error('价格截图大小无效');
  const digest=createHash('sha256').update(bytes).digest('hex');
  const key=marketImagePath(jobId,digest);
  if(cloud()){
    const {error}=await db().storage.from(bucket).upload(key,bytes,{contentType,upsert:true});
    check(error);
  }else{
    const directory=resolve(root,jobId,'market-evidence');
    await mkdir(directory,{recursive:true});
    const temp=resolve(directory,randomUUID()+'.tmp');
    try{await writeFile(temp,bytes);await rename(temp,resolve(root,key));}
    finally{await rm(temp,{force:true});}
  }
  return digest;
}
export async function getMarketImage(jobId,digest){
  const key=marketImagePath(jobId,digest);
  let bytes;
  if(cloud()){
    const response=await requestPrivateBytes(key,'bytes=0-'+maxMarketImageBytes);
    if(!response.ok){
      await response.body?.cancel();
      if([400,404,416].includes(response.status))return null;
      throw new Error('暂时无法读取价格截图');
    }
    bytes=await boundedMarketImageBody(response);
    if(!bytes)return null;
  }else{
    const path=resolve(root,key);
    try{
      const info=await stat(path);
      if(!info.isFile()||!info.size||info.size>maxMarketImageBytes)return null;
      bytes=await readFile(path);
    }catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  return bytes.length<=maxMarketImageBytes&&createHash('sha256').update(bytes).digest('hex')===digest?bytes:null;
}

export async function listWorkspaceJobs(workspace,offset=0){
 if(cloud()){const {data,error,count}=await db().from('review_jobs').select('id,status,created_at,files,error',{count:'exact'}).eq('context->>workspaceId',workspace).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+49);check(error);return {items:data,total:count};}
 return localTransaction(jobs=>{const items=jobs.filter(j=>j.context?.workspaceId===workspace).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));return {items:items.slice(offset,offset+50),total:items.length};});
}
