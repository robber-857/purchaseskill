import {marketEditor} from './market-report.js';
import './style.css';
import './report-workspace.css';
import {openPanel, closePanel, resetPanels} from './panels.js';
import baseCSS from './style.css?raw';
import reportCSS from './report-workspace.css?raw';
const css=baseCSS+'\n'+reportCSS;
import {warmiesReport} from './sample.js';
import {escape as e,reportHTML,downloadReport} from './report.js';
import {supplierSnapshot,validateFiles} from '../lib/contracts.mjs';
const app=document.querySelector('#app');
let config={maxFileMB:50,maxTotalMB:100,maxPages:80,ready:false,aiReady:false};
let files=[],manifest=null,job=null,report=null,busy=false,sourceURLs=[];
const getSaved=()=>{try{return JSON.parse(localStorage.getItem('purchase-review-job'));}catch{return null;}};
const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.ceil(n/1024)+' KB';
const api=async(action,{body,method=body?'POST':'GET',id=job?.id,token=job?.token}={})=>{const response=await fetch(`/api/index?action=${action}${id?'&id='+encodeURIComponent(id):''}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'请求失败');return result;};
let internalFiles=[],internalStore,storageError='',sourceFiles=[],workspaceLoaded=false;
const draft={market:'中国',purpose:'转售商品',focus:'',invite:'',searchKeyword:''};
let sectionObserver;
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${({home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',report:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',chart:'<path d="M4 3v17h17M8 16v-5M13 16V7M18 16V4"/>',check:'<path d="m7 12 3 3 7-7"/><circle cx="12" cy="12" r="9"/>',file:'<path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>'})[name]||''}</svg>`;
function shell(content,{reportView=false,supplier=false,internalView=false}={}){
  sectionObserver?.disconnect();resetPanels();
  const sections=[['overview','grid','决策总览'],['price','chart','价格与产品'],['market-comparison','chart','相似产品比价'],['priorities','check','关键问题'],['portfolio','grid','现有商品影响'],['actions','check','下一步'],['evidence','file','详细依据']];
  app.innerHTML=`<aside class="app-sidebar"><a class="brand" href="/" aria-label="选品有据 首页"><span class="brandmark">选</span><span>选品有据<small>PURCHASE REVIEW</small></span></a><div class="workspace-label"><span class="workspace-avatar">P</span><div>采购评审工作区<small>产品评估与决策</small></div></div><nav class="primary-nav" aria-label="主导航"><a href="/" ${!reportView&&!internalView?'aria-current="page"':''}>${icon('home')}供应商资料</a><a href="/internal-data" ${internalView?'aria-current="page"':''}>${icon('grid')}内部经营数据</a><a href="${reportView?'#report-top':'/example/warmies'}" ${reportView?'aria-current="page"':''}>${icon('report')}采购评审报告</a></nav>${reportView&&!supplier?`<div class="nav-caption">报告目录</div><nav class="report-nav" aria-label="报告章节">${sections.map(([id,svg,label],i)=>`<a href="#${id}" ${i===0?'aria-current="location"':''}>${icon(svg)}${label}<span>${String(i+1).padStart(2,'0')}</span></a>`).join('')}</nav>`:'<div class="sidebar-hint"><span>评审流程</span><p>上传资料<br>核对证据<br>评估价值与风险<br>生成独立报告</p></div>'}<div class="sidebar-bottom"><span class="status-dot"></span><div>以证据推进采购<small>报告辅助决策，买方确认执行</small></div></div></aside><header class="topbar"><a class="mobile-brand" href="/">选品有据</a><div class="breadcrumb">工作区 <span>/</span> ${reportView?(supplier?'供应商反馈':'采购评审报告'):internalView?'内部经营数据':'供应商资料'}</div><span class="header-status"><i></i>${reportView?(supplier?'对外版本':'内部评审'):'产品资料评审'}</span><span class="user-avatar">采</span></header><nav class="upload-mobile-nav" aria-label="资料导航"><a href="/" ${!reportView&&!internalView?'aria-current="page"':''}>供应商资料</a><a href="/internal-data" ${internalView?'aria-current="page"':''}>内部经营数据</a></nav>${content}<div id="toast" role="status"></div><section id="source-dialog" class="flow-panel source-panel" aria-label="来源预览" hidden><div class="panel-toolbar"><button class="close" aria-label="关闭来源">← 返回报告 / 工作台</button><span>来源预览 · 向下滚动查看完整内容</span></div><div id="source-content"></div></section>`;
  app.querySelector('#source-dialog .close').onclick=closePanel;
  const links=[...app.querySelectorAll('.report-nav a')];
  if(links.length){sectionObserver=new IntersectionObserver(entries=>{for(const item of entries)if(item.isIntersecting){links.forEach(a=>{if(a.hash==='#'+item.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-15% 0px -65% 0px'});links.forEach(a=>{const target=document.querySelector(a.hash);if(target)sectionObserver.observe(target);});}
}
function notify(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');setTimeout(()=>el.classList.remove('visible'),4500);}
function error(text){const el=document.querySelector('#error');if(el){el.hidden=false;el.textContent=text;}else notify(text);}
function home(){
  shell(`<main class="workspace"><section class="work-panel"><div class="eyebrow">供应商资料 <span>01 / REVIEW</span></div><h1>评审这次采购</h1><p class="intro">上传产品介绍与报价，结合已选的内部经营数据生成采购建议。</p>
  <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="选择供应商资料"><span class="upload-symbol">↥</span><h2>上传供应商资料</h2><p>Excel · CSV · PDF · PPTX / PPT · 图片 · DOCX · TXT</p><small>单个 ≤ ${config.maxFileMB} MB · 合计 ≤ ${config.maxTotalMB} MB · 最多 6 份 / ${config.maxPages} 页</small><input id="file-input" type="file" multiple hidden accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.docx,.txt,.xlsx,.xls,.csv"></div><div id="file-list"></div>
  <p class="format-note">Excel 支持 .xlsx / .xls；CSV 请保存为 UTF-8。表格按工作表与行号保留来源。两类资料合计最多 6 份。</p>
  <div id="internal-summary" class="internal-summary"></div><div class="context-fields"><label>目标市场<input id="market" value="中国" maxlength="80"></label><label>采购用途<select id="purpose"><option>转售商品</option><option>自用设备 / 软件</option><option>原料 / 耗材</option></select></label></div>
  <label class="focus-label">相似产品检索词 <span>选填；留空时从供应商产品名称识别</span><input id="searchKeyword" maxlength="100" placeholder="公开产品名称、型号或品类，不填内部价格与经营数据"></label><p class="format-note">${config.marketReady?'自动比价检索已启用：仅查询1688和淘宝的公开内容，不登录。保留链接、价格原文和获取时间；人民币价格按批发 / 零售分别比较。':'自动检索尚未配置：报告仍提供平台限定搜索入口和人工报价对比。'} 可在报告中核对和补录采购报价。</p><label class="focus-label">重点关注 <span>选填</span><textarea id="focus" maxlength="1000" placeholder="例如：关注这款产品与现有 SKU 的重叠、价格空间及退出条件。内部库存与成本请在「内部经营数据」中添加。"></textarea></label>
  ${config.requiresInvite?'<label class="invite-label">体验邀请码<input id="invite" type="password" autocomplete="off" placeholder="输入邀请方提供的邀请码"></label>':''}
  <div class="mode-note"><span class="status-dot"></span><div><strong>${config.aiReady?'AI 采购初筛已启用':'当前为基础资料整理'}</strong><p>${config.aiReady?'使用视觉模型阅读资料，生成带来源的初筛报告。':'可解析文件、查看逐页来源、生成资料摘录与通用补件清单。启用模型后可做语义评估。'}</p></div></div>
  <div id="error" class="error" role="alert" hidden></div><div id="progress" class="progress" hidden><div class="progress-track"><span id="progress-fill"></span></div><p id="progress-text" aria-live="polite"></p></div>
  <div class="actions"><button id="generate" class="primary" ${!config.ready?'disabled':''}>${config.aiReady?'解析并生成 AI 初筛':'解析并生成基础报告'} <span>↗</span></button><button id="preview" class="secondary">仅预览解析</button></div>
  <p class="privacy-note">点击生成后，原文件与解析内容将保存至${config.storage==='supabase'?'私有云存储':'本机'}${config.aiReady?'，并提交给配置的模型服务':''}。${config.marketReady?'供应商产品名称或你填写的检索词会提交给搜索服务。':''}分享报告不会公开原始附件。</p>
  ${!config.ready?'<p class="setup-note">在线服务尚未配置。你可以预览文件解析或直接查看 Warmies 案例。</p>':''}
  ${getSaved()?'<button id="resume" class="text-button">恢复上次任务 →</button>':''}<div id="page-preview"></div></section>
  <aside class="example-panel"><div class="eyebrow">先看一份真实案例 <span>↗</span></div><a class="example-art" href="/example/warmies"><div class="sample-letters">W</div><img src="/demo-assets/penguin.png" alt="Warmies 品牌册中的企鹅造型" onerror="this.hidden=true"><span>WARMIES<br><small>BRAND BOOK / 2024–2025</small></span></a><h2>一份品牌册，<br>能确认哪些采购信息？</h2><p>基于 47 页真实附件，重点查看企鹅与蓝色龙两款。保留证据页码，区分宣传声明与已观察事实。</p><a class="example-link" href="/example/warmies">打开已审阅报告 <span>→</span></a>${config.storage==='local'?'<button id="use-warmies" class="text-button">用 Warmies 原 PDF 体验上传 →</button>':''}<div class="example-foot"><span>无需登录</span><span>无需等待生成</span><span>没有模拟利润</span></div><div class="workflow"><div><b>01</b><span>读资料<small>保留文件、页面与内容</small></span></div><div><b>02</b><span>看证据<small>标出声明、未知和限制</small></span></div><div><b>03</b><span>交付报告<small>独立导出，按需分享</small></span></div></div></aside></main>`);
  const input=document.querySelector('#file-input'),drop=document.querySelector('#dropzone');
  drop.onclick=ev=>{if(ev.target!==input&&!busy)input.click();};drop.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();if(!busy)input.click();}};
  input.onchange=()=>addFiles([...input.files]);drop.ondragover=ev=>{ev.preventDefault();drop.classList.add('dragover');};drop.ondragleave=()=>drop.classList.remove('dragover');drop.ondrop=ev=>{ev.preventDefault();drop.classList.remove('dragover');if(!busy)addFiles([...ev.dataTransfer.files]);};
  document.querySelector('#generate').onclick=()=>run(true);document.querySelector('#preview').onclick=()=>run(false);
  document.querySelector('#use-warmies')?.addEventListener('click',async()=>{if(busy)return;lock(true);progress('正在载入 Warmies 原始 PDF…',5);try{const response=await fetch('/local-fixture/warmies.pdf');if(!response.ok)throw new Error('本地未找到 Warmies PDF');const file=new File([await response.blob()],'Warmies-brand-book.pdf',{type:'application/pdf'});lock(false);addFiles([file]);progress('原文件已载入，可以开始解析。',0);}catch(err){error(err.message);}finally{lock(false);}});
  document.querySelector('#resume')?.addEventListener('click',resume);renderFiles();renderInternalSummary();
  for(const key of ['market','purpose','focus','invite','searchKeyword']){const el=document.getElementById(key);if(el){el.value=draft[key];el.addEventListener('input',()=>{draft[key]=el.value;});}}
  if(storageError)error(storageError);
}
function addFiles(incoming){
  if(busy)return;const next=[...files,...incoming];
  try{if(next.length>6)throw new Error('供应商资料最多 6 份；生成时与内部资料合计最多 6 份。');validateFiles(next,config.maxFileMB,config.maxTotalMB);for(const f of next)if(!f.size)throw new Error('不能上传空文件');}
  catch(err){return error(err.message);}
  files=next;manifest=null;job=null;sourceURLs.forEach(URL.revokeObjectURL);sourceURLs=[];document.querySelector('#error').hidden=true;document.querySelector('#page-preview').innerHTML='';renderFiles();
}
function renderFiles(){document.querySelector('#file-list').innerHTML=files.map((f,i)=>`<div class="file-row"><span class="file-type">${e(f.name.split('.').pop().toUpperCase())}</span><div><strong>${e(f.name)}</strong><small>${size(f.size)}</small></div><button data-remove="${i}" aria-label="移除 ${e(f.name)}" ${busy?'disabled':''}>×</button></div>`).join('');document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.remove,1);manifest=null;job=null;document.querySelector('#page-preview').innerHTML='';renderFiles();});}
function progress(text,percent){const p=document.querySelector('#progress');p.hidden=false;document.querySelector('#progress-text').textContent=text;document.querySelector('#progress-fill').style.width=percent+'%';}
function lock(value){busy=value;for(const el of document.querySelectorAll('input,select,textarea,#generate,#preview,#use-warmies,#resume,[data-remove],[data-preview-internal],[data-remove-internal]'))el.disabled=value||(!config.ready&&el.id==='generate');}
async function upload(blob,target,token,onProgress){
  if(!target.local&&blob.size>6*1048576){const {Upload}=await import('tus-js-client');return new Promise((resolve,reject)=>{const task=new Upload(blob,{endpoint:target.endpoint,headers:{'x-signature':target.token},uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,chunkSize:6*1048576,retryDelays:[0,1000,3000],metadata:{bucketName:target.bucket,objectName:target.path,contentType:blob.type||'application/octet-stream',cacheControl:'3600'},onError:reject,onProgress:(a,b)=>onProgress(a/b),onSuccess:resolve});task.start();});}
  return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',target.url);if(target.local)xhr.setRequestHeader('Authorization','Bearer '+token);xhr.setRequestHeader('Content-Type',blob.type||'application/octet-stream');xhr.timeout=180000;xhr.upload.onprogress=ev=>{if(ev.lengthComputable)onProgress(ev.loaded/ev.total);};xhr.onerror=()=>reject(new Error('上传网络失败'));xhr.ontimeout=()=>reject(new Error('上传超时，请重试'));xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('上传失败：'+xhr.status));xhr.send(blob);});
}
async function run(generate){
  if(busy)return;if(!files.length)return error('请先选择供应商资料');
  const selected=internalFiles.filter(x=>x.selected);const taskFiles=[...files,...selected.map(x=>x.file)];const roles=[...files.map(()=>'supplier'),...selected.map(()=>'internal')];
  try{if(taskFiles.length>6)throw new Error('两类资料合计最多 6 份，请在内部经营数据页取消勾选部分文件。');validateFiles(taskFiles,config.maxFileMB,config.maxTotalMB);}catch(err){return error(err.message);}
  sourceFiles=taskFiles;const context={market:document.querySelector('#market').value.trim(),purpose:document.querySelector('#purpose').value,focus:document.querySelector('#focus').value.trim(),searchKeyword:document.querySelector('#searchKeyword').value.trim()};if(!context.market)return error('请填写目标市场');const invite=document.querySelector('#invite')?.value||'';document.querySelector('#error').hidden=true;lock(true);
  try{
    progress('准备解析供应商与内部资料…',5);const {extractFiles}=await import('./extract.js');manifest=await extractFiles(taskFiles,config.maxPages,text=>progress(text,22));
    renderPreview();if(!generate){progress(`解析完成 · ${manifest.pages.length} 页 / 片段，可打开每页查看来源。`,100);return;}
    progress('创建评审任务…',35);job=await api('create',{body:{invite,context,files:taskFiles.map(({name,size,type},i)=>({name,size,type,role:roles[i]}))},id:null,token:null});localStorage.setItem('purchase-review-job',JSON.stringify({id:job.id,token:job.token}));
    for(let i=0;i<taskFiles.length;i++)await upload(taskFiles[i],job.targets[i],job.token,n=>progress(`上传${roles[i]==='internal'?'内部':'供应商'}资料 ${i+1} / ${taskFiles.length} · ${Math.round(n*100)}%`,35+25*(i+n)/taskFiles.length));
    await upload(new Blob([JSON.stringify(manifest)],{type:'application/json'}),job.manifestTarget,job.token,n=>progress('保存页面与证据来源…',60+10*n));
    progress(config.aiReady?'正在阅读资料并生成报告，请保持页面打开…':'正在生成基础资料整理报告…',78);const result=await api('generate',{body:{}});report=result.report;showReport(report);
  }catch(err){error(err.message);const p=document.querySelector('#progress-text');if(p)p.textContent='本次操作未完成。已完成的报告不会被覆盖。';}finally{lock(false);}
}
function renderPreview(){document.querySelector('#page-preview').innerHTML=`<div class="preview-heading"><h2>解析来源 <span>${manifest.pages.length} 页 / 片段</span></h2><p>图像已缩小；点击页面查看文字、图像与解析限制。</p></div><div class="preview-grid">${manifest.pages.map((p,i)=>`<button class="page-thumb" data-preview="${i}">${p.images[0]?`<img src="${p.images[0]}" alt="${e(p.label)}" loading="lazy">`:'<span class="text-page">Aa</span>'}<span>文件 ${p.file+1} · ${e(p.label)}</span></button>`).join('')}</div>`;document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>openSource(manifest.pages[+b.dataset.preview]));}
function openSource(page){const content=document.querySelector('#source-content');content.innerHTML=`<div class="eyebrow">来源预览</div><h2>${e(sourceFiles[page.file]?.name||report?.files?.[page.file]?.name||'来源')} · ${e(page.label)}</h2>${page.limitations.map(x=>`<p class="source-warning">${e(x)}</p>`).join('')}${page.images.map(src=>`<img class="source-image" src="${src}" alt="来源页面">`).join('')}${page.text?`<h3>提取文字</h3><pre>${e(page.text)}</pre>`:'<p>此页没有可提取文字，需结合页面图像阅读。</p>'}`;openPanel('source-dialog');}
async function resume(){job=getSaved();if(!job)return;try{const result=await api('job');if(result.report){report=result.report;showReport(report);return;}if(result.status==='uploading')return error('上次文件未完整上传。请重新选择文件生成新任务。');if(result.status==='analyzing')return error('任务正在分析。请稍后再恢复；异常中断的任务在 10 分钟后可重试。');progress('恢复上次任务…',70);lock(true);const done=await api('generate',{body:{}});report=done.report;showReport(report);}catch(err){error(err.message);}finally{lock(false);}}
function showReport(r,{shared=false,sample=false,audience='internal'}={}){
  const displayed=audience==='supplier'?supplierSnapshot(r):r;const supplier=displayed.mode==='supplier';
  report=r;const back=shared?'<a href="/">体验资料评审 ↗</a>':'<a href="/">← 返回工作台</a>';
  shell(`<div class="report-toolbar"><div class="audience-tabs" role="group" aria-label="报告受众">${!shared?`<button data-audience="internal" class="${!supplier?'active':''}" aria-pressed="${!supplier}">内部评审</button><button data-audience="supplier" class="${supplier?'active':''}" aria-pressed="${supplier}">供应商反馈</button>`:back}</div><div><button id="export" class="secondary">下载 HTML</button><button id="print" class="secondary">保存 PDF</button>${!shared?'<button id="share" class="primary">分享报告 ↗</button>':''}</div></div><main class="report-wrap" id="report-top">${sample?'<div class="sample-notice">真实附件案例 · 预先审阅并保存；不是本次在线即时生成。<a href="/">上传自己的文件 →</a></div>':''}${shared?'<div class="sample-notice">你正在查看独立分享的报告；原始附件未公开。</div>':''}${reportHTML(displayed,{interactive:!shared})}${!shared&&!sample&&!supplier?marketEditor(r.marketComparison):''}</main><section id="share-dialog" class="flow-panel share-panel" aria-label="分享报告" hidden><div class="panel-toolbar"><button class="close" id="share-close" aria-label="关闭">← 返回报告</button></div><div class="eyebrow">分享这份报告</div><h2>选择给对方看的内容</h2><p>评审报告包含当前结论、证据及文件名称；供应商版只包含通用补件要求。</p><label><input type="radio" name="audience" value="review"> 内部完整报告（含内部评估，请确认接收人）</label><label><input type="radio" name="audience" value="supplier" checked> 供应商补件清单</label><button id="create-share" class="primary">${sample?'复制案例链接':'创建分享链接'}</button><p id="share-status" role="status"></p><input id="share-link" readonly hidden aria-label="分享链接">${!sample?'<button id="revoke" class="text-button">撤销已有分享</button>':''}</section>`,{reportView:true,supplier});
  const saveMarket=async(body)=>{
    const status=document.querySelector('#market-status');status.textContent=body.keyword?'正在检索公开产品线索，请稍候…':'正在保存报价…';
    const controls=[...document.querySelectorAll('.market-editor button')];controls.forEach(b=>b.disabled=true);
    try{const result=await api('market',{body});showReport(result.report,{shared,sample,audience});document.querySelector('#market-status').textContent=body.keyword?'检索已结束，结果和限制见上方对照表。':'已保存，内部对比表已更新。';}
    catch(err){status.textContent=err.message;}finally{controls.forEach(b=>b.disabled=false);}
  };
  for(const kind of ['search','baseline','offer','sources'])document.querySelector('#market-'+kind)?.addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
    if(kind==='sources')return saveMarket({sourceUrls:data.sourceUrls.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)});
    if(kind==='search')return saveMarket({keyword:data.keyword});
    for(const key of ['price','quantity','moq'])if(key in data)data[key]=Number(data[key]);
    data.taxShippingIncluded=form.elements.taxShippingIncluded.checked;
    if(kind==='baseline')return saveMarket({baseline:data});
    data.sameSpecification=form.elements.sameSpecification.checked;
    return saveMarket({offers:[...(r.marketComparison?.offers||[]),data]});
  });
  document.querySelectorAll('[data-remove-offer]').forEach(button=>button.onclick=()=>saveMarket({offers:(r.marketComparison?.offers||[]).filter((_,i)=>i!==Number(button.dataset.removeOffer))}));
  document.querySelectorAll('[data-audience]').forEach(button=>button.onclick=()=>showReport(r,{shared,sample,audience:button.dataset.audience}));
  document.querySelectorAll('a[href="#evidence"]').forEach(a=>a.addEventListener('click',()=>{const appendix=document.querySelector('.report-appendix');if(appendix)appendix.open=true;}));
  document.querySelector('#export').onclick=()=>downloadReport(displayed,css);document.querySelector('#print').onclick=()=>window.print();
  document.querySelectorAll('button.citation').forEach(b=>b.onclick=()=>{
    if(sample){const p=+b.dataset.page;if([1,4,22,30].includes(p)){document.querySelector('#source-content').innerHTML=`<div class="eyebrow">Warmies 原始品牌册</div><h2>第 ${p} 页</h2><img class="source-image" src="/demo-assets/page-${p}.jpg" alt="品牌册第 ${p} 页"><p>页面中的陈述属于供应商资料，并未独立验证。</p>`;openPanel('source-dialog');}else notify('此页未包含在公开案例预览中。');}
    else {const p=manifest?.pages.find(p=>p.file===+b.dataset.source&&p.page===+b.dataset.page);if(p)openSource(p);else notify('原文件未公开；如需逐页预览，请回到上传本文件的原会话。');}
  });
  document.querySelector('#share')?.addEventListener('click',()=>openPanel('share-dialog'));document.querySelector('#share-close').onclick=closePanel;
  document.querySelector('#create-share').onclick=async()=>{
    const status=document.querySelector('#share-status');const audience=document.querySelector('[name=audience]:checked').value;
    try{let url;if(sample){url=location.origin+'/example/warmies'+(audience==='supplier'?'?audience=supplier':'');status.textContent='案例链接长期可读。';}else{const result=await api('share',{body:{audience}});url=location.origin+result.path;status.textContent=`链接有效至 ${new Date(result.expiresAt).toLocaleDateString('zh-CN')}。${result.local?'当前是本机地址，外部访问需部署到云端。':''}`;}
      const field=document.querySelector('#share-link');field.value=url;field.hidden=false;try{await navigator.clipboard.writeText(url);status.textContent+=' 已复制。';}catch{field.select();status.textContent+=' 请复制下方链接。';}
    }catch(err){status.textContent=err.message;}
  };
  document.querySelector('#revoke')?.addEventListener('click',async()=>{try{await api('revoke',{body:{}});document.querySelector('#share-status').textContent='已有分享已撤销。';document.querySelector('#share-link').hidden=true;}catch(err){document.querySelector('#share-status').textContent=err.message;}});
  window.scrollTo(0,0);
}
async function boot(){
  if(location.pathname==='/example/warmies'){const r=new URLSearchParams(location.search).get('audience')==='supplier'?supplierSnapshot(warmiesReport):warmiesReport;return showReport(r,{sample:true,shared:r.mode==='supplier'});}
  if(location.pathname==='/share'){
    shell('<main class="empty-state"><h1>正在读取分享报告…</h1></main>');try{const token=location.hash.slice(1);const response=await fetch('/api/index?action=shared&token='+encodeURIComponent(token));const result=await response.json();if(!response.ok)throw new Error(result.error);showReport(result.report,{shared:true});}catch(err){shell(`<main class="empty-state"><h1>报告无法打开</h1><p>${e(err.message)}</p><a href="/">返回工作台</a></main>`);}return;
  }
  try{config=await api('config',{id:null,token:null});}catch{config.ready=false;}
  try{internalStore=await import('./internal-data.js');internalFiles=await internalStore.listInternal();}catch{storageError='浏览器资料存储不可用，请允许网站保存数据后重试。';}
  workspaceLoaded=true;location.pathname==='/internal-data'?internalPage():home();
}
function renderInternalSummary(){
  const selected=internalFiles.filter(x=>x.selected);
  document.querySelector('#internal-summary').innerHTML=`<div><strong>本次内部经营数据 · ${selected.length} 份</strong><p>${selected.length?selected.map(x=>e(x.file.name)).join('、'):'尚未选择。添加现有 SKU、库存与销量，才能比较新品对现有商品的影响。'}</p></div><a href="/internal-data">管理资料 →</a>`;
}
function internalPage(){
  shell(`<main class="workspace internal-workspace"><section class="work-panel"><div class="eyebrow">内部经营数据 <span>02 / BUSINESS DATA</span></div><h1>让采购判断有经营依据</h1><p class="intro">添加现有 SKU、库存、销量与成本；勾选要用于本次评审的资料。</p>
  <div class="internal-local-note"><strong>保存在当前浏览器</strong><p>刷新后仍可复用，不会同步到其他设备。生成评审时，所选资料会上传至私有存储并用于模型分析。移除这里只清除浏览器副本，不删除历史任务。</p></div>
  <div class="dropzone" id="internal-dropzone" role="button" tabindex="0" aria-label="选择内部经营数据"><span class="upload-symbol">↥</span><h2>上传内部经营数据</h2><p>Excel (.xlsx / .xls) · CSV · PDF · DOCX · TXT · 图片</p><small>单个 ≤ ${config.maxFileMB} MB · 与供应商资料合计 ≤ ${config.maxTotalMB} MB / 6 份</small><input id="internal-input" type="file" multiple hidden accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.ppt,.pptx"></div>
  <p class="format-note">CSV 使用 UTF-8 编码。Excel 读取已保存的单元格值；公式请先重算并保存。上传后可预览工作表与行号。</p>
  <div id="error" class="error" role="alert" hidden></div><div id="progress" class="progress" hidden><div class="progress-track"><span id="progress-fill"></span></div><p id="progress-text" aria-live="polite"></p></div>
  <div class="internal-list-heading"><h2>我的内部资料</h2><span id="internal-count"></span></div><div id="internal-list"></div>
  <div class="actions"><a class="primary" href="/">返回供应商资料，开始评审 ↗</a></div><div id="page-preview"></div></section>
  <aside class="example-panel template-panel"><div class="eyebrow">从现有 SKU 开始 <span>TEMPLATE</span></div><h2>一行一个 SKU，<br>补齐采购对比依据。</h2><p>下载空白模板，填入真实数据。未知留空，只有确实没有时才填 0。</p><div class="template-downloads"><a class="primary" href="/templates/sku-template.xlsx" download>下载 Excel 模板 ↓</a><a class="secondary" href="/templates/sku-template.csv" download>下载 CSV 模板 ↓</a></div><dl class="template-fields"><dt>商品与定位</dt><dd>SKU、名称、品类、规格、用途</dd><dt>库存与销量</dt><dd>统计周期、可用库存、在途、销量、补货</dd><dt>价格与成本</dt><dd>币种、税费口径、售价、采购及到货成本</dd><dt>补货与履约</dt><dd>交期、订单承诺、补货能否取消、季节性</dd></dl><p class="privacy-note">内部数据用于内部评审。供应商反馈版仅提供独立补件清单，不包含成本、库存或原附件。</p></aside></main>`,{internalView:true});
  const input=document.querySelector('#internal-input'),drop=document.querySelector('#internal-dropzone');
  drop.onclick=ev=>{if(ev.target!==input&&!busy)input.click();};drop.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();if(!busy)input.click();}};
  input.onchange=()=>addInternal([...input.files]);drop.ondragover=ev=>{ev.preventDefault();drop.classList.add('dragover');};drop.ondragleave=()=>drop.classList.remove('dragover');drop.ondrop=ev=>{ev.preventDefault();drop.classList.remove('dragover');addInternal([...ev.dataTransfer.files]);};
  renderInternalFiles();if(storageError)error(storageError);
}
async function addInternal(incoming){
  if(busy||!incoming.length)return;
  if(!internalStore||storageError)return error(storageError||'浏览器资料存储不可用。');
  lock(true);
  try{
    validateFiles(incoming,config.maxFileMB,config.maxTotalMB);
    const {extractFiles}=await import('./extract.js');const added=[];
    for(const file of incoming){
      if(!file.size)throw new Error('不能上传空文件');if(file.name.length>180)throw new Error('文件名过长，请缩短后上传。');
      progress(`正在检查 ${file.name}…`,20);
      const parsed=await extractFiles([file],config.maxPages,text=>progress(text,40));
      added.push({id:crypto.randomUUID(),file,selected:true,updatedAt:new Date().toISOString(),pages:parsed.pages.length});
    }
    await internalStore.saveInternal(added);internalFiles=await internalStore.listInternal();manifest=null;
    document.querySelector('#error').hidden=true;renderInternalFiles();progress(`已保存 ${added.length} 份内部资料，可在后续评审中复用。`,100);
  }catch(err){error(err.message);}finally{lock(false);}
}
function renderInternalFiles(){
  document.querySelector('#internal-count').textContent=`${internalFiles.length} 份资料 · 已选 ${internalFiles.filter(x=>x.selected).length} 份`;
  document.querySelector('#internal-list').innerHTML=internalFiles.length?internalFiles.map(item=>`<div class="file-row internal-file-row"><label class="internal-select"><input type="checkbox" data-select-internal="${item.id}" ${item.selected?'checked':''} aria-label="用于评审：${e(item.file.name)}"><span>用于评审</span></label><div><strong>${e(item.file.name)}</strong><small>${size(item.file.size)} · ${item.pages} 页 / 片段 · ${e(new Date(item.updatedAt).toLocaleDateString('zh-CN'))}</small></div><button class="internal-file-action" data-preview-internal="${item.id}">预览</button><button class="internal-file-action" data-remove-internal="${item.id}" aria-label="移除内部资料：${e(item.file.name)}">移除</button></div>`).join(''):'<p class="internal-empty">还没有内部经营数据。上传现有表格，或先下载右侧 SKU 模板。</p>';
  document.querySelectorAll('[data-select-internal]').forEach(input=>input.onchange=async()=>{
    if(busy)return;lock(true);const item=internalFiles.find(x=>x.id===input.dataset.selectInternal);
    try{await internalStore.saveInternal([{...item,selected:input.checked}]);internalFiles=await internalStore.listInternal();manifest=null;}catch(err){error(err.message);}finally{renderInternalFiles();lock(false);}
  });
  document.querySelectorAll('[data-remove-internal]').forEach(button=>button.onclick=async()=>{
    if(busy)return;lock(true);
    try{await internalStore.removeInternal(button.dataset.removeInternal);internalFiles=await internalStore.listInternal();manifest=null;document.querySelector('#page-preview').innerHTML='';}catch(err){error(err.message);}finally{renderInternalFiles();lock(false);}
  });
  document.querySelectorAll('[data-preview-internal]').forEach(button=>button.onclick=async()=>{
    if(busy)return;lock(true);
    try{const item=internalFiles.find(x=>x.id===button.dataset.previewInternal);sourceFiles=[item.file];const {extractFiles}=await import('./extract.js');manifest=await extractFiles(sourceFiles,config.maxPages,text=>progress(text,45));renderPreview();progress('解析完成，点击片段查看工作表与行列内容。',100);document.querySelector('#page-preview').scrollIntoView({behavior:'smooth',block:'start'});}catch(err){error(err.message);}finally{lock(false);}
  });
}
function navigate(path){if(busy){notify('正在处理资料，请完成后再切换页面。');return;}history.pushState({},'',path);if(!workspaceLoaded){boot();return;}path==='/internal-data'?internalPage():home();window.scrollTo(0,0);}
document.addEventListener('click',event=>{const a=event.target.closest('a');if(!a||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;const href=a.getAttribute('href');if(href==='/'||href==='/internal-data'){event.preventDefault();navigate(href);}});
window.addEventListener('popstate',()=>{if(busy){history.pushState({},'',document.querySelector('#internal-input')?'/internal-data':'/');notify('正在处理资料，请完成后再切换页面。');return;}if(!workspaceLoaded)return boot();location.pathname==='/internal-data'?internalPage():location.pathname==='/'?home():boot();});
boot();
