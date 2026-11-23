import {readHistory,remember,saveSnapshot,getSnapshot} from './history.js';
import {durableFile} from './file-copy.js';
import {historyLogin,historyPanel,historyRows,internalLibrary,libraryHeader} from './library-views.js';
import {fileMessage,serviceMessage,responseData} from './user-messages.js';
import {marketEditor} from './market-report.js';
import {marketProducts} from '../lib/market.mjs';
import {viewEvidence,withEmbeddedEvidence,printReport} from './price-evidence.js';
import {DEMOS,demoCSV,demoSupplier,demoSelection} from './demo-data.js';
import './style.css';
import './report-workspace.css';
import './internal-editorial.css';
import './supplier-report.css';
import './report-reader.css';
import './workspace-shell.css';
import './workbench-home.css';
import './workspace-library.css';
import './workspace-reader.css';
import {workspaceIcon,workspaceMark} from './workspace-icons.js';
import {workspaceFrame,bindWorkspaceNavigation,resetWorkspaceNavigation,refreshWorkspaceIdentity,recordWorkspaceVisit} from './workspace-nav.js';
import {openPanel, closePanel, resetPanels} from './panels.js';
import baseCSS from './style.css?raw';
import reportCSS from './report-workspace.css?raw';
import internalCSS from './internal-editorial.css?raw';
import supplierCSS from './supplier-report.css?raw';
import readerCSS from './report-reader.css?raw';
import workspaceReaderCSS from './workspace-reader.css?raw';
const css=[baseCSS,reportCSS,internalCSS,supplierCSS,readerCSS,workspaceReaderCSS].join('\n');
import {warmiesReport} from './sample.js';
import {escape as e,reportHTML,downloadReport} from './report.js';
import {supplierSnapshot,validateFiles} from '../lib/contracts.mjs';
const app=document.querySelector('#app');
let config={maxFileMB:50,maxTotalMB:100,maxPages:80,ready:false,aiReady:false};
let files=[],manifest=null,job=null,report=null,busy=false,sourceURLs=[];
const getSaved=()=>{try{return JSON.parse(localStorage.getItem('purchase-review-job'));}catch{return null;}};
const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.ceil(n/1024)+' KB';
async function api(action,{body,method=body?'POST':'GET',id=job?.id,token=job?.token}={}){
  const headers={};
  if(body)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  let response;
  try{
    response=await fetch(`/api/index?action=${action}${id?'&id='+encodeURIComponent(id):''}`,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  }catch{
    throw new Error('连接中断，请检查网络后重试。');
  }
  return responseData(response,action);
}
let internalFiles=[],internalStore,storageError='',sourceFiles=[],workspaceLoaded=false;
const draft={market:'中国',purpose:'转售商品',focus:'',invite:'',searchKeyword:''};
let stopReportTracking, toolbarObserver;
let recentReports=[], recentRequest, navRevision=0;
function syncWorkspaceNavigation(){
  refreshWorkspaceIdentity(app,config.workspaceSignedIn,cloudHistory.length?cloudHistory:recentReports);
}
document.addEventListener('workspace-history-changed',()=>{
  navRevision++;recentRequest=null;recentReports=config.workspaceSignedIn?cloudHistory:[];
  syncWorkspaceNavigation();
});
function loadRecentReports(){
  syncWorkspaceNavigation();
  if(!config.workspaceSignedIn||location.pathname==='/history'||!app.querySelector('[data-nav-recents]')||recentRequest||cloudHistory.length||recentReports.length)return;
  const revision=navRevision;
  recentRequest=fetch('/api/index?action=history&offset=0').then(async response=>{
    if(!response.ok)return;
    const data=await response.json();
    if(revision!==navRevision||!config.workspaceSignedIn||!Array.isArray(data.items))return;
    recentReports=data.items;syncWorkspaceNavigation();
  }).catch(()=>{}).finally(()=>{if(revision===navRevision)recentRequest=null;});
}
function shell(content,{reportView=false,supplier=false,internalView=false,shared=false}={}){
  stopReportTracking?.();stopReportTracking=null;resetWorkspaceNavigation();resetPanels();
  toolbarObserver?.disconnect();
  toolbarObserver=null;
  document.documentElement.style.removeProperty('--report-toolbar-height');
  app.classList.toggle('report-view',reportView);
  app.classList.toggle('desk-shell',!shared);
  app.classList.toggle('shared-reader',shared);
  const historyPage=location.pathname==='/history';
  const pageName=internalView?'内部经营数据':historyPage?'历史报告':'新建评审';
  const title=reportView?(supplier?'供应商反馈报告':'采购评审报告'):(shared?'分享报告':pageName);
  document.title=title+' · 选品有据';
  if(shared){
    app.innerHTML=content+'<div id="toast" role="status"></div>';
    return;
  }
  let chapterLinks='';
  if(reportView){
    const chapters=supplier ? [
      ['supplier-overview','合作建议'],['supplier-price','报价摘要'],['supplier-products','逐款产品建议'],
      ['supplier-samples','规格与样品'],['supplier-reply','资料与后续安排']
    ] : [
      ['overview','决策总览'],['priorities','关键问题'],['price','报价摘要'],['candidates','候选产品'],
      ['highlights','合作机会'],['market-comparison','相似产品比价'],['portfolio','现有商品影响'],
      ['requirements','补充资料'],['actions','推进步骤'],['evidence','详细依据'],['scoring','评分说明']
    ];
    chapterLinks=chapters.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('');
  }
  const frame=workspaceFrame({pageName,reportView,internalView,historyPage,chapterLinks});
  app.innerHTML=frame+content+'<div id="toast" role="status"></div><section id="source-dialog" class="flow-panel source-panel" aria-label="来源预览" hidden><div class="panel-toolbar"><button class="close" aria-label="关闭来源">← 返回报告 / 工作台</button><span>来源预览 · 向下滚动查看完整内容</span></div><div id="source-content"></div></section>';
  app.querySelector('#source-dialog .close').onclick=closePanel;
  for(const a of app.querySelectorAll('.report-nav a,.reader-menu nav a'))if(!document.getElementById(a.hash.slice(1)))a.remove();
  const menu=app.querySelector('.reader-menu');
  menu?.addEventListener('click',event=>{if(event.target.closest('a'))menu.open=false;});
  menu?.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}
  });
  bindWorkspaceNavigation(app);loadRecentReports();
  const nav=app.querySelector('.report-nav');
  if(nav)stopReportTracking=trackReportSection(nav);
}
function trackReportSection(nav){
  const sections=[...nav.querySelectorAll('a')].map(link=>({link,target:document.getElementById(link.hash.slice(1))}));
  let frame=0;
  function update(){
    frame=0;
    if(!nav.getClientRects().length||!sections.length)return;
    let selected=sections[0];
    if(window.scrollY>1){
      const inset=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
      for(const section of sections){
        if(section.target.parentElement.closest('details:not([open])')||!section.target.getClientRects().length)continue;
        const margin=parseFloat(getComputedStyle(section.target).scrollMarginTop)||0;
        if(section.target.getBoundingClientRect().top<=inset+margin+2)selected=section;
      }
      // Near the footer an anchor can be visible without reaching its normal scroll inset.
      if(window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-2){
        const focused=sections.find(section=>section.target===document.activeElement);
        if(focused){
          const top=focused.target.getBoundingClientRect().top;
          if(top>=0&&top<window.innerHeight)selected=focused;
        }
      }
    }
    for(const section of sections){
      if(section===selected)section.link.setAttribute('aria-current','location');
      else section.link.removeAttribute('aria-current');
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  app.addEventListener('toggle',schedule,true);
  update();
  return ()=>{
    window.removeEventListener('scroll',schedule);
    window.removeEventListener('resize',schedule);
    app.removeEventListener('toggle',schedule,true);
    cancelAnimationFrame(frame);
  };
}
function notify(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');setTimeout(()=>el.classList.remove('visible'),4500);}
function error(text){const el=document.querySelector('#error');if(el){el.hidden=false;el.textContent=text;}else notify(text);}
function home(){
  shell(`<main class="procurement-home">
    <header class="wb-hero">
      <img class="wb-hero-photo" src="/workspace-assets/trade-port.webp" alt="" fetchpriority="high">
      <div class="wb-hero-copy">
        <h1>新建采购评审</h1>
        <p>汇总供应商资料与报价，评估产品、价格和采购风险。</p>
        ${getSaved()?'<button id="resume" class="wb-resume" type="button">恢复上次任务 <span aria-hidden="true">→</span></button>':''}
      </div>
    </header>

    <div class="wb-layout">
      <section class="wb-sources wb-card" aria-labelledby="wb-sources-title">
        <header class="wb-section-heading"><h2 id="wb-sources-title">供应商资料</h2></header>
        <div class="wb-drop" id="dropzone" tabindex="0" role="button" aria-label="选择供应商资料" aria-describedby="wb-formats wb-limits">
          <span class="wb-upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m-4 4 4-4 4 4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg></span>
          <strong>将文件拖到这里，或<span>选择文件</span></strong>
          <p id="wb-formats">Excel、CSV、PDF、PPT、图片、DOCX、TXT</p>
          <input id="file-input" type="file" multiple hidden accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.docx,.txt,.xlsx,.xls,.csv">
        </div>
        <p id="wb-limits" class="wb-limits">单份 ≤ ${config.maxFileMB} MB，合计 ≤ ${config.maxTotalMB} MB。含内部资料最多 6 份、${config.maxPages} 页。CSV 请使用 UTF-8。</p>
        <div id="file-list" aria-live="polite"></div>
        <div id="internal-summary" class="internal-summary"></div>
      </section>

      <section class="wb-settings wb-card" aria-labelledby="wb-settings-title">
        <header class="wb-section-heading"><h2 id="wb-settings-title">评审设置</h2></header>
        <div class="wb-field-pair">
          <label>目标市场<input id="market" value="中国" maxlength="80"></label>
          <label>采购用途<select id="purpose"><option>转售商品</option><option>自用设备 / 软件</option><option>原料 / 耗材</option></select></label>
        </div>
        <details class="wb-optional" ${draft.focus||draft.searchKeyword?'open':''}>
          <summary>更多评审要求 <span>选填</span></summary>
          <div class="wb-extra-fields">
            <label>相似产品检索词<input id="searchKeyword" maxlength="100" placeholder="默认使用产品名称" aria-describedby="wb-search-note"></label>
            <p id="wb-search-note" class="wb-note">${config.marketReady?'用于自动查找淘宝和 1688 相似商品。':'可在报告中前往淘宝和 1688 核对。'}只填写可公开搜索的商品信息。</p>
            <label>重点关注<textarea id="focus" maxlength="1000" placeholder="例如，与现有 SKU 的重叠、价格空间或退出条件。"></textarea></label>
          </div>
        </details>
        ${config.requiresInvite&&!config.workspaceSignedIn?'<label class="wb-invite">体验邀请码<input id="invite" type="password" autocomplete="off" placeholder="输入邀请方提供的邀请码"></label>':''}
        ${!config.aiReady?'<p class="wb-mode">当前为基础资料整理模式，将输出文件摘录和待确认清单。</p>':''}
        <div id="error" class="error" role="alert" hidden></div>
        <div id="progress" class="progress" hidden><div class="progress-track"><span id="progress-fill"></span></div><p id="progress-text" aria-live="polite"></p></div>
        <div class="wb-actions">
          <button id="generate" class="primary" type="button" ${!config.ready?'disabled':''}>${config.aiReady?'生成采购初筛报告':'生成资料整理报告'} <span aria-hidden="true">→</span></button>
          <button id="preview" class="secondary" type="button">预览文件内容</button>
        </div>
        ${!config.ready?'<p class="setup-note">暂时无法生成新报告。可预览所选文件，或查看下方案例。</p>':''}
        <p class="wb-save">${config.workspaceSignedIn?'报告保存至当前采购工作区。<a href="/history">查看历史报告</a>':config.workspaceReady?'需要跨设备查看报告？<a href="/history">登录工作区</a>':'可在当前浏览器恢复上次评审。'}</p>
        <details class="wb-privacy"><summary>资料使用说明</summary><p>原文件及解析内容将保存至${config.storage==='supabase'?'私有云存储':'本机'}${config.aiReady?'，并提交给 AI 服务分析':''}。${config.marketReady?'供应商产品名称或检索词将提交给搜索服务。':''}分享链接仅展示报告。</p></details>
      </section>

      <aside class="wb-example wb-card" aria-label="采购评审示例">
        <a class="wb-example-link" href="/example/warmies">
          <span class="wb-example-image"><img src="/demo-assets/penguin.png" alt="" width="59" height="65"></span>
          <span class="wb-example-copy"><small>报告示例</small><strong>Warmies 品牌采购评审</strong><span>47 页品牌册 · 2 款候选产品</span></span>
          <span class="wb-example-arrow" aria-hidden="true">↗</span>
        </a>
        ${config.storage==='local'?'<button id="use-warmies" class="wb-example-try" type="button">使用案例 PDF 体验上传 <span aria-hidden="true">→</span></button>':''}
      </aside>
    </div>
    <div id="page-preview"></div>
  </main>`);
  const input=document.querySelector('#file-input'),drop=document.querySelector('#dropzone');
  drop.onclick=ev=>{if(ev.target!==input&&!busy)input.click();};drop.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();if(!busy)input.click();}};
  input.onchange=()=>{
    const selected=[...input.files];
    input.value='';
    if(selected.length)addFiles(selected);
  };
  drop.ondragover=ev=>{ev.preventDefault();drop.classList.add('dragover');};drop.ondragleave=()=>drop.classList.remove('dragover');drop.ondrop=ev=>{ev.preventDefault();drop.classList.remove('dragover');if(!busy)addFiles([...ev.dataTransfer.files]);};
  document.querySelector('#generate').onclick=()=>run(true);document.querySelector('#preview').onclick=()=>run(false);
  document.querySelector('#use-warmies')?.addEventListener('click',async()=>{if(busy)return;lock(true);progress('正在载入 Warmies 原始 PDF…',5);try{const response=await fetch('/local-fixture/warmies.pdf');if(!response.ok)throw new Error('本机未找到 Warmies 品牌册。可选择自己的文件，或直接查看案例报告。');const file=new File([await response.blob()],'Warmies-brand-book.pdf',{type:'application/pdf'});lock(false);addFiles([file]);progress('原文件已载入，可以开始解析。',0);}catch(err){error(fileMessage(err));}finally{lock(false);}});
  document.querySelector('#resume')?.addEventListener('click',resume);renderFiles();renderInternalSummary();
  for(const key of ['market','purpose','focus','invite','searchKeyword']){const el=document.getElementById(key);if(el){el.value=draft[key];el.addEventListener('input',()=>{draft[key]=el.value;});}}
  if(storageError)error(storageError);
}
async function addFiles(incoming){
  if(busy)return;const next=[...files,...incoming];
  try{if(next.length>6)throw new Error('供应商资料最多 6 份；生成时与内部资料合计最多 6 份。');validateFiles(next,config.maxFileMB,config.maxTotalMB);for(const f of next)if(!f.size)throw new Error('不能上传空文件');}
  catch(err){return error(fileMessage(err));}
  lock(true);try{files=await Promise.all(next.map(durableFile));}catch(err){error(fileMessage(err));return;}finally{lock(false);}manifest=null;job=null;sourceURLs.forEach(URL.revokeObjectURL);sourceURLs=[];document.querySelector('#error').hidden=true;document.querySelector('#page-preview').innerHTML='';renderFiles();
}
function renderFiles(){document.querySelector('#file-list').innerHTML=files.map((f,i)=>`<div class="file-row"><span class="file-type">${e(f.name.split('.').pop().toUpperCase())}</span><div><strong>${e(f.name)}</strong><small>${size(f.size)}</small></div><button data-remove="${i}" aria-label="移除 ${e(f.name)}" ${busy?'disabled':''}>×</button></div>`).join('');document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.remove,1);manifest=null;job=null;document.querySelector('#page-preview').innerHTML='';renderFiles();});}
function progress(text,percent){const p=document.querySelector('#progress');p.hidden=false;document.querySelector('#progress-text').textContent=text;document.querySelector('#progress-fill').style.width=percent+'%';}
function lock(value){busy=value;for(const el of document.querySelectorAll('input,select,textarea,#generate,#preview,#use-warmies,#resume,[data-remove],[data-preview-internal],[data-remove-internal]'))el.disabled=value||(!config.ready&&el.id==='generate');}
async function upload(blob,target,token,onProgress){
  if(!target.local&&blob.size>6*1048576){const {Upload}=await import('tus-js-client');return new Promise((resolve,reject)=>{const task=new Upload(blob,{endpoint:target.endpoint,headers:{'x-signature':target.token},uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,chunkSize:6*1048576,retryDelays:[0,1000,3000],metadata:{bucketName:target.bucket,objectName:target.path,contentType:blob.type||'application/octet-stream',cacheControl:'3600'},onError:()=>reject(new Error('文件上传中断，请检查网络后重新上传。')),onProgress:(a,b)=>onProgress(a/b),onSuccess:resolve});task.start();});}
  return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',target.url);if(target.local)xhr.setRequestHeader('Authorization','Bearer '+token);xhr.setRequestHeader('Content-Type',blob.type||'application/octet-stream');xhr.timeout=180000;xhr.upload.onprogress=ev=>{if(ev.lengthComputable)onProgress(ev.loaded/ev.total);};xhr.onerror=()=>reject(new Error('上传中断，请检查网络并重试。'));xhr.ontimeout=()=>reject(new Error('上传超时，请重试'));xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('文件上传失败，请重新选择文件后重试。'));xhr.send(blob);});
}
async function run(generate){
  let createdJob=false;
  if(busy)return;if(!files.length)return error('请先选择供应商资料');
  const selected=internalFiles.filter(x=>x.selected);const taskFiles=[...files,...selected.map(x=>x.file)];const roles=[...files.map(()=>'supplier'),...selected.map(()=>'internal')];
  try{if(taskFiles.length>6)throw new Error('两类资料合计最多 6 份，请在内部经营数据页取消勾选部分文件。');validateFiles(taskFiles,config.maxFileMB,config.maxTotalMB);}catch(err){return error(fileMessage(err));}
  sourceFiles=taskFiles;const context={market:document.querySelector('#market').value.trim(),purpose:document.querySelector('#purpose').value,focus:document.querySelector('#focus').value.trim(),searchKeyword:document.querySelector('#searchKeyword').value.trim()};if(!context.market)return error('请填写目标市场');const invite=document.querySelector('#invite')?.value||'';document.querySelector('#error').hidden=true;lock(true);
  try{
    progress('正在读取本次评审资料…',5);const {extractFiles}=await import('./extract.js');manifest=await extractFiles(taskFiles,config.maxPages,text=>progress(text,22));
    renderPreview();if(!generate){progress(`解析完成 · ${manifest.pages.length} 页 / 片段，可打开每页查看来源。`,100);return;}
    progress('创建评审任务…',35);job=await api('create',{body:{invite,context,files:taskFiles.map(({name,size,type},i)=>({name,size,type,role:roles[i]}))},id:null,token:null});createdJob=true;remember({...job,title:taskFiles.filter((_,i)=>roles[i]==='supplier').map(f=>f.name).join('、'),createdAt:new Date().toISOString(),status:'uploading',targets:undefined,manifestTarget:undefined});localStorage.setItem('purchase-review-job',JSON.stringify({id:job.id,token:job.token}));
    for(let i=0;i<taskFiles.length;i++)await upload(taskFiles[i],job.targets[i],job.token,n=>progress(`上传${roles[i]==='internal'?'内部':'供应商'}资料 ${i+1} / ${taskFiles.length} · ${Math.round(n*100)}%`,35+25*(i+n)/taskFiles.length));
    await upload(new Blob([JSON.stringify(manifest)],{type:'application/json'}),job.manifestTarget,job.token,n=>progress('保存页面与证据来源…',60+10*n));
    progress(config.aiReady?'正在阅读资料并生成报告，请保持页面打开…':'正在生成基础资料整理报告…',78);const result=await api('generate',{body:{}});report=result.report;showReport(report);
  }catch(err){const message=fileMessage(err);if(createdJob&&job?.id)remember({id:job.id,status:'failed',error:message});error(message);const p=document.querySelector('#progress-text');if(p)p.textContent='本次操作未完成。已完成的报告不会被覆盖。';}finally{lock(false);}
}
function renderPreview(){document.querySelector('#page-preview').innerHTML=`<div class="preview-heading"><h2>解析来源 <span>${manifest.pages.length} 页 / 片段</span></h2><p>点击预览，核对原文、图片及可能遗漏的内容。</p></div><div class="preview-grid">${manifest.pages.map((p,i)=>`<button class="page-thumb" data-preview="${i}">${p.images[0]?`<img src="${p.images[0]}" alt="${e(p.label)}" loading="lazy">`:'<span class="text-page">Aa</span>'}<span>文件 ${p.file+1} · ${e(p.label)}</span></button>`).join('')}</div>`;document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>openSource(manifest.pages[+b.dataset.preview]));}
function openSource(page){const content=document.querySelector('#source-content');content.innerHTML=`<div class="eyebrow">来源预览</div><h2>${e(sourceFiles[page.file]?.name||report?.files?.[page.file]?.name||'来源')} · ${e(page.label)}</h2>${page.limitations.map(x=>`<p class="source-warning">${e(x)}</p>`).join('')}${page.images.map(src=>`<img class="source-image" src="${src}" alt="来源页面">`).join('')}${page.text?`<h3>提取文字</h3><pre>${e(page.text)}</pre>`:'<p>此页没有可提取文字，需结合页面图像阅读。</p>'}`;openPanel('source-dialog');}
async function resume(){job=getSaved();if(!job)return;try{const result=await api('job');if(result.report){report=result.report;showReport(report);return;}if(result.status==='uploading')return error('上次文件未完整上传。请重新选择文件生成新任务。');if(result.status==='analyzing')return error('任务正在分析。请稍后再恢复；异常中断的任务在 10 分钟后可重试。');progress('恢复上次任务…',70);lock(true);const done=await api('generate',{body:{}});report=done.report;showReport(report);}catch(err){error(fileMessage(err));}finally{lock(false);}}
function showReport(r,{shared=false,sample=false,audience='internal'}={}){
  const displayed=audience==='supplier'?supplierSnapshot(r):r;const supplier=displayed.mode==='supplier';
  if(!shared&&!sample&&config.workspaceSignedIn&&job?.id){
    recordWorkspaceVisit(job.id);
    if(![...cloudHistory,...recentReports].some(entry=>entry.id===job.id)){
      // Ask the workspace for its current list after a newly generated report.
      // A report restored with a browser token may not belong to this workspace.
      navRevision++;recentRequest=null;cloudHistory=[];recentReports=[];
    }
  }
  if(!shared&&!sample&&job?.id){remember({id:job.id,token:job.token,status:'completed',createdAt:r.createdAt,title:r.files?.filter(f=>f.role!=='internal').map(f=>f.name).join('、')||'采购报告',error:null});saveSnapshot({id:job.id,report:r}).catch(()=>notify('报告已生成，当前浏览器未能保存离线副本。'));}report=r;
  const readerBrand=`<div class="reader-brand">${workspaceMark}<strong>选品有据</strong><span>${supplier?'供应商反馈':'内部评审'}</span></div>`;
  shell(`<div class="report-toolbar">${shared?readerBrand:`<div class="audience-tabs" role="group" aria-label="报告受众"><button data-audience="internal" class="${!supplier?'active':''}" aria-pressed="${!supplier}">内部评审</button><button data-audience="supplier" class="${supplier?'active':''}" aria-pressed="${supplier}">供应商反馈</button></div>`}<div class="reader-actions" role="group" aria-label="报告操作"><button id="export" class="secondary" aria-label="下载 HTML" title="下载 HTML">${workspaceIcon('download')}<span>下载 HTML</span></button><button id="print" class="secondary" aria-label="保存 PDF" title="保存 PDF">${workspaceIcon('print')}<span>保存 PDF</span></button>${!shared?`<button id="share" class="primary" aria-label="分享报告" title="分享报告">${workspaceIcon('share')}<span>分享报告</span></button>`:''}</div></div><main class="report-wrap" id="report-top">${sample?`<div class="sample-notice">案例报告依据 Warmies 品牌册整理。${shared?'':'<a href="/">上传自己的文件 →</a>'}</div>`:''}${shared?'<div class="sample-notice">分享版仅展示报告内容。如需原始附件，请联系分享人。</div>':''}${reportHTML(displayed,{interactive:!shared,marketEditable:!shared&&!sample&&!supplier})}${!shared&&!sample&&!supplier?marketEditor(r.marketComparison,marketProducts(r,r.files||[])):''}</main>${shared?'':`<section id="share-dialog" class="flow-panel share-panel" aria-label="分享报告" hidden><div class="panel-toolbar"><button class="close" id="share-close" aria-label="关闭">← 返回报告</button></div><div class="eyebrow">分享这份报告</div><h2>选择给对方看的内容</h2><p>内部报告含采购判断、经营数据（如有）和文件名称。与供应商沟通时，请选择供应商反馈。</p><label><input type="radio" name="audience" value="review"> 内部完整报告（含内部评估，请确认接收人）</label><label><input type="radio" name="audience" value="supplier" checked> 供应商反馈（拟供产品、待确认资料与后续安排）</label><button id="create-share" class="primary">${sample?'复制案例链接':'创建分享链接'}</button><p id="share-status" role="status"></p><input id="share-link" readonly hidden aria-label="分享链接">${!sample?'<button id="revoke" class="text-button">撤销已有分享</button>':''}</section>`}`,{reportView:true,supplier,shared});
  const saveMarket=async(body)=>{
    const refresh=Boolean(body.keyword||body.product)&&!body.sourceUrls&&!body.screenshot;
    const status=document.querySelector('#market-status');status.textContent=refresh?'正在检索并读取价格，请稍候…':body.screenshot?'正在识别截图价格，请稍候…':'正在保存报价…';
    const controls=[...document.querySelectorAll('.market-editor button,[data-refresh-product]')];controls.forEach(b=>b.disabled=true);
    const originalButton=controls.find(b=>b.dataset.refreshProduct===body.product);
    if(refresh&&originalButton)originalButton.textContent='正在检索…';
    try{const result=await api('market',{body});showReport(result.report,{shared,sample,audience});if(refresh&&body.product){const updated=Array.from(document.querySelectorAll('[data-refresh-product]')).find(b=>b.dataset.refreshProduct===body.product);updated?.closest('.market-sku')?.scrollIntoView({block:'start'});}
      document.querySelector('#market-status').textContent=refresh?'检索已结束，结果和限制见上方对照表。':'已保存，内部对比表已更新。';}
    catch(err){status.textContent=err.message;notify(err.message);}finally{controls.forEach(b=>b.disabled=false);if(originalButton?.isConnected)originalButton.textContent='更新这一款';}
  };
  document.querySelectorAll('[data-refresh-product]').forEach(b=>b.onclick=()=>saveMarket({product:b.dataset.refreshProduct}));
  for(const kind of ['search','baseline','offer','sources','screenshot'])document.querySelector('#market-'+kind)?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
    if(kind==='screenshot'){
      const status=document.querySelector('#market-status'),file=form.elements.image.files[0];
      if(!file)return;const button=form.querySelector('button');button.disabled=true;
      try{if(!/\.(png|jpe?g|webp)$/i.test(file.name))throw new Error('请选择PNG、JPEG或WebP截图');validateFiles([file],config.maxFileMB,config.maxTotalMB);const {extractFiles}=await import('./extract.js');const parsed=await extractFiles([file],1,()=>{});const image=parsed.pages[0]?.images[0];if(!image)throw new Error('未能读取截图');return await saveMarket({product:data.product,screenshot:{sourceURL:data.sourceURL,title:data.title,image}});}catch(err){status.textContent=fileMessage(err);}finally{button.disabled=false;}return;
    }
    if(kind==='sources')return saveMarket({product:data.product,sourceUrls:data.sourceUrls.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)});
    if(kind==='search')return saveMarket({product:data.product,...(data.keyword?.trim()?{keyword:data.keyword.trim()}:{})});
    for(const key of ['price','quantity','moq'])if(key in data)data[key]=Number(data[key]);
    data.taxShippingIncluded=form.elements.taxShippingIncluded.checked;
    if(kind==='baseline')return saveMarket({baseline:data});
    data.sameSpecification=form.elements.sameSpecification.checked;
    return saveMarket({offers:[...(r.marketComparison?.offers||[]),data]});
  });
  document.querySelectorAll('[data-remove-offer]').forEach(button=>button.onclick=()=>saveMarket({offers:(r.marketComparison?.offers||[]).filter((_,i)=>i!==Number(button.dataset.removeOffer))}));
  document.querySelectorAll('[data-audience]').forEach(button=>button.onclick=async()=>{
    const audience=button.dataset.audience;
    let updated=r;
    if(audience==='supplier'&&!sample&&config.aiReady&&r.supplierReview?.version!==3){
      button.disabled=true;button.textContent='正在生成供应商商务报告…';
      try{updated=(await api('supplier',{body:{}})).report;}
      catch(err){notify(err.message);button.disabled=false;button.textContent='供应商反馈';return;}
    }
    if(location.pathname==='/history'&&job?.id){
      const url=new URL(location.href);
      if(audience==='supplier')url.searchParams.set('audience','supplier');
      else url.searchParams.delete('audience');
      url.hash='';history.replaceState(history.state,'',url);
    }
    showReport(updated,{shared,sample,audience});
  });
  for(const a of app.querySelectorAll('a[href^="#"]')){
    const fragment=a.hash.slice(1),listing=a.classList.contains('listing-link');
    if(listing&&shared&&location.pathname==='/share'){
      const url=new URL(location.href);url.searchParams.set('listing',fragment);a.href=url.href;
    }else if(listing&&!shared&&job?.id&&config.workspaceSignedIn){
      a.href='/history?report='+encodeURIComponent(job.id)+'#'+fragment;
    }
    a.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const target=document.getElementById(fragment);
    if(!target)return;
    event.preventDefault();
    if(listing){if(a.href!==location.href)history.pushState(history.state,'',a.href);}
    else if(location.pathname==='/share'&&new URLSearchParams(location.search).has('listing')){
      const url=new URL(location.href);url.searchParams.delete('listing');history.pushState(history.state,'',url);
    }else if(location.hash.startsWith('#listing-'))history.pushState(history.state,'','#'+fragment);
    else if(location.pathname==='/example/warmies'||location.pathname==='/history')history.replaceState(history.state,'','#'+fragment);
    revealSection(target);
    });
  }
  const proofContext={id:job?.id,token:job?.token,share:shared&&location.pathname==='/share'?location.hash.slice(1):null};
  document.querySelectorAll('[data-price-proof]').forEach(button=>button.onclick=async()=>{
    try{await viewEvidence(button.dataset.priceProof,proofContext);}catch(err){notify(err.message);}
  });
  document.querySelector('#export').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{downloadReport(await withEmbeddedEvidence(displayed,proofContext),css);}catch(err){notify(err.message);}
    finally{button.disabled=false;}
  };
  document.querySelector('#print').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{await printReport(displayed,proofContext);}catch(err){notify(err.message);}
    finally{button.disabled=false;}
  };
  document.querySelectorAll('button.citation').forEach(b=>b.onclick=()=>{
    if(sample){const p=+b.dataset.page;if([1,4,22,30].includes(p)){document.querySelector('#source-content').innerHTML=`<div class="eyebrow">Warmies 原始品牌册</div><h2>第 ${p} 页</h2><img class="source-image" src="/demo-assets/page-${p}.jpg" alt="品牌册第 ${p} 页"><p>页面中的陈述属于供应商资料，并未独立验证。</p>`;openPanel('source-dialog');}else notify('此页未包含在公开案例预览中。');}
    else {const p=manifest?.pages.find(p=>p.file===+b.dataset.source&&p.page===+b.dataset.page);if(p)openSource(p);else notify('原文件未公开；如需逐页预览，请回到上传本文件的原会话。');}
  });
  document.querySelector('#share')?.addEventListener('click',()=>openPanel('share-dialog'));document.querySelector('#share-close')?.addEventListener('click',closePanel);
  document.querySelector('#create-share')?.addEventListener('click',async()=>{
    const status=document.querySelector('#share-status');const audience=document.querySelector('[name=audience]:checked').value;
    try{let url;if(sample){url=location.origin+'/example/warmies'+(audience==='supplier'?'?audience=supplier':'');status.textContent='案例链接长期可读。';}else{if(audience==='supplier'&&config.aiReady&&r.supplierReview?.version!==3){status.textContent='正在生成供应商产品商务报告…';const prepared=await api('supplier',{body:{}});r=prepared.report;}const result=await api('share',{body:{audience}});url=location.origin+result.path;status.textContent=`链接有效至 ${new Date(result.expiresAt).toLocaleDateString('zh-CN')}。${result.local?'本机运行时，请下载报告后发送给外部接收人。':''}`;}
      const field=document.querySelector('#share-link');field.value=url;field.hidden=false;try{await navigator.clipboard.writeText(url);status.textContent+=' 已复制。';}catch{field.select();status.textContent+=' 请复制下方链接。';}
    }catch(err){status.textContent=err.message;}
  });
  document.querySelector('#revoke')?.addEventListener('click',async()=>{try{await api('revoke',{body:{}});document.querySelector('#share-status').textContent='已有分享已撤销。';document.querySelector('#share-link').hidden=true;}catch(err){document.querySelector('#share-status').textContent=err.message;}});
  const toolbar = app.querySelector('.report-toolbar');
  const measureToolbar = () => document.documentElement.style.setProperty('--report-toolbar-height', toolbar.offsetHeight + 'px');
  measureToolbar();
  toolbarObserver = new ResizeObserver(measureToolbar);
  toolbarObserver.observe(toolbar, {box:'border-box'});
  const section=reportSectionFromURL();
  if(section)revealSection(section);else window.scrollTo(0,0);
}
function reportSectionFromURL(){
  const fragment=location.pathname==='/share'?new URLSearchParams(location.search).get('listing'):location.hash.slice(1);
  return fragment&&document.getElementById(fragment);
}
function revealSection(target){
  if(target.dataset.listingTarget)target=document.getElementById(target.dataset.listingTarget)||target;
  for(const record of app.querySelectorAll('.listing-record.is-open'))record.classList.remove('is-open');
  if(target.classList.contains('listing-record'))target.classList.add('is-open');
  for(let element=target;element;element=element.parentElement)if(element.tagName==='DETAILS')element.open=true;
  target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'start'});
}
async function boot(){
  if(location.pathname==='/example/warmies'){const r=new URLSearchParams(location.search).get('audience')==='supplier'?supplierSnapshot(warmiesReport):warmiesReport;return showReport(r,{sample:true,shared:r.mode==='supplier'});}
  if(location.pathname==='/share'){
    shell('<main class="empty-state"><h1>正在读取分享报告…</h1></main>',{shared:true});try{const token=location.hash.slice(1);const response=await fetch('/api/index?action=shared&token='+encodeURIComponent(token));const result=await responseData(response,'shared');showReport(result.report,{shared:true});}catch(err){shell(`<main class="empty-state"><h1>报告无法打开</h1><p>${e(err instanceof TypeError?serviceMessage('shared'):err.message)}</p></main>`,{shared:true});}return;
  }
  try{config=await api('config',{id:null,token:null});}catch{config.ready=false;}
  try{internalStore=await import('./internal-data.js');internalFiles=await internalStore.listInternal();}catch{storageError='浏览器资料存储不可用，请允许网站保存数据后重试。';}
  workspaceLoaded=true;location.pathname==='/history'?historyPage():location.pathname==='/internal-data'?internalPage():home();
}
function renderInternalSummary(){
  const selected=internalFiles.filter(x=>x.selected);
  document.querySelector('#internal-summary').innerHTML=`<div><strong>本次内部经营数据 · ${selected.length} 份</strong><p>${selected.length?selected.map(x=>e(x.file.name)).join('、'):'尚未选择。添加现有 SKU、库存与销量，才能比较新品对现有商品的影响。'}</p></div><a href="/internal-data">管理资料或选择示例 →</a>`;
}
function internalPage(){
  shell(internalLibrary(config,DEMOS),{internalView:true});
  const input=document.querySelector('#internal-input'),drop=document.querySelector('#internal-dropzone');
  drop.onclick=ev=>{if(ev.target!==input&&!busy)input.click();};drop.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();if(!busy)input.click();}};
  input.onchange=()=>addInternal([...input.files]);drop.ondragover=ev=>{ev.preventDefault();drop.classList.add('dragover');};drop.ondragleave=()=>drop.classList.remove('dragover');drop.ondrop=ev=>{ev.preventDefault();drop.classList.remove('dragover');addInternal([...ev.dataTransfer.files]);};
  renderInternalFiles();if(storageError)error(storageError);
  document.querySelectorAll('[data-use-demo]').forEach(b=>b.onclick=()=>useDemo(b.dataset.useDemo));
  document.querySelectorAll('[data-download-demo]').forEach(b=>b.onclick=()=>downloadDemo(b.dataset.downloadDemo,b.dataset.kind));
}
function demoFile(d,kind){return kind==='internal'?new File([demoCSV(d)],`DEMO-${d.name}-模拟内部经营数据.csv`,{type:'text/csv'}):new File([demoSupplier(d)],`DEMO-${d.name}-模拟候选供应商资料.txt`,{type:'text/plain'});}
function downloadDemo(id,kind){const d=DEMOS.find(x=>x.id===id);if(!d)return;const file=demoFile(d,kind),url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function useDemo(id){
  if(busy)return;const d=DEMOS.find(x=>x.id===id);if(!d)return;
  if(!internalStore||storageError)return error(storageError||'浏览器资料存储不可用。');
  lock(true);document.querySelectorAll('[data-use-demo]').forEach(b=>b.disabled=true);
  try{
    const file=demoFile(d,'internal'),{extractFiles}=await import('./extract.js');
    const parsed=await extractFiles([file],config.maxPages,()=>{});
    await internalStore.saveInternal(demoSelection(internalFiles,{id:'demo-'+id,file,selected:true,demoId:id,updatedAt:new Date().toISOString(),pages:parsed.pages.length}));
    internalFiles=await internalStore.listInternal();
    files=[demoFile(d,'supplier')];manifest=null;job=null;sourceURLs.forEach(URL.revokeObjectURL);sourceURLs=[];
    draft.market='中国';draft.purpose='转售商品';draft.searchKeyword=d.keyword;draft.focus='使用模拟资料评估以下问题：结合现有SKU库存、30天销量和可取消补货，判断候选是否重复、哪些现有款应保留或暂停补货，以及试销条件。所有经营数字均为模拟，不作真实采购建议。';
    lock(false);navigate('/');notify(`已选用${d.name}示例。点击生成报告，即可用模拟资料体验评审。`);
  }catch(err){error(fileMessage(err));}finally{lock(false);document.querySelectorAll('[data-use-demo]').forEach(b=>b.disabled=false);}
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
  }catch(err){error(fileMessage(err));}finally{lock(false);}
}
function renderInternalFiles(){
  document.querySelector('#internal-count').textContent=`${internalFiles.length} 份资料 · 已选 ${internalFiles.filter(x=>x.selected).length} 份`;
  const list=document.querySelector('#internal-list');
  list.innerHTML=internalFiles.length?internalFiles.map(item=>`<div class="library-file-row">
    <label class="library-file-check"><input type="checkbox" data-select-internal="${e(item.id)}" ${item.selected?'checked':''} aria-label="用于本次评审：${e(item.file.name)}"><span class="library-file-info"><strong>${e(item.file.name)}</strong><small>${size(item.file.size)} · ${item.pages} 页 / 片段 · ${e(new Date(item.updatedAt).toLocaleDateString('zh-CN'))}</small></span></label>
    <div class="library-file-actions"><button type="button" data-preview-internal="${e(item.id)}">预览</button><button type="button" data-remove-internal="${e(item.id)}" aria-label="移除内部资料：${e(item.file.name)}">移除</button></div></div>`).join('')
    :'<p class="library-inline-empty">暂无已保存资料。上传文件后，可在这里勾选和预览。</p>';
  document.querySelectorAll('[data-select-internal]').forEach(input=>input.onchange=async()=>{
    if(busy)return;lock(true);const item=internalFiles.find(x=>x.id===input.dataset.selectInternal);
    try{await internalStore.saveInternal([{...item,selected:input.checked}]);internalFiles=await internalStore.listInternal();manifest=null;}catch(err){error(fileMessage(err));}finally{renderInternalFiles();lock(false);}
  });
  document.querySelectorAll('[data-remove-internal]').forEach(button=>button.onclick=async()=>{
    if(busy)return;lock(true);
    try{await internalStore.removeInternal(button.dataset.removeInternal);internalFiles=await internalStore.listInternal();manifest=null;document.querySelector('#page-preview').innerHTML='';}catch(err){error(fileMessage(err));}finally{renderInternalFiles();lock(false);}
  });
  document.querySelectorAll('[data-preview-internal]').forEach(button=>button.onclick=async()=>{
    if(busy)return;lock(true);
    try{const item=internalFiles.find(x=>x.id===button.dataset.previewInternal);sourceFiles=[item.file];const {extractFiles}=await import('./extract.js');manifest=await extractFiles(sourceFiles,config.maxPages,text=>progress(text,45));renderPreview();progress('解析完成，点击片段查看工作表与行列内容。',100);document.querySelector('#page-preview').scrollIntoView({behavior:'smooth',block:'start'});}catch(err){error(fileMessage(err));}finally{lock(false);}
  });
}


