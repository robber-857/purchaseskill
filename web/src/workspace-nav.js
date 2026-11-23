import {escape as e} from './report.js';
import {workspaceIcon as icon,workspaceMark} from './workspace-icons.js';

const preference='purchase-review-compact-nav';
const visitsKey='purchase-review-recently-opened';
const mobile=matchMedia('(max-width: 900px)');

function link(href,name,label,active=false,extra=''){
  return `<a class="ws-link" href="${e(href)}" aria-label="${e(label)}" title="${e(label)}" ${active?'aria-current="page"':''}>${icon(name)}<span class="ws-label">${e(label)}</span>${extra}</a>`;
}

function lastOpened(){
  try{
    const ids=JSON.parse(sessionStorage.getItem(visitsKey)||'[]');
    return Array.isArray(ids)?ids.filter(id=>typeof id==='string').slice(0,12):[];
  }catch{return [];}
}
export function recordWorkspaceVisit(id){
  try{sessionStorage.setItem(visitsKey,JSON.stringify([id,...lastOpened().filter(other=>other!==id)].slice(0,12)));}catch{}
}

export function workspaceFrame({pageName,reportView,internalView,historyPage,chapterLinks}){
  const brand=`<a class="ws-brand" href="/" aria-label="选品有据 首页" title="选品有据">${workspaceMark}<span class="ws-label"><strong>选品有据</strong><small>PURCHASE REVIEW</small></span></a>`;
  const newReview=link('/','plus','新建评审',!reportView&&!internalView&&!historyPage);
  const find=link('/history?find=1','search','查找报告',false,'<kbd aria-hidden="true" class="ws-shortcut"></kbd>');
  const library=link('/history','library','历史报告',historyPage&&!reportView);
  const data=link('/internal-data','data','内部经营数据',internalView);
  const sample=link('/example/warmies','sample','案例报告',location.pathname==='/example/warmies');
  const chapters=reportView?`<section class="ws-chapters"><div class="ws-section-label">报告目录</div><nav class="report-nav" aria-label="报告章节">${chapterLinks}</nav><button type="button" data-nav-chapters class="ws-icon-button" aria-label="展开报告目录" title="展开报告目录">${icon('list')}</button></section>`:'';
  const aside=`<aside id="workspace-sidebar" class="app-sidebar ws-sidebar${reportView?' reader-sidebar':''}" aria-label="采购工作区导航">
    <div class="ws-brand-row">${brand}<button type="button" class="ws-icon-button ws-desktop-toggle" data-nav-toggle aria-controls="workspace-sidebar">${icon('panel')}</button><button type="button" class="ws-icon-button ws-drawer-close" data-nav-close aria-label="关闭导航">${icon('close')}</button></div>
    <div class="ws-sidebar-scroll"><nav class="ws-actions" aria-label="快捷操作">${newReview}${find}</nav>
      ${chapters}
      <div class="ws-section-label">工作区</div><nav class="ws-destinations" aria-label="主导航">${library}${data}${sample}</nav>
      ${!reportView?'<section data-nav-recents hidden><div class="ws-section-label">最近报告</div><nav aria-label="最近报告"></nav></section>':''}
    </div><div class="ws-sidebar-foot" data-nav-account></div>
  </aside><div class="ws-scrim" data-nav-close aria-hidden="true"></div>`;
  const opener=`<button type="button" class="ws-icon-button ws-mobile-toggle" data-nav-open aria-label="打开工作区导航" aria-controls="workspace-sidebar" aria-expanded="false">${icon('panel')}</button>`;
  if(reportView)return aside+`<div class="reader-mobile">${opener}<a class="reader-mobile-history" href="/history">历史报告</a><details class="reader-menu"><summary>报告目录</summary><nav aria-label="移动报告章节">${chapterLinks}</nav></details></div>`;
  return aside+`<header class="topbar ws-topbar">${opener}<div class="ws-crumb"><span>采购工作区</span>${icon('chevron')}<strong>${e(pageName)}</strong></div></header>`;
}

