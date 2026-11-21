import {workspaceReady,validAccessKey,sessionCookie,workspaceSession} from '../lib/workspace.mjs';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {CreateSchema,MB,EXTENSIONS,validateFiles,validateManifest,supplierSnapshot} from '../lib/contracts.mjs';
import * as store from '../lib/store.mjs';
import {analyze} from '../lib/analyze.mjs';
import {cachedReview} from '../lib/sample-cache.mjs';
import {searchMarket,verifyMarketSources,inspectProductLinks,safeMarketURL,singlePrice,chinaMarketComparison,MarketInputSchema} from '../lib/market.mjs';
export const config={maxDuration:300};
const hash=s=>createHash('sha256').update(s).digest('hex');
function equal(a,b){return timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));}
function settings(){const number=(k,f,max)=>Math.max(1,Math.min(max,Number(process.env[k])||f));return {maxFileMB:number('MAX_FILE_MB',50,100),maxTotalMB:number('MAX_TOTAL_MB',100,100),maxPages:number('MAX_PAGES',80,80),shareDays:number('SHARE_DAYS',7,30)};}
export async function readBody(req,limit=32000){
  if(req.body!==undefined){const result=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(result)>limit)throw new Error('请求过大');return JSON.parse(result);}
  const parts=[];let size=0;for await(const p of req){size+=p.length;if(size>limit)throw new Error('请求过大');parts.push(p);}return JSON.parse(Buffer.concat(parts).toString()||'{}');
}
async function owner(req,id){if(!z.uuid().safeParse(id).success)throw new Error('无效任务');const token=(req.headers.authorization||'').replace(/^Bearer /,'');const job=await store.getJob(id);const workspace=workspaceSession(req);if(!job||!((token.length>=32&&equal(job.owner_hash,hash(token)))||(workspace&&job.context?.workspaceId===workspace)))throw new Error('无权访问此任务');return job;}
const chinaReport=r=>r?{...r,...(r.marketComparison?{marketComparison:chinaMarketComparison(r.marketComparison)}:{})}:r;
const publicJob=j=>({id:j.id,status:j.status,files:j.files,context:(({workspaceId,...context})=>context)(j.context),createdAt:j.created_at,report:chinaReport(j.report),error:j.error,attempts:j.attempts});
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const reply=(data,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
  const url=new URL(req.url,'http://localhost');const action=url.searchParams.get('action')||'config';const limits=settings();
  try{
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return reply({error:'请求来源无效'},403);
    if(action==='config'&&req.method==='GET')return reply({storage:store.cloud()?'supabase':'local',ready:!process.env.VERCEL||Boolean(store.cloud()&&process.env.DEMO_INVITE_CODE),aiReady:Boolean(process.env.AI_API_KEY&&process.env.AI_MODEL),marketReady:Boolean(process.env.FIRECRAWL_API_KEY),requiresInvite:Boolean(process.env.DEMO_INVITE_CODE),maxFileMB:limits.maxFileMB,maxTotalMB:limits.maxTotalMB,maxPages:limits.maxPages,formats:EXTENSIONS,shareDays:limits.shareDays,workspaceReady:workspaceReady(),workspaceSignedIn:Boolean(workspaceSession(req))});
    if(action==='shared'&&req.method==='GET'){
      const token=url.searchParams.get('token')||'';if(!/^[a-f0-9]{48}$/.test(token))return reply({error:'链接无效或已失效'},404);
      const item=await store.getShared(hash(token));if(!item?.shared_report||Date.parse(item.share_expires_at)<Date.now())return reply({error:'链接无效或已失效'},404);
      return reply({report:chinaReport(item.shared_report),expiresAt:item.share_expires_at});
    }
    if(process.env.VERCEL&&(!store.cloud()||!process.env.DEMO_INVITE_CODE))return reply({error:'本站暂未配置存储与邀请码。可先查看 Warmies 案例；管理员完成配置后即可上传。'},503);
    if(action==='workspace-login'&&req.method==='POST'){
      const input=z.object({key:z.string().max(256)}).parse(await readBody(req));
      if(!validAccessKey(input.key))return reply({error:'工作区访问密钥不正确'},403);
      res.setHeader('Set-Cookie',sessionCookie());return reply({ok:true});
    }
    if(action==='workspace-logout'&&req.method==='POST'){res.setHeader('Set-Cookie',sessionCookie(true));return reply({ok:true});}
    if(action==='history'&&req.method==='GET'){
      const workspace=workspaceSession(req);if(!workspace)return reply({error:'请先登录采购工作区'},401);
      const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)throw new Error('分页参数无效');
      const result=await store.listWorkspaceJobs(workspace,offset);
      return reply({items:result.items.map(j=>({id:j.id,status:j.status,createdAt:j.created_at,title:j.files.filter(f=>f.role!=='internal').map(f=>f.name).join('、'),error:j.error})),total:result.total,nextOffset:offset+result.items.length<result.total?offset+result.items.length:null});
    }
    if(action==='create'&&req.method==='POST'){
      const input=CreateSchema.parse(await readBody(req));if(!workspaceSession(req)&&process.env.DEMO_INVITE_CODE&&!equal(input.invite,process.env.DEMO_INVITE_CODE))return reply({error:'邀请码不正确'},403);
      validateFiles(input.files,limits.maxFileMB,limits.maxTotalMB);
      const token=randomBytes(32).toString('hex');const job={id:crypto.randomUUID(),owner_hash:hash(token),created_at:new Date().toISOString(),files:input.files,context:{...input.context,...(workspaceSession(req)?{workspaceId:workspaceSession(req)}:{})},status:'uploading',attempts:0,reserved_bytes:input.files.reduce((s,f)=>s+f.size,0)+16*MB,report:null,error:null};
      await store.reserve(job);const targets=[];for(let i=0;i<input.files.length;i++)targets.push(await store.uploadTarget(job,i));const manifestTarget=await store.uploadTarget(job,'manifest');return reply({id:job.id,token,targets,manifestTarget},201);
    }
    const id=url.searchParams.get('id');const job=await owner(req,id);
    if(action==='history-claim'&&req.method==='POST'){const workspace=workspaceSession(req);if(!workspace)return reply({error:'请先登录采购工作区'},401);if(job.context.workspaceId&&job.context.workspaceId!==workspace)return reply({error:'任务属于其他工作区'},403);await store.updateJob(job.id,{context:{...job.context,workspaceId:workspace}});return reply({ok:true});}
    if(action==='job'&&req.method==='GET')return reply(publicJob(job));
    if(action==='upload'&&req.method==='PUT'&&!store.cloud()){
      if(job.status!=='uploading')throw new Error('任务不再接受上传');const slot=url.searchParams.get('slot');if(slot!=='manifest'&&(!/^\d$/.test(slot)||!job.files[Number(slot)]))throw new Error('上传位置无效');
      const limit=slot==='manifest'?16*MB:job.files[Number(slot)].size;let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw new Error('上传超过声明大小');chunks.push(chunk);}if(slot!=='manifest'&&bytes!==limit)throw new Error('上传不完整');await store.putLocal(job,slot,Buffer.concat(chunks));return reply({ok:true});
    }
    if(action==='generate'&&req.method==='POST'){
      if(job.report)return reply(publicJob(job));
      const manifest=validateManifest(await store.getManifest(job),job.files,limits.maxPages);await store.verifyOriginals(job);await store.claimJob(job.id);
      try{
        // Once a model is configured, uploaded files always receive a fresh AI review.
        // The saved Warmies report remains available through the explicit example page.
        const cached=process.env.AI_API_KEY&&process.env.AI_MODEL?null:cachedReview(await store.firstFileDigest(job),job.context);
        const result=cached||await analyze(manifest,job.files,(({workspaceId,...context})=>context)(job.context));
        const keywords=job.context.searchKeyword?[job.context.searchKeyword]:result.report.products.filter(p=>job.files[p.source]?.role!=='internal').map(p=>p.name);
        const marketComparison={...await verifyMarketSources(await searchMarket(keywords)),offers:[],baseline:null};
        const report={...result.report,marketComparison,mode:result.mode,model:result.model,usage:result.usage,requestId:result.requestId,ruleVersion:result.ruleVersion,createdAt:new Date().toISOString(),files:job.files.map(({name,size,role})=>({name,size,role:role||'supplier'})),coverage:{pages:manifest.pages.length,images:manifest.pages.reduce((n,p)=>n+p.images.length,0),textPages:manifest.pages.filter(p=>p.text.trim()).length},market:job.context.market,purpose:job.context.purpose};
        await store.updateJob(job.id,{status:'completed',report,error:null,lock_until:null});return reply({id:job.id,status:'completed',report});
      }catch(error){await store.updateJob(job.id,{status:'failed',error:error.message.slice(0,1000),lock_until:null});throw error;}
    }
    if(action==='supplier'&&req.method==='POST'){
      if(!job.report)throw new Error('请先生成内部报告');
      if(job.report.supplierReview?.version===3)return reply({report:chinaReport(job.report)});
      const {buildSupplierReview}=await import('../lib/supplier-review.mjs');
      const manifest=validateManifest(await store.getManifest(job),job.files,limits.maxPages);
      const supplierReview=await buildSupplierReview(manifest,job.files);
      const latest=await store.getJob(job.id);const report={...latest.report,supplierReview};
      await store.updateJob(job.id,{report});return reply({report:chinaReport(report)});
    }
    if(action==='market'&&req.method==='POST'){
      if(!job.report)throw new Error('请先生成报告');
      const input=MarketInputSchema.parse(await readBody(req,600000));
      if(input.screenshot&&Object.keys(input).length!==1)throw new Error('请单独提交价格截图');
      if(input.keyword&&(input.offers!==undefined||input.baseline!==undefined))throw new Error('请分别执行检索和报价保存');
      const previous=chinaMarketComparison(job.report.marketComparison)||{offers:[],baseline:null};
      const marketComparison=input.keyword?{...previous,...await verifyMarketSources(await searchMarket([input.keyword]))}:{...previous,...(input.offers!==undefined?{offers:input.offers}:{}),...(input.baseline!==undefined?{baseline:input.baseline}:{}),updatedAt:new Date().toISOString()};
      if(input.sourceUrls){
        const added=await inspectProductLinks(input.sourceUrls,previous.queries?.[0]||'买方指定产品');
        const urls=new Set(added.map(i=>i.url));
        marketComparison.items=[...(previous.items||[]).filter(i=>!urls.has(safeMarketURL(i.url))),...added].slice(-60);
      }
      if(input.screenshot){
        const {readMarketScreenshot}=await import('../lib/market-vision.mjs');
        const s=input.screenshot,url=safeMarketURL(s.sourceURL),checkedAt=new Date().toISOString();
        const ocr=await readMarketScreenshot({screenshot:s.image,title:s.title,product:previous.queries?.[0]||s.title,pageType:'buyer_screenshot'});
        if(['failed','not_configured'].includes(ocr.status))throw new Error(ocr.note);const matching=ocr.offers.filter(p=>p.matchesCandidate&&singlePrice([p.priceText]));if(matching.length!==1)throw new Error('截图未能确认目标商品的唯一价格，请截取单一商品及对应规格、标价后重试');ocr.offers=matching;
        const item={product:previous.queries?.[0]||s.title,title:s.title,url,platform:new URL(url).hostname,kind:'买方截图参考',pageType:'buyer_screenshot',sourceType:'buyer_screenshot',capturedAt:checkedAt,priceMentions:[],snippet:'买方上传的价格截图，未独立核实截图与链接的一致性。',match:'截图识别 · 不是来源页实时验证',ocr:{...ocr,sourceURL:url,checkedAt,buyerProvided:true,screenshotData:s.image}};
        marketComparison.items=[...(previous.items||[]).filter(x=>!(x.url===url&&x.sourceType==='buyer_screenshot')),...[item]].slice(-60);
      }
      const report={...job.report,marketComparison};
      await store.updateJob(job.id,{report});return reply({report});
    }
    if(action==='share'&&req.method==='POST'){
      if(!job.report)throw new Error('请先生成报告');const body=z.object({audience:z.enum(['review','supplier'])}).parse(await readBody(req));const token=randomBytes(24).toString('hex');const expires=new Date(Date.now()+limits.shareDays*86400000).toISOString();
      const snapshot=body.audience==='supplier'?supplierSnapshot(job.report):job.report;
      await store.updateJob(job.id,{share_hash:hash(token),share_expires_at:expires,shared_report:snapshot});return reply({path:`/share#${token}`,expiresAt:expires,local:!process.env.VERCEL&&!store.cloud()});
    }
    if(action==='revoke'&&req.method==='POST'){await store.updateJob(job.id,{share_hash:null,share_expires_at:null,shared_report:null});return reply({ok:true});}
    return reply({error:'请求不存在'},404);
  }catch(error){const validation=error instanceof z.ZodError;const message=validation?'提交内容不符合格式或长度要求':error.message;reply({error:message||'操作失败'},/无权/.test(message)?403:400);}
}