let cloudHistory=[];
async function historyPage(){
  shell(`<main class="workspace library-workspace history-workspace">
    ${libraryHeader('历史报告','查找团队已保存的采购评审，查看进度或继续阅读。','<a class="library-btn library-btn-main" href="/">'+workspaceIcon('plus')+' 新建评审</a>')}
    <div id="history-content"></div><p id="history-status" class="library-sync" role="status"></p></main>`);
  const content=document.querySelector('#history-content'),status=document.querySelector('#history-status');
  let query='',filterStatus='';
  let focusFind=new URLSearchParams(location.search).get('find')==='1';
  const focusRequested=element=>{
    if(focusFind && element.isConnected && location.pathname==='/history'){
      element.focus();
      focusFind=false;
    }
  };
  const updateWorkspace=signedIn=>{
    config.workspaceSignedIn=signedIn;
    if(!signedIn)cloudHistory=[];
    document.dispatchEvent(new Event('workspace-history-changed'));
  };
  const login=()=>{
    if(!content.isConnected)return;
    updateWorkspace(false);
    content.innerHTML=historyLogin();
    focusRequested(content.querySelector('#history-key'));
    content.querySelector('#workspace-login').onsubmit=async event=>{
      event.preventDefault();
      const form=event.currentTarget;
      form.querySelector('button').disabled=true;
      status.textContent='正在登录…';
      try{
        await api('workspace-login',{body:{key:form.elements.key.value},id:null,token:null});
        form.elements.key.value='';
        config.workspaceSignedIn=true;
        status.textContent='正在同步已有任务…';
        for(const x of readHistory().filter(x=>x.token)){
          try{await api('history-claim',{id:x.id,token:x.token,body:{}});}catch{}
        }
        if(content.isConnected)await load();
      }catch(err){status.textContent=err.message;}
      finally{if(form.isConnected)form.querySelector('button').disabled=false;}
    };
  };
  const load=async()=>{
    const refresh=content.querySelector('#refresh-history'),logout=content.querySelector('#workspace-logout');
    if(refresh)refresh.disabled=true;
    if(logout)logout.disabled=true;
    status.textContent='正在读取历史报告…';
    try{
      let offset=0;
      const items=[];
      do{
        const response=await fetch('/api/index?action=history&offset='+offset);
        if(!content.isConnected)return;
        if(response.status===401){login();status.textContent='';return;}
        const data=await responseData(response,'history');
        items.push(...data.items);
        offset=data.nextOffset;
      }while(offset!==null);
      if(!content.isConnected)return;
      cloudHistory=items;
      updateWorkspace(true);
      content.innerHTML=historyPanel();
      const search=content.querySelector('#history-query'),filter=content.querySelector('#history-filter'),list=content.querySelector('#history-list');
      search.value=query;
      filter.value=filterStatus;
      focusRequested(search);
      const renderRows=()=>{
        query=search.value;
        filterStatus=filter.value;
        const term=query.trim().toLocaleLowerCase();
        const visible=items.filter(x=>(!filterStatus||x.status===filterStatus)&&(!term||(x.title||'采购报告').toLocaleLowerCase().includes(term)));
        if(visible.length)list.innerHTML=historyRows(visible,message=>serviceMessage('generate',message));
        else list.innerHTML=items.length
          ?`<div class="library-list-empty">${workspaceIcon('search')}<h3>没有匹配的报告</h3><button class="library-link" type="button" id="reset-history-filters">清除筛选</button></div>`
          :`<div class="library-list-empty">${workspaceIcon('file')}<h3>暂无历史报告</h3><p>完成首次采购评审后，报告会保存在这里。</p></div>`;
        status.textContent=term||filterStatus?`显示 ${visible.length} / ${items.length} 条评审记录`:`共 ${items.length} 条评审记录`;
      };
      renderRows();
      search.addEventListener('input',renderRows);
      filter.addEventListener('change',renderRows);
      list.addEventListener('click',event=>{
        const open=event.target.closest('[data-history-id]');
        if(open)return openHistory(open.dataset.historyId);
        if(event.target.closest('#reset-history-filters')){search.value='';filter.value='';renderRows();search.focus();}
      });
      content.querySelector('#refresh-history').onclick=load;
      content.querySelector('#workspace-logout').onclick=async()=>{
        try{
          await api('workspace-logout',{body:{},id:null,token:null});job=null;report=null;cloudHistory=[];query='';filterStatus='';
          if(content.isConnected){login();status.textContent='已退出工作区';}else updateWorkspace(false);
        }catch(err){status.textContent=err.message;}
      };
      const requested=new URLSearchParams(location.search).get('report');
      if(requested&&items.some(item=>item.status==='completed'&&item.id===requested))await openHistory(requested);
    }catch(err){
      if(status.isConnected){
        status.textContent=err instanceof TypeError?serviceMessage('history'):err.message;
        if(!content.children.length){content.innerHTML='<button class="library-btn library-btn-outline" type="button">重新读取报告</button>';content.querySelector('button').onclick=load;}
      }
    }finally{
      if(refresh?.isConnected)refresh.disabled=false;
      if(logout?.isConnected)logout.disabled=false;
    }
  };
  if(config.workspaceReady===false){
    content.innerHTML='<section class="library-surface library-auth"><h2>工作区历史暂未开放</h2><p>你可以在原浏览器的供应商资料页恢复上次评审。</p><a class="library-link" href="/">返回采购评审 →</a></section>';return;
  }
  await load();
}
async function openHistory(id){
  const status=document.querySelector('#history-status');status.textContent='正在打开报告…';try{const result=await api('job',{id,token:null});if(!result.report){status.textContent=result.status==='analyzing'?'此任务仍在分析，请稍后刷新报告列表。':'此任务尚无完成报告，请返回工作台重新选择资料生成。';return;}
    if(!status.isConnected)return;
    if(new URLSearchParams(location.search).get('report')!==id)history.pushState({},'','/history?report='+encodeURIComponent(id));
    const audience=new URLSearchParams(location.search).get('audience')==='supplier'?'supplier':'internal';
    job={id};sourceFiles=[];manifest=null;showReport(result.report,{audience});
  }catch(err){status.textContent=err.message;}
}

