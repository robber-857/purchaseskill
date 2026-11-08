import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHash} from 'node:crypto';
import {MB} from './contracts.mjs';
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
export async function verifyOriginals(job){
  for(let i=0;i<job.files.length;i++){
    let size;
    if(cloud()){
      const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
      const response=await fetch(process.env.SUPABASE_URL.replace(/\/$/,'')+`/storage/v1/object/authenticated/${bucket}/${job.id}/source-${i}`,{headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`}),Range:'bytes=0-15'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('原文件未上传完整');size=Number(response.headers.get('content-range')?.split('/')[1]||response.headers.get('content-length'));await response.body?.cancel();
    }else size=(await stat(resolve(root,job.id,`source-${i}`))).size;
    if(size!==job.files[i].size)throw new Error('原文件大小与提交信息不一致，请重新上传');
  }
}
export async function getShared(hash){if(cloud()){const {data,error}=await db().from('review_jobs').select('shared_report,share_expires_at').eq('share_hash',hash).maybeSingle();check(error);return data;}return localTransaction(jobs=>{const j=jobs.find(x=>x.share_hash===hash);return j?{shared_report:j.shared_report,share_expires_at:j.share_expires_at}:null;});}
