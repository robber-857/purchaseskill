import {evidenceAppendix,marketForReport} from './market-report.js';

async function fetchProof(evidence,{id,token,share}){
  const query=new URLSearchParams({action:share?'shared-evidence':'market-evidence',evidence});
  if(!share)query.set('id',id||'');
  const auth=share||token;
  const response=await fetch('/api/index?'+query,{headers:auth?{Authorization:'Bearer '+auth}:{},cache:'no-store'});
  if(!response.ok||!/^image\/(jpeg|png|webp)\b/.test(response.headers.get('content-type')||''))throw new Error('价格截图未能读取，请打开工作区报告后再试');
  return response.blob();
}

export async function viewEvidence(id,context){
  const blob=await fetchProof(id,context);
  const url=URL.createObjectURL(blob);
  const dialog=document.createElement('dialog');
  dialog.className='market-proof-dialog';
  dialog.setAttribute('aria-label','商品页价格截图');
  dialog.innerHTML='<header><h2>商品页价格截图</h2><button type="button" class="proof-zoom secondary" aria-pressed="false">原始尺寸</button><button type="button" class="proof-close secondary">关闭</button></header><div class="price-proof-pan" tabindex="0" aria-label="商品与价格截图"><img alt="采集时的商品详情及价格"></div>';
  dialog.querySelector('.proof-close').onclick=()=>dialog.close();
  dialog.querySelector('.proof-zoom').onclick=event=>{
    const active=dialog.classList.toggle('show-original');
    event.currentTarget.setAttribute('aria-pressed',String(active));
    event.currentTarget.textContent=active?'适应宽度':'原始尺寸';
  };
  dialog.addEventListener('close',()=>{dialog.remove();URL.revokeObjectURL(url);},{once:true});
  dialog.querySelector('img').src=url;
  document.body.append(dialog);
  dialog.showModal();
}

async function evidenceData(id,context){
  const blob=await fetchProof(id,context);
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('未能读取截图'));
    reader.readAsDataURL(blob);
  });
}

export async function withEmbeddedEvidence(report,context){
  const m=report.marketComparison;
  if(!m)return report;
  const copy=structuredClone(report);
  const groups=new Map(),legacy=new Map();
  for(const item of [...(copy.marketComparison.items||[]),...(copy.marketComparison.historyItems||[])]){
    const evidence=item.priceEvidence;
    if(!evidence?.id&&typeof item.ocr?.screenshotData==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.ocr.screenshotData)){
      const original=item.ocr.screenshotData;
      if(!legacy.has(original))legacy.set(original,'legacy-'+(legacy.size+1));
      item.exportProofId=legacy.get(original);
    }
    if(!evidence?.id||evidence.embedded)continue;
    if(!groups.has(evidence.id))groups.set(evidence.id,[]);
    groups.get(evidence.id).push(evidence);
  }
  const pending=groups.entries();
  async function embed(){
    for(const [id,refs] of pending){
      try{
        const image=await evidenceData(id,context);
        for(const ref of refs)ref.embedded=image;
      }catch{
        for(const ref of refs)ref.exportUnavailable=true;
      }
    }
  }
  await Promise.all([embed(),embed(),embed()]);
  return copy;
}

function printChoice(){
  const dialog=document.createElement('dialog');
  dialog.className='market-print-options';
  dialog.setAttribute('aria-label','保存 PDF');
  dialog.innerHTML='<h2>保存 PDF</h2><p>是否将当前比价商品的价格截图附在正文后？</p><form method="dialog"><button value="with" class="primary">正文和价格截图</button><button value="body" class="secondary">仅正文</button><button value="cancel" class="secondary">取消</button></form>';
  const choice=new Promise(resolve=>dialog.addEventListener('close',()=>{
    resolve(dialog.returnValue);
    dialog.remove();
  },{once:true}));
  document.body.append(dialog);
  dialog.showModal();
  return choice;
}

export async function printReport(report,context){
  const current=marketForReport(report);
  if(!current?.items?.some(item=>item.priceEvidence?.id||item.ocr?.screenshotData))return window.print();
  const choice=await printChoice();
  if(choice==='body')return window.print();
  if(choice!=='with')return;
  const {marketComparison}=await withEmbeddedEvidence({marketComparison:{...current,historyItems:[]}},context);
  const appendix=document.createElement('div');
  appendix.className='print-prices-only';
  appendix.innerHTML=evidenceAppendix(marketComparison);
  const article=document.querySelector('.brief-document');
  if(!article)return;
  article.append(appendix);
  await Promise.all([...appendix.querySelectorAll('img')].map(img=>img.decode().catch(()=>{
    img.replaceWith(document.createTextNode('截图未能解码，此处无法显示。'));
  })));
  const cleanup=()=>appendix.remove();
  window.addEventListener('afterprint',cleanup,{once:true});
  try{window.print();}catch(err){window.removeEventListener('afterprint',cleanup);cleanup();throw err;}
}
