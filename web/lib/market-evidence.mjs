import {getMarketImage,putMarketImage,maxMarketImageBytes,boundedMarketImageBody} from './store.mjs';

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

// Only accept screenshot objects from the capture provider's own bucket. Never
// fetch an arbitrary client-supplied URL or follow a redirect with a signed query.
export function isCaptureImageURL(value){
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(
      (url.hostname==='storage.googleapis.com'&&url.pathname.startsWith('/firecrawl-scrape-media/'))||
      (url.hostname==='firecrawl-scrape-media.storage.googleapis.com'&&url.pathname.length>1)
    );
  }catch{return false;}
}

function dimensionsOK(width,height){
  return width>0&&height>0&&width<=32000&&height<=32000&&width*height<=48000000;
}
function imageType(bytes){
  if(!bytes||bytes.length<16||bytes.length>maxMarketImageBytes)return null;
  if(bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND'){
    return dimensionsOK(bytes.readUInt32BE(16),bytes.readUInt32BE(20))?'image/png':null;
  }
  if(bytes.readUInt16BE(0)===0xffd8&&bytes.readUInt16BE(bytes.length-2)===0xffd9){
    for(let i=2;i+8<bytes.length&&bytes[i]===0xff;){
      while(bytes[i]===0xff)i++;
      if(i+7>=bytes.length)break;
      const marker=bytes[i++];
      const length=bytes.readUInt16BE(i);
      if(length<2||i+length>bytes.length||marker===0xda)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8){
        return dimensionsOK(bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3))?'image/jpeg':null;
      }
      i+=length;
    }
  }
  if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.readUInt32LE(4)===bytes.length-8&&bytes.toString('ascii',8,12)==='WEBP'){
    const kind=bytes.toString('ascii',12,16);
    if(kind==='VP8X'&&dimensionsOK(1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)))return 'image/webp';
    if(kind==='VP8 '&&bytes.subarray(23,26).equals(Buffer.from('9d012a','hex'))&&dimensionsOK(bytes.readUInt16LE(26)&0x3fff,bytes.readUInt16LE(28)&0x3fff))return 'image/webp';
    if(kind==='VP8L'&&bytes[20]===0x2f){
      const bits=bytes.readUInt32LE(21);
      if(dimensionsOK(1+(bits&0x3fff),1+((bits>>>14)&0x3fff)))return 'image/webp';
    }
  }
  return null;
}
function buyerImage(data){
  if(typeof data!=='string'||data.length>Math.ceil(maxMarketImageBytes/3)*4+32)return null;
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match||match[2].length%4!==0)return null;
  const bytes=Buffer.from(match[2],'base64');
  return imageType(bytes)===match[1]?{bytes,contentType:match[1]}:null;
}
async function captureImage(url,fetcher,deadline){
  if(!isCaptureImageURL(url))return null;
  const timeout=AbortSignal.timeout(10000);
  const signal=deadline?AbortSignal.any([timeout,deadline]):timeout;
  const response=await fetcher(url,{redirect:'error',credentials:'omit',signal});
  const contentType=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(!response.ok||!['image/png','image/jpeg','image/webp','application/octet-stream'].includes(contentType)){
    await response.body?.cancel();
    return null;
  }
  const bytes=await boundedMarketImageBody(response);
  const actual=imageType(bytes);
  return actual&&(actual===contentType||contentType==='application/octet-stream')?{bytes,contentType:actual}:null;
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
