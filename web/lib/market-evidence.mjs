import {getMarketImage,putMarketImage} from './store.mjs';
import {captureImage,imageType,maxMarketImageBytes} from './market-capture.mjs';
export {isCaptureImageURL} from './market-capture.mjs';

function productURL(value){
  let url;
  try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  const source=url.searchParams;
  const variants=[...source.getAll('skuId'),...source.getAll('sku_id')];
  if(variants.length>1||(variants.length&&!/^\d+$/.test(variants[0])))return null;
  let official;
  if(['detail.1688.com','m.1688.com'].includes(url.hostname)&&/^\/offer\/\d+\.html\/?$/.test(url.pathname)){
    official=new URL('https://detail.1688.com'+url.pathname.replace(/\/$/,''));
  }else{
    const standard=(['item.taobao.com','detail.taobao.com'].includes(url.hostname)&&url.pathname==='/item.htm')
      ||(url.hostname==='h5.m.taobao.com'&&url.pathname==='/awp/core/detail.htm');
    const listed=url.hostname==='www.taobao.com'&&url.pathname.match(/^\/list\/item\/([A-Za-z0-9_-]{1,200}(?:(?:=|%3[Dd]){1,2})?)\.html?\/?$/);
    if(listed&&!/^\d+$/.test(listed[1])){
      if(listed[1].length<8)return null;
      // This is an opaque official item identity. Never decode it or equate it
      // to a numeric item ID (or to a different opaque path).
      official=new URL(url.origin+url.pathname);
    }else{
      const ids=standard?source.getAll('id'):listed?[listed[1]]:[];
      if(ids.length!==1||!/^\d+$/.test(ids[0]))return null;
      official=new URL('https://item.taobao.com/item.htm');
      official.searchParams.set('id',ids[0]);
    }
  }
  if(variants.length)official.searchParams.set('skuId',variants[0]);
  return official.href;
}

function buyerImage(data){
  if(typeof data!=='string'||data.length>Math.ceil(maxMarketImageBytes/3)*4+32)return null;
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match||match[2].length%4!==0)return null;
  const bytes=Buffer.from(match[2],'base64');
  return imageType(bytes)===match[1]?{bytes,contentType:match[1]}:null;
}
export function priceEvidencePath(jobId,id){
  return '/api/index?action=market-evidence&id='+encodeURIComponent(jobId)+'&evidence='+encodeURIComponent(id);
}

function evidenceFields({sourceURL,finalURL,origin,capturedAt,priceText}){
  const source=productURL(sourceURL);
  const price=typeof priceText==='string'?priceText.trim():'';
  const amount=/^(?:CNY\s*|[¥￥]\s*)(\d[\d,]*(?:\.\d{1,2})?)$|^(\d[\d,]*(?:\.\d{1,2})?)\s*元$/.exec(price);
  const timestamp=Date.parse(capturedAt);
  if(!source||price.length>60||!amount||!(Number((amount[1]||amount[2]).replaceAll(',',''))>0)||!Number.isFinite(timestamp))return null;
  if(!['source_page','buyer_upload'].includes(origin)||(origin==='source_page'&&source!==productURL(finalURL)))return null;
  return {sourceURL:source,origin,capturedAt:new Date(timestamp).toISOString(),priceText:price};
}

// Call only after the page/visual verifier associated this CNY price with the
// target item. Buyer attachments retain their distinct, unverified provenance.
export async function savePriceEvidence(jobId,input,{fetcher=fetch}={}){
  const fields=evidenceFields(input);
  if(!fields||input.signal?.aborted)return null;
  let image;
  if(fields.origin==='source_page'){
    image=await captureImage(input.screenshot,fetcher,input.signal);
  }else{
    image=buyerImage(input.screenshot);
  }
  if(!image||input.signal?.aborted)return null;
  const id=await putMarketImage(jobId,image.bytes,image.contentType);
  return {version:1,id,...fields};
}

// For an already obtained and visually reviewed official-page capture only.
// This is a server-side import function; never expose it as a buyer upload API.
export async function saveReviewedCapture(jobId,{sourceURL,finalURL,capturedAt,priceText,bytes}){
  const fields=evidenceFields({sourceURL,finalURL,capturedAt,priceText,origin:'source_page'});
  if(!fields||!Buffer.isBuffer(bytes))return null;
  const type=imageType(bytes);
  if(!type)return null;
  const id=await putMarketImage(jobId,bytes,type);
  return {version:1,id,...fields,method:'reviewed_capture'};
}

// The API verifies owner/workspace access (or the particular unexpired internal
// share) before calling this. Membership is checked against that exact snapshot.
export async function readPriceEvidence(job,id){
  if(typeof id!=='string'||!/^[0-9a-f]{64}$/.test(id)||!job?.report||job.report.mode==='supplier')return null;
  const market=job.report.marketComparison;
  const rows=[...(market?.items||[]),...(market?.historyItems||[])];
  const referenced=rows.some(row=>row?.priceEvidence?.version===1&&row.priceEvidence.id===id&&productURL(row.url)&&productURL(row.url)===productURL(row.priceEvidence.sourceURL));
  if(!referenced)return null;
  const bytes=await getMarketImage(job.id,id);
  const contentType=imageType(bytes);
  return contentType?{bytes,contentType}:null;
}