// The session is authoritative. Never show titles from another login or from
// the browser's private recovery snapshots in workspace navigation.
export function refreshWorkspaceIdentity(app,signedIn,records){
  const account=app.querySelector('[data-nav-account]');
  if(!account)return;
  const accountLabel=signedIn?'采购工作区':'登录工作区';
  account.innerHTML=`<a class="ws-account" href="/history" aria-label="${accountLabel}" title="${accountLabel}"><span class="ws-avatar">${icon('building')}</span><span class="ws-label"><strong>${accountLabel}</strong><small>${signedIn?'已登录':'查看团队报告'}</small></span>${icon('chevron')}</a>`;
  const recent=app.querySelector('[data-nav-recents]');
  if(!recent)return;
  const eligible=signedIn?records.filter(x=>x.status==='completed'&&x.id&&x.title):[];
  const visited=lastOpened().map(id=>eligible.find(row=>row.id===id)).filter(Boolean);
  const rows=[...new Set([...visited,...eligible])].slice(0,5);
  recent.hidden=rows.length===0;
  const dateFormat=new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  recent.querySelector('nav').innerHTML=rows.map(row=>{
    const href='/history?report='+encodeURIComponent(row.id);
    const duplicate=rows.some(other=>other!==row&&other.title===row.title);
    const time=Date.parse(row.createdAt);
    if(!duplicate||!Number.isFinite(time))return link(href,'file',row.title);
    const date=dateFormat.format(time);
    return `<a class="ws-link ws-report-version" href="${href}" title="${e(row.title+' · '+date)}">${icon('file')}<span><span class="ws-label">${e(row.title)}</span><time datetime="${e(row.createdAt)}">${e(date)}</time></span></a>`;
  }).join('');
}

let cleanup;
export function resetWorkspaceNavigation(){cleanup?.();cleanup=null;}
export function bindWorkspaceNavigation(app){
  const sidebar=app.querySelector('.ws-sidebar');
  if(!sidebar)return;
  const toggle=sidebar.querySelector('[data-nav-toggle]'), opener=app.querySelector('[data-nav-open]');
  const close=sidebar.querySelector('[data-nav-close]');
  const shortcut=sidebar.querySelector('.ws-shortcut');
  const isMac=/Mac|iPhone|iPad/.test(navigator.platform);
  shortcut.textContent=isMac?'⌘ K':'Ctrl K';
  let compact=false,drawer=false,locked=[];
  try{compact=localStorage.getItem(preference)==='1';}catch{}
  function applyCompact(){
    app.classList.toggle('ws-compact',compact);
    const label=compact?'展开侧栏':'收起侧栏';
    toggle.title=label;toggle.setAttribute('aria-label',label);toggle.setAttribute('aria-expanded',String(!compact));
  }
  function setCompact(value){compact=value;applyCompact();try{localStorage.setItem(preference,value?'1':'0');}catch{}}
  function setDrawer(open,restore=true){
    if(drawer===open)return;
    drawer=open;app.classList.toggle('ws-drawer-open',open);
    opener.setAttribute('aria-expanded',String(open));
    if(open){
      sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');
      locked=[...app.children].filter(el=>el!==sidebar && !el.classList.contains('ws-scrim') && !el.inert);
      for(const el of locked)el.inert=true;
      close.focus();
    }else{
      sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');
      for(const el of locked)el.inert=false;
      locked=[];
      if(restore&&mobile.matches)opener.focus({preventScroll:true});
    }
  }
  function resize(){setDrawer(false,false);}
  function keydown(event){
    if(drawer && event.key==='Escape'){event.preventDefault();setDrawer(false);return;}
    if(drawer&&event.key==='Tab'){
      const links=[...sidebar.querySelectorAll('a[href],button')].filter(el=>el.getClientRects().length);
      const edge=event.shiftKey?links[0]:links.at(-1);
      if(document.activeElement===edge){event.preventDefault();(event.shiftKey?links.at(-1):links[0]).focus();}
    }
    if((isMac?event.metaKey:event.ctrlKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='k'&&!sidebar.inert&&!document.querySelector('dialog[open],.flow-panel:not([hidden])')){
      event.preventDefault();setDrawer(false,false);sidebar.querySelector('a[href="/history?find=1"]').click();
    }
  }
  applyCompact();
  toggle.onclick=()=>setCompact(!compact);
  sidebar.querySelector('[data-nav-chapters]')?.addEventListener('click',()=>{setCompact(false);sidebar.querySelector('.report-nav a')?.focus();});
  opener.onclick=()=>{if(!sidebar.inert)setDrawer(true);};
  close.onclick=()=>setDrawer(false);
  app.querySelector('.ws-scrim').onclick=()=>setDrawer(false);
  sidebar.addEventListener('click',event=>{if(event.target.closest('a'))setDrawer(false,false);});
  document.addEventListener('keydown',keydown);
  mobile.addEventListener('change',resize);
  cleanup=()=>{setDrawer(false,false);document.removeEventListener('keydown',keydown);mobile.removeEventListener('change',resize);};
}