function navigate(href){
  if(busy){notify('正在处理资料，请完成后再切换页面。');return;}
  const dest=new URL(href,location.origin);
  if(dest.pathname==='/history'&&dest.searchParams.has('find')&&location.pathname==='/history'&&!location.search.includes('report=')){
    const field=app.querySelector('#history-query,#history-key');
    if(field){field.focus();if(field.type!=='password')field.select();return;}
  }
  history.pushState({},'',href);
  if(!workspaceLoaded){boot();return;}
  if(dest.pathname==='/history')historyPage();
  else if(dest.pathname==='/internal-data')internalPage();
  else if(dest.pathname==='/example/warmies')boot();
  else home();
  window.scrollTo(0,0);
}
document.addEventListener('click',event=>{
  const a=event.target.closest('a');
  if(!a||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0||a.target==='_blank')return;
  const href=a.getAttribute('href')||'';
  if(href==='/'||href==='/internal-data'||href==='/history'||href==='/example/warmies'||(a.closest('.ws-sidebar')&&href.startsWith('/history?'))){
    event.preventDefault();navigate(href);
  }
});
window.addEventListener('popstate',()=>{if(busy){history.pushState({},'',document.querySelector('#internal-input')?'/internal-data':'/');notify('正在处理资料，请完成后再切换页面。');return;}if(!workspaceLoaded)return boot();location.pathname==='/history'?historyPage():location.pathname==='/internal-data'?internalPage():location.pathname==='/'?home():boot();});
boot();
