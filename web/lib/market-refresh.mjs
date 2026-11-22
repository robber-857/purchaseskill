import {marketProducts, safeMarketURL} from './market.mjs';

export function reportSearchTargets(report, files, product, keyword=''){
  const targets=marketProducts(report,files,keyword);
  if(!product)return targets.length?targets:keyword?[keyword]:[];
  const match=targets.find(target=>target.name===product);
  if(match)return [match];
  if(!targets.length&&product===keyword)return [keyword];
  throw new Error('该款不在供应商产品清单中，请刷新报告后选择');
}

function itemIdentity(item){
  return JSON.stringify([item.product,safeMarketURL(item.url),item.sourceType,item.priceEvidence?.id||'',item.capturedAt||'']);
}

function unique(items){
  return [...new Map(items.map(item=>[itemIdentity(item),item])).values()];
}

export function mergeMarketRefresh(previous={},fresh,targets,allNames){
  const active=new Set(targets.map(target=>typeof target==='string'?target:target.name));
  const all=new Set(allNames);
  // Concurrent refreshes may finish in the opposite order to their search dates.
  const superseded=new Set((previous.searches||[]).filter(row=>active.has(row.product)&&Date.parse(row.capturedAt)>Date.parse(fresh.capturedAt)).map(row=>row.product));
  for(const name of superseded)active.delete(name);
  if(superseded.size&&!active.size)return previous;
  const manual=item=>['buyer_screenshot','open_web','reviewed_source'].includes(item.sourceType);
  const oldItems=previous.items||[];
  const interrupted=(fresh.searches||[]).filter(s=>s.status==='failed'||s.error);
  const preserveProof=item=>item.priceEvidence?.id&&interrupted.some(s=>s.product===item.product&&s.platform===item.platform)&&!fresh.items.some(newItem=>newItem.product===item.product&&newItem.url===item.url&&newItem.priceEvidence?.id);
  const keepOld=item=>manual(item)||preserveProof(item)||(!active.has(item.product)&&all.has(item.product));
  const carry=oldItems.filter(keepOld);
  const current=unique([...carry,...fresh.items.filter(i=>active.has(i.product))]);
  const identities=new Set(current.map(itemIdentity));
  const prior=unique([...(previous.historyItems||[]),...oldItems.filter(item=>!keepOld(item))]).filter(item=>!identities.has(itemIdentity(item)));
  const keepOther=row=>all.has(row.product)&&!active.has(row.product);
  const searches=[...(previous.searches||[]).filter(keepOther),...fresh.searches.filter(s=>active.has(s.product))];
  const descriptors=new Map([...(previous.products||[]),...(fresh.products||[])].map(p=>[p.name,p]));
  const products=allNames.map(name=>descriptors.get(name)||{name,attributes:[]});
  const limited=searches.filter(s=>s.error||['failed','partial','not_configured','not_checked'].includes(s.status));
  const status=!searches.length?fresh.status:searches.every(s=>s.status==='not_configured')?'not_configured':
    searches.every(s=>s.status==='failed')?'failed':limited.length?'partial':'completed';
  return {...previous,...fresh,version:2,products,queries:products.map(p=>p.name),items:current,searches,historyItems:prior,
    status,offers:previous.offers||[],baseline:previous.baseline||null,updatedAt:fresh.capturedAt};
}

export function publicMarketItem(item){
  if(!item.ocr?.screenshotURL&&!item.screenshotURL)return item;
  const {screenshotURL:discard,...copy}=item;
  if(copy.ocr||discard){
    const {screenshotURL:old,...ocr}=copy.ocr||{};
    copy.ocr={...ocr,...((old||discard)&&!item.priceEvidence?{screenshotUnavailable:true}:{})};
  }
  return copy;
}
