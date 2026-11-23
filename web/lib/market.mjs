import {z} from 'zod';
import {productPlan,productSimilarity,indexedPackageMatch,indexedBodyMatch} from './market-products.mjs';
import {bundleMismatch,incompatibleMaterial,listingHeader,matchingBundleVariant,sameListingTitle,screenshotOffer,screenshotVariant} from './market-listing.mjs';
export {marketProducts} from './market-products.mjs';

export const PLATFORMS = [
  {id:'1688',name:'1688',domain:'1688.com',kind:'批发线索'},
  {id:'taobao',name:'淘宝',domain:'taobao.com',kind:'零售线索'},
];
export function safeMarketURL(value,domain){
  try {const u=new URL(value);const host=u.hostname;for(const key of [...u.searchParams.keys()])if(/^(utm_|srsltid$|spm$|ad_od$)/.test(key))u.searchParams.delete(key);u.hash='';return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&host.includes('.')&&!/^[\d.]+$|[:\[\]]|(?:^|\.)(?:localhost|local|internal)$/.test(host)&&(!domain||host===domain||host.endsWith('.'+domain))?u.href:null;}catch{return null;}
}
export function isChinaMarketURL(url){return PLATFORMS.some(p=>Boolean(safeMarketURL(url,p.domain)));}
export function isSingleProductURL(url){try{return isChinaMarketURL(url)&&/^(?:taobao|1688)\//.test(productPageKey(url));}catch{return false;}}
export function singlePrice(values=[]){const prices=[...new Set(values.map(x=>String(x).trim()).filter(x=>/^(?:CNY|[¥￥])\s*\d[\d,]*(?:\.\d{1,2})?$|^\d[\d,]*(?:\.\d{1,2})?\s*元$/.test(x)))];return prices.length&&new Set(prices.map(p=>Number(p.replace(/[^0-9.]/g,'')))).size===1?prices[0]:null;}
export function marketRank(item){return (item.similarity?.score || 0)*10+(item.verification?.price?100:0)+(item.ocr?.offers?.length?70:0)+(item.priceMentions?.length?40:0)+(item.pageType==='product'?10:0)+(item.imageUrl?5:0);}
// Only use images explicitly identified by a source page, never guessed URLs or AI imagery.
export function marketImageURL(value){
  if(typeof value!=='string'||value.length>2000)return null;
  try{
    const address=value.trim();
    const image=new URL(address.startsWith('//')?'https:'+address:address);
    if(image.protocol==='http:'&&/(^|\.)(?:alicdn\.com|tbcdn\.cn|taobaocdn\.com)$/.test(image.hostname))image.protocol='https:';
    // Preserve the original image query, which may contain signed CDN parameters.
    return safeMarketURL(image.href)?image.href:null;
  }catch{return null;}
}
function productPageKey(url){
  const page=new URL(url);
  const variants=[...page.searchParams.getAll('skuId'),...page.searchParams.getAll('sku_id')];
  if(variants.length>1 || (variants.length&&!/^\d+$/.test(variants[0])))return url;
  const sku=variants[0]||'';
  const offer=/^(?:detail\.1688|m\.1688)\.com$/.test(page.hostname)&&page.pathname.match(/^\/offer\/(\d+)\.html\/?$/);
  if(offer)return '1688/'+offer[1]+'/'+sku;
  const ids=page.searchParams.getAll('id');
  const numericRoute=(/^(?:item|detail)\.taobao\.com$/.test(page.hostname)&&page.pathname==='/item.htm')||
    (page.hostname==='h5.m.taobao.com'&&page.pathname==='/awp/core/detail.htm');
  const id=(numericRoute&&ids.length===1&&ids[0])
    ||(page.hostname==='www.taobao.com'&&page.pathname.match(/^\/list\/item\/(\d+)\.htm(?:l)?\/?$/)?.[1]);
  if(id&&/^\d+$/.test(id))return 'taobao/'+id+'/'+sku;
  const opaque=page.hostname==='www.taobao.com'&&page.pathname.match(/^\/list\/item\/([A-Za-z0-9_-]{1,200}(?:(?:=|%3[Dd]){1,2})?)\.html?\/?$/);
  if(opaque&&opaque[1].length>=8)return 'taobao/opaque/'+page.pathname+'/'+sku;
  return url;
}
function structuredProductImages(html,sourceURL,title){
  if(typeof html!=='string'||!sourceURL)return [];
  const images=[];
  for(const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
    let parsed;
    try{parsed=JSON.parse(match[1]);}catch{continue;}
    const nodes=[parsed].flat().flatMap(node=>node?.['@graph']||node);
    for(const node of nodes){
      if(![node?.['@type']].flat().includes('Product'))continue;
      if(node.url){
        let url;
        try{url=safeMarketURL(new URL(node.url,sourceURL).href);}catch{continue;}
        if(!url||productPageKey(url)!==productPageKey(sourceURL))continue;
      }else if(typeof title!=='string'||typeof node.name!=='string'||node.name.trim()!==title.trim())continue;
      for(const img of [node.image].flat())images.push(typeof img==='string'?img:img?.contentUrl||img?.url);
    }
  }
  return images;
}
function pageImages(data,sourceURL){
  const m=data?.metadata||{};
  const values=[...structuredProductImages(data?.rawHtml,sourceURL,m.ogTitle||m['og:title']||m.title),m['product:image'],m['og:image:secure_url'],m.ogImage,m['og:image'],m['og:image:url'],m.twitterImage,m['twitter:image'],m['twitter:image:src']].flat();
  return values.map(value=>{
    if(typeof value!=='string'||!value.trim()||/^[?#]/.test(value.trim()))return null;
    try{
      const url=marketImageURL(value)||marketImageURL(new URL(value.trim(),sourceURL).href);
      return url!==sourceURL?url:null;
    }catch{return null;}
  }).filter(Boolean);
}
export function sourceProductImage(data){
  return pageImages(data,data?.metadata?.url||data?.metadata?.sourceURL)[0]||null;
}
export function marketCoverURLs(item){
  const values=[item.imageUrl,...(Array.isArray(item.imageAlternatives)?item.imageAlternatives:[]),item.thumbnailUrl];
  return [...new Set(values.map(marketImageURL).filter(Boolean))].slice(0,3);
}
function addCoverImages(item,urls,origin,sourceURL){
  const additions=urls.map(marketImageURL).filter(Boolean);
  if(!additions.length)return;
  const existing=marketCoverURLs(item);
  const preferred=origin==='source_page'&&existing.length?[...new Set(additions)].slice(0,2):additions;
  const sources=[...new Set([...preferred,...existing])].slice(0,3);
  item.imageUrl=sources[0];
  item.imageAlternatives=sources.slice(1);
  item.imageOrigin=origin;
  item.imageSourceURL=sourceURL;
}
export function chinaMarketComparison(m){
  if(!m)return m;
  return {...m,items:(m.items||[]).filter(i=>!i.discoveryOnly&&isSingleProductURL(i.url)&&!['redirected','listing','unavailable'].includes(i.verification?.status)&&(!i.verification?.currency||i.verification.currency==='CNY')),offers:(m.offers||[]).filter(o=>isChinaMarketURL(o.url)&&o.currency==='CNY'),baseline:m.baseline?.currency==='CNY'?m.baseline:null,searches:(m.searches||[]).filter(s=>PLATFORMS.some(p=>p.name===s.platform)),note:'仅检索1688和淘宝公开内容，不登录。保留商品链接、价格原文及获取时间；仅展示单品链接；每个商品只展示一个有依据的价格，无法确定规格或价格时不猜测。'};
}
const text=z.string().trim().max(300);
const positive=z.number().finite().positive().max(1e9);
export const OfferSchema=z.object({
  product:text.min(1),platform:z.enum(PLATFORMS.map(p=>p.name)),title:text.min(1),url:z.string().max(2000),
  seller:text,model:text,kind:z.enum(['批发','零售']),price:positive,currency:z.literal('CNY'),unit:text.min(1),
  moq:positive,quantity:positive,taxShippingIncluded:z.boolean(),sameSpecification:z.boolean(),
  delivery:text,afterSales:text,conditions:text,observedAt:z.string().date(),
}).superRefine((o,ctx)=>{const p=PLATFORMS.find(p=>p.name===o.platform);if(!safeMarketURL(o.url,p.domain)||!isSingleProductURL(o.url))ctx.addIssue({code:'custom',message:'请提供对应平台的 HTTPS 商品链接',path:['url']});});
export const MarketInputSchema=z.object({
  product:z.string().trim().min(1).max(160).optional(),
  screenshot:z.object({sourceURL:z.string().max(2000).refine(x=>isSingleProductURL(x),'请填写1688或淘宝单品详情链接，不接受搜索或聚合页'),title:z.string().trim().min(1).max(300),image:z.string().max(550000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)}).optional(),
  sourceUrls:z.array(z.string().max(2000).refine(x=>isSingleProductURL(x),'请填写单品详情链接，不接受搜索或聚合页').transform(x=>safeMarketURL(x))).min(1).max(4).optional(),
  keyword:z.string().trim().min(1).max(100).optional(),
  offers:z.array(OfferSchema).max(30).optional(),
  baseline:z.object({product:text.min(1),price:positive,currency:z.literal('CNY'),unit:text.min(1),quantity:positive,taxShippingIncluded:z.boolean()}).nullable().optional(),
});
export function compareOffers(offers=[],baseline){
  return offers.map(o=>{
    const reasons=[];
    if(!baseline)reasons.push('未填写供应商基准报价');
    else {
      if(o.product!==baseline.product)reasons.push('不同评估产品');
      if(o.currency!==baseline.currency)reasons.push('币种不同');
      if(o.unit!==baseline.unit)reasons.push('计价单位不同');
      if(o.quantity!==baseline.quantity)reasons.push('报价适用数量不同');
      if(!baseline.taxShippingIncluded)reasons.push('供应商基准未确认含税到货');
    }
    if(o.kind!=='批发')reasons.push('零售价仅作为市场定位参考');
    if(!o.sameSpecification)reasons.push('规格尚未确认为可替代');
    if(!o.taxShippingIncluded)reasons.push('税运口径未确认');
    if(o.moq>o.quantity)reasons.push('采购量未达到起订量');
    return {...o,comparable:!reasons.length,reasons,
      delta:reasons.length?null:Number((o.price-baseline.price).toFixed(4)),
      deltaPercent:reasons.length?null:Number(((o.price/baseline.price-1)*100).toFixed(2)),
      total:reasons.length?null:Number((o.price*baseline.quantity).toFixed(2)),
      savings:reasons.length?null:Number(((baseline.price-o.price)*baseline.quantity).toFixed(2))};
  });
}
export function searchLinks(keyword){return PLATFORMS.map(p=>({...p,url:'https://www.bing.com/search?q='+encodeURIComponent(`site:${p.domain} ${keyword} 价格`)}));}
export function marketPageType(url){
  const u=new URL(url);
  if(isSingleProductURL(url))return 'product';
  if(/^\/products\/[^/]+\/?$|^\/product-page\/[^/]+\/?$/.test(u.pathname))return 'product';
  if(/^(item|detail)\.taobao\.com$/.test(u.hostname)&&u.pathname==='/item.htm'&&/^\d+$/.test(u.searchParams.get('id')||''))return 'product';
  return /\/offer\/|\/list\/item\/|\/product\/\d+|\/\d+\.html/.test(u.pathname)&&/^(detail\.1688|item(?:\.m)?\.jd|www\.taobao)\.com$/.test(u.hostname)?'product':'listing';
}
export function inspectMarketPage(item,data){
  const markdown=String(data?.markdown||'');
  const finalURL=data?.metadata?.url||data?.metadata?.sourceURL||item.url;
  if(data?.metadata?.statusCode>=400)return {status:'unavailable',note:'来源页面返回错误，价格未核实'};
  if(/captcha|slider to verify|滑块验证|登录查看价格|登录后可查看商品到手价|密码登录短信登录|下载APP前往抢购/i.test(markdown)||/login\.|\/download(?:\?|$)/.test(finalURL))return {status:'blocked',note:'来源要求登录、验证码或 App，未核实商品价格'};
  if(isSingleProductURL(item.url) ? !isSingleProductURL(finalURL)||productPageKey(finalURL)!==productPageKey(item.url) : new URL(finalURL).origin!==new URL(item.url).origin||new URL(finalURL).pathname!==new URL(item.url).pathname||['id','itemId'].some(k=>new URL(item.url).searchParams.has(k)&&new URL(item.url).searchParams.get(k)!==new URL(finalURL).searchParams.get(k)))return {status:'redirected',note:'来源跳转到其他页面或规格，不能确认该商品价格'};
  if(item.pageType!=='product')return {status:'listing',note:'聚合页含多个商品，不能将金额作为单个商品报价'};
  const metadata=data.metadata||{};
  const amount=Number(metadata['product:price:amount']||metadata['og:price:amount']);
  const currency=metadata['product:price:currency']||metadata['og:price:currency'];
  const productTitle=metadata['og:title']||metadata.ogTitle;
  const heading=markdown.match(/^# (.+)$/m);
  const productBlock=heading?markdown.slice(heading.index,heading.index+1500):'';
  const normalized=s=>String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const headingMatches=heading&&productTitle&&normalized(heading[1])===normalized(productTitle);
  const titleMatches=productTitle&&(!item.title||normalized(item.title).includes(normalized(productTitle)));
  const priceToken=Number.isFinite(amount)&&amount>0?amount.toFixed(2):null;
  // Require product metadata AND visible product-heading price. Never infer currency from a domain or '$'.
  const visibleAmounts=[...productBlock.matchAll(/(?:[$¥￥]|AUD|USD|CNY)\s*(\d+(?:\.\d{1,2})?)(?![\d.])/g)].map(m=>Number(m[1]));
  if(metadata['og:type']==='product'&&headingMatches&&titleMatches&&priceToken&&/^[A-Z]{3}$/.test(currency||'')&&visibleAmounts.includes(amount))return {status:'page_observed',method:'product_metadata_and_visible_text',price:`${currency} ${priceToken}`,amount,currency,productTitle,sourceURL:finalURL,availability:/sold out|out of stock/i.test(productBlock)?'页面含缺货提示':'库存需结算前确认',excerpt:productBlock.slice(0,1200),note:'商品页标价与价格元数据一致；零售参考，规格、税运与购买地区仍需核对'};
  // Only confirm that the same indexed price and product title occur together on the page.
  // Do not harvest unrelated shipping, coupon or recommendation amounts from page text.
  const compact=s=>s.replace(/\s/g,'');
  const title=compact(item.title).slice(0,12);
  const only=singlePrice(item.priceMentions);const price=only&&compact(markdown).includes(compact(only))?only:null;
  if(title.length>=4&&compact(markdown).includes(title)&&price)return {status:'page_observed',note:'商品页可见标题与索引金额；具体 SKU、优惠资格及结算价仍需核对',price,excerpt:markdown.slice(Math.max(0,markdown.indexOf(price)-120),markdown.indexOf(price)+200)};
  return {status:'unconfirmed',note:'未在原页面同时确认商品标题和索引金额'};
}
function pagePrice(item){
  if (['blocked','redirected','unavailable','failed','listing'].includes(item.verification?.status)||item.ocr?.status==='blocked') return null;
  if(item.priceEvidence?.priceText)return singlePrice([item.priceEvidence.priceText]);
  if (item.verification?.status==='page_observed'&&(!item.verification.currency||item.verification.currency==='CNY')) return singlePrice([item.verification.price]);
  const offers=item.ocr?.status==='read'?item.ocr.offers.filter(o=>o.matchesCandidate):[];
  return offers.length===1?singlePrice([offers[0].priceText]):null;
}
function updateCoverage(result){
  if(!result.searches)return result;
  for(const search of result.searches){
    if(!('directCount' in search))continue;
    const group=result.items.filter(i=>i.product===search.product && i.platform===search.platform);
    const retained=group.filter(i=>!i.discoveryOnly&&!['redirected','listing','unavailable'].includes(i.verification?.status)&&(!i.verification?.currency||i.verification.currency==='CNY'));
    search.matchedCount=retained.length;
    search.readableCount=retained.filter(i=>i.verification?.readable).length;
    search.verifiedPriceCount=retained.filter(i=>i.verification?.readable&&pagePrice(i)).length;
    // A successful recheck of a supplied or previously saved URL is useful,
    // but only a hit from this search can count as an automatic discovery.
    const proven=retained.filter(i=>i.verification?.readable && i.priceEvidence?.id);
    search.automaticProofCount=proven.filter(i=>i.discoveryQuery && i.discoveryURL &&
      ['marketplace','linked_detail'].includes(i.sourceType)).length;
    search.recheckedProofCount=proven.filter(i=>i.sourceType==='rechecked_source').length;
    search.blockedCount=group.filter(i=>i.verification?.status==='blocked'||i.ocr?.status==='blocked').length;
    search.redirectedCount=group.filter(i=>i.verification?.status==='redirected').length;
    search.uncheckedCount=group.filter(i=>!i.verification||i.verification.status==='not_checked').length;
    const checkedKnown=retained.filter(i=>i.recheckKnownSource&&i.verification?.readable);
    if(checkedKnown.length&&['failed','partial'].includes(search.status)){
      search.status='partial';
      search.reason=(search.error==='检索服务限流'?'关键词检索限流':'关键词检索未全部完成')+'，已重新核实 '+checkedKnown.length+' 个历史商品页';
      continue;
    }
    if(search.status==='failed'||search.status==='not_configured')continue;
    if(search.status==='partial'){
      search.reason=search.error==='检索服务限流'?'部分检索已完成，搜索服务限流，尚未完整核对': '部分检索已完成，其余检索暂未成功';
      continue;
    }
    search.status=retained.length?'found':'empty';
    if(!retained.length&&search.error)search.reason='部分检索未完成，暂未取得匹配的商品链接';
    else if(!retained.length&&search.blockedCount)search.reason='发现单品链接，原页要求登录或验证，未能核实是否匹配本款';
    else if(!retained.length&&search.redirectedCount)search.reason='发现单品链接，原页跳转到其他商品或规格，未取得可核对的候选';
    else if(!retained.length)search.reason=search.directCount?'检索到单品链接，但未取得匹配本款的有效候选':'本次检索未返回可识别的单品详情链接';
    else if(retained.every(i=>i.verification?.status==='blocked'||i.ocr?.status==='blocked'))search.reason='单品链接已找到，打开原页需要登录或验证';
    else if(search.automaticProofCount)search.reason='已从本轮自动找到的商品原页核实价格并保存截图，采购规格及税运仍需核对';
    else if(search.readableCount&&!search.verifiedPriceCount)search.reason='已打开匹配的商品页，尚未从原页确认对应规格价格';
    else if(search.verifiedPriceCount)search.reason='已读取匹配商品的原页价格，采购规格及税运仍需核对';
    else search.reason='已找到详情链接，原页商品或标价仍待核对';
  }
  return result;
}
async function untilDeadline(stopAt,callback){
  const remaining=stopAt-Date.now();
  if(remaining<=0)throw new DOMException('核验达到等待时限','TimeoutError');
  const controller=new AbortController();
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
    const error=new DOMException('核验达到等待时限','TimeoutError');
    controller.abort(error);reject(error);
  },remaining);});
  try{return await Promise.race([callback(controller.signal),timeout]);}finally{clearTimeout(timer);}
}
export function includeKnownSources(fresh,previous,targets){
  if(!previous||fresh.status==='not_configured')return fresh;
  const active=new Set(targets.map(p=>typeof p==='string'?p:p.name));
  const items=fresh.items.map(item=>({...item}));
  const keyOf=i=>JSON.stringify([i.product,productPageKey(i.url)]);
  const available=new Map(items.filter(i=>isSingleProductURL(i.url)).map(i=>[keyOf(i),i]));
  const prior=[...(previous.items||[]),...(previous.historyItems||[])].filter(i=>
    active.has(i.product)&&isSingleProductURL(i.url)&&(i.priceEvidence?.id||i.sourceType==='reviewed_source'||i.verification?.readable));
  const strength=i=>(i.priceEvidence?.id?4:0)+(i.sourceType==='reviewed_source'?2:0)+(i.verification?.readable?1:0);
  prior.sort((a,b)=>strength(b)-strength(a)||(Date.parse(b.capturedAt)||0)-(Date.parse(a.capturedAt)||0));
  const selected=new Set(),counts=new Map();
  for(const old of prior){
    const platform=PLATFORMS.find(p=>safeMarketURL(old.url,p.domain));
    const group=JSON.stringify([old.product,platform.id]),key=keyOf(old);
    if(selected.has(key)||(counts.get(group)||0)>=2)continue;
    counts.set(group,(counts.get(group)||0)+1);
    selected.add(key);
    const indexed=available.get(key);
    if(indexed){indexed.recheckKnownSource=true;continue;}
    // Reuse only the URL and SKU association. All content, including the title, price
    // and match observations, must be read again from the official page.
    items.push({product:old.product,platform:platform.name,kind:platform.kind,url:safeMarketURL(old.url),
      sourceType:'rechecked_source',pageType:'product',capturedAt:fresh.capturedAt,priceMentions:[],
      title:'',discoveryOnly:true,recheckKnownSource:true});
  }
  return {...fresh,items};
}
// Firecrawl enforces a per-team minute limit. Share pacing across concurrent
// real runs and pause every worker on the provider's retry deadline.
const sharedScrapeBudget={next:0,blockedUntil:0,spacing:6100};
function registerScrapeResponse(budget,response,live){
  const get=name=>response.headers?.get?.(name);
  const limit=Number(get('ratelimit-limit')||get('x-ratelimit-limit'));
  if(live&&limit>=1&&limit<100000)budget.spacing=Math.max(800,Math.ceil(61000/limit));
  if(response.status!==429)return;
  const retry=get('retry-after'),seconds=retry==null?NaN:Number(retry);
  const retryMs=Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now();
  budget.blockedUntil=Math.max(budget.blockedUntil,Date.now()+(Number.isFinite(retryMs)?Math.max(0,retryMs):60000));
}
async function scrapeListing(body,{key,fetcher,stopAt,budget}){
  for(let attempt=0;attempt<3;attempt++){
    while(true){
      const now=Date.now(),start=Math.max(now,budget.next,budget.blockedUntil);
      if(start+300>=stopAt)throw new DOMException('来源队列超过本轮核验时限','TimeoutError');
      if(start===now){budget.next=now+budget.spacing;break;}
      await delay(start-now);
    }
    const remaining=Math.max(1,stopAt-Date.now());
    const response=await fetcher('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({...body,timeout:Math.min(32000,remaining)}),signal:AbortSignal.timeout(Math.min(39000,remaining))});
    registerScrapeResponse(budget,response,fetcher===fetch);
    if(response.status!==429||attempt===2)return response;
    await response.body?.cancel();
  }
}
export async function verifyMarketSources(result,{key=process.env.FIRECRAWL_API_KEY,fetcher=fetch,visionReader,saveEvidence,deadline=Infinity}={}){
  if(!key)return result;
  const stopAt=Math.min(deadline,Date.now()+250000);
  const budget=fetcher===fetch?sharedScrapeBudget:{next:0,blockedUntil:0,spacing:0};
  const groups=Object.groupBy(result.items.filter(i=>isSingleProductURL(i.url)),i=>JSON.stringify([i.product,i.platform]));
  const grouped=Object.values(groups).map(items=>{
    const ranked=[...items].sort((a,b)=>marketRank(b)-marketRank(a));
    const known=ranked.filter(i=>i.sourceType==='rechecked_source'),found=ranked.filter(i=>i.sourceType!=='rechecked_source');
    if(!known.length)return ranked.slice(0,5);
    return [...found.slice(0,4),...known].slice(0,5);
  });
  // Round-robin caps avoid giving every screenshot to the first product.
  const rounds=saveEvidence?4:result.items.some(i=>i.recheckKnownSource)?2:1;
  const targets=[0,1,2,3,4].flatMap(index=>grouped.map(xs=>xs[index]).filter(Boolean)).slice(0,Math.max(9,grouped.length*rounds));
  const screenshotTargets=new Set(saveEvidence?targets:targets.slice(0,3));
  const ocrTargets=saveEvidence?screenshotTargets:new Set(targets.slice(0,result.products?.length?Math.min(12,Math.max(3,result.products.length*2)):3));
  const proven=new Map();
  const inspect=async item=>{
    try{
      const groupKey=JSON.stringify([item.product,item.platform]);
      if(item.sourceType!=='rechecked_source'&&(proven.get(groupKey)||0)>=2)return;
      const remaining=stopAt-Date.now();
      if(remaining<300){
        item.verification={status:'not_checked',readable:false,note:'本轮核验达到等待时限，稍后可按款更新'};
        return;
      }
      const plan=result.products?.find(p=>p.name===item.product);
      const target=plan?productPlan(plan):null;
      const formats=['markdown'];
      if(!marketCoverURLs(item).length)formats.push('rawHtml');
      if(screenshotTargets.has(item))formats.push({type:'screenshot',fullPage:false,viewport:{width:1440,height:target?.companion?1500:1000}});
      const response=await scrapeListing({url:item.url,formats,onlyMainContent:false,proxy:'basic',maxAge:0},{key,fetcher,stopAt,budget});
      if(!response.ok)throw new Error(`来源核验服务 HTTP ${response.status}`);
      const data=await response.json();if(!data.success||!data.data)throw new Error();
      const page=data.data, metadata=page.metadata||{}, finalURL=metadata.url||metadata.sourceURL;
      item.verification={...inspectMarketPage(item,page),checkedAt:new Date().toISOString()};
      const finalProduct=Boolean(finalURL&&isSingleProductURL(finalURL)&&productPageKey(finalURL)===productPageKey(item.url));
      const header=listingHeader(page,item.title);
      const sourceTitle=header?.title||metadata.ogTitle||metadata['og:title']||metadata.title||page.markdown?.match(/^#\s+(.+)/m)?.[1]||'';
      const variant=matchingBundleVariant(target,header);
      const sourceSimilarity=target && sourceTitle ? productSimilarity(target,[sourceTitle,header?.details,variant?.label].filter(Boolean).join(' ')) : null;
      const conflict=incompatibleMaterial(plan,header?.details)||bundleMismatch(target,sourceSimilarity,header,!variant&&header?.priceIsFrom);
      if(conflict&&finalProduct){
        item.discoveryOnly=true;
        item.verification={status:'mismatch',readable:false,note:conflict,checkedAt:item.verification.checkedAt};
        return;
      }
      const sourceMatch=Boolean(sourceSimilarity?.score);
      if(item.discoveryOnly && !(finalProduct&&sourceMatch&&['unconfirmed','page_observed'].includes(item.verification.status)))return;
      if(plan && !item.discoveryOnly && finalProduct && !sourceMatch && sourceTitle &&
         metadata['og:type']==='product' && ['unconfirmed','page_observed'].includes(item.verification.status)){
        item.discoveryOnly=true;
        item.verification={status:'mismatch',readable:false,checkedAt:item.verification.checkedAt,note:'原页识别的商品与本款检索条件不符'};
        return;
      }
      if(item.discoveryOnly){
        delete item.discoveryOnly;
        item.title=sourceTitle.slice(0,300);
        item.similarity=sourceSimilarity;
        item.match='原页标题匹配：'+sourceSimilarity.matched.join('、');
      }
      if(variant&&finalProduct&&['unconfirmed','page_observed'].includes(item.verification.status)){
        item.variantTextEvidence=variant.label+' '+variant.priceText;
        item.priceMentions=[];
        item.verification={status:'unconfirmed',checkedAt:item.verification.checkedAt,note:'原页列有匹配的套装规格，正在核验该规格的截图标价。'};
      }
      item.verification.readable=finalProduct && ['page_observed','unconfirmed'].includes(item.verification.status) &&
        Boolean(item.verification.status==='page_observed'||sourceMatch||(!plan && sourceTitle));
      if(item.pageType==='product'&&!['blocked','redirected','unavailable'].includes(item.verification.status)){
        addCoverImages(item,pageImages(data.data,item.url),'source_page',item.url);
      }
      if(ocrTargets.has(item)&&(saveEvidence||!item.verification.price)){
        const screenshot=safeMarketURL(data.data.screenshot);
        if(['blocked','redirected','unavailable'].includes(item.verification.status))item.ocr={status:'blocked',offers:[],note:'来源被登录、验证或跳转拦截，OCR不能读取隐藏价格'};
        else if(screenshot&&stopAt>Date.now()){
          const reader=visionReader||(await import('./market-vision.mjs')).readMarketScreenshot;
          const result=await untilDeadline(stopAt,signal=>reader({screenshot,title:variant?.label||sourceTitle||item.title,product:item.product,pageType:item.pageType},{
            fetcher:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.any([signal,opts?.signal].filter(Boolean))})
          })).catch(()=>({status:'failed',offers:[],note:'在等待时限内未能核实截图价格'}));
          item.ocr={...result,sourceURL:item.url,checkedAt:new Date().toISOString()};
          const visualConflict=incompatibleMaterial(plan,item.ocr.materialEvidence);
          if(visualConflict){
            item.discoveryOnly=true;
            item.verification={status:'mismatch',readable:false,note:visualConflict,checkedAt:item.verification.checkedAt};
            return;
          }
          if(item.ocr.status==='blocked')item.verification.readable=false;
          if(finalProduct && item.ocr.status==='read' && item.ocr.offers.some(o=>o.matchesCandidate))item.verification.readable=true;
        }else item.ocr={status:'no_screenshot',offers:[],note:'抓取服务未返回可识别截图'};
      }
      if(item.ocr&&!item.ocr.checkedAt)item.ocr.checkedAt=item.verification.checkedAt;
      const visible=variant?screenshotVariant(item.ocr,variant):screenshotOffer(item.ocr,header,sourceTitle||item.title);
      const screenshot=safeMarketURL(page.screenshot);
      if(variant&&!visible&&item.variantTextEvidence){
        if(item.ocr?.status==='read')item.ocr={...item.ocr,status:'no_price',offers:[],note:'截图未同时显示所列套装规格及其对应标价。'};
        item.verification.note='原页列有匹配的套装规格，截图未确认该规格的标价。';
      }
      if(!variant&&visible&&bundleMismatch(target,sourceSimilarity,header,visible.priceIsFrom)){
        item.discoveryOnly=true;
        item.verification={status:'mismatch',readable:false,note:'页面起价无法归属到目标套装。',checkedAt:item.verification.checkedAt};
        return;
      }
      if(['marketplace','linked_detail'].includes(item.sourceType)&&item.ocr?.productImage==='placeholder'&&finalProduct){
        const reason='原页截图主图为空白或占位，画面中没有可辨认的商品实物图，外观待核。';
        item.verification.note=reason;
        item.match=reason;
        if(sourceMatch)item.similarity={...sourceSimilarity,missing:[...sourceSimilarity.missing,'商品实物外观']};
        return;
      }
      const pageMatches=!plan||sourceMatch;
      if(saveEvidence && screenshot && finalProduct && item.verification.readable && pageMatches && visible && stopAt>Date.now()){
        // Losing the evidence copy must not discard a successfully inspected source page.
        try{
          const evidence=await untilDeadline(stopAt,signal=>saveEvidence({sourceURL:item.url,finalURL,screenshot,origin:'source_page',capturedAt:item.verification.checkedAt,priceText:visible.priceText,signal}));
          if(evidence){
            item.priceEvidence=evidence;
            item.priceIsFrom=visible.priceIsFrom;
            item.priceConditions=visible.conditions;
            if(header)item.verification.excerpt=[variant?sourceTitle+'\n'+item.variantTextEvidence:header.excerpt,header.details].filter(Boolean).join('\n');
            if(sourceTitle)item.originalPageTitle=sourceTitle;
            if(sourceMatch){
              item.similarity=sourceSimilarity;
              item.match='原页商品名称与规格匹配：'+sourceSimilarity.matched.join('、');
              if(!/\.\.\.|…/.test(sourceTitle)||!sameListingTitle(item.title,sourceTitle))item.title=sourceTitle.slice(0,300);
            }
            if(item.sourceType!=='rechecked_source')proven.set(groupKey,(proven.get(groupKey)||0)+1);
          }
        }catch{ /* The report retains its text evidence. */ }
      }
      if(!item.title)item.title=String(data.data.metadata?.['og:title']||data.data.metadata?.title||item.url).slice(0,300);
    }catch(error){item.verification={status:error.name==='TimeoutError'?'not_checked':'failed',readable:false,note:/^来源核验服务 HTTP \d+$/.test(error.message)?error.message:'原页面核验失败或超时，保留为搜索线索',checkedAt:new Date().toISOString()};}
  };
  // Give unfilled product/platform pairs first use of the next candidate round.
  const selected=new Set(targets),priority=i=>proven.get(JSON.stringify([i.product,i.platform]))||0;
  for(let position=0;position<5;position++){
    const round=grouped.map(xs=>xs[position]).filter(i=>selected.has(i));
    await pooled(round.filter(i=>i.sourceType!=='rechecked_source').sort((a,b)=>priority(a)-priority(b)),6,inspect);
  }
  await pooled(targets.filter(i=>i.sourceType==='rechecked_source'),3,inspect);
  if(result.searches){
    const hidden=result.items.filter(i=>i.discoveryOnly);
    const regrouped=excludeAmbiguousProducts(result.searches.map(row=>({...row,items:result.items.filter(i=>i.product===row.product&&i.platform===row.platform&&!i.discoveryOnly)})));
    result.items=[...regrouped.flatMap(row=>row.items),...hidden];
    updateCoverage(result);
    result.items=result.items.filter(i=>!i.discoveryOnly);
    return result;
  }
  return updateCoverage(result);
}
export async function inspectProductLinks(urls,product,options={}){
  const capturedAt=new Date().toISOString();
  if(urls.some(url=>!isSingleProductURL(url)))throw new Error('仅支持1688或淘宝的公开商品链接');
  const result={items:[...new Set(urls)].map(url=>{
    const platform=PLATFORMS.find(p=>safeMarketURL(url,p.domain));
    return {product,url,platform:platform.name,title:'',sourceType:'open_web',kind:platform.kind,pageType:'product',snippet:'买方提供的公开商品链接',priceMentions:[],capturedAt,match:'公开商品链接 · 是否可替代需核对'};
  })};
  return (await verifyMarketSources(result,options)).items;
}

// Spend the remaining request time on product/platform pairs without any fresh
// screenshot. A deeper search must not reopen a detail page that already gated
// the first pass or replace a previously saved proof.
export async function researchMarket(targets,options={},previous){
  const {deadline=Date.now()+250000}=options;
  const first=await searchMarket(targets,{...options,deadline});
  const comparison=includeKnownSources(first,previous,targets);
  const originalItems=[...comparison.items];
  await verifyMarketSources(comparison,{...options,deadline});
  if(!options.saveEvidence||!['completed','partial'].includes(first.status)||Date.now()+20000>=deadline)return comparison;
  const missing=comparison.searches.filter(row=>!row.automaticProofCount && !row.error && row.status!=='failed');
  if(!missing.length)return comparison;
  const keyOf=item=>JSON.stringify([item.product,productPageKey(item.url)]);
  const attempted=new Set(originalItems.filter(i=>i.verification && i.verification.status!=='not_checked').map(keyOf));
  const items=new Map(comparison.items.map(i=>[keyOf(i),i]));
  for(const platform of PLATFORMS){
    const names=new Set(missing.filter(s=>s.platform===platform.name).map(s=>s.product));
    if(!names.size||Date.now()+20000>=deadline)continue;
    const subset=targets.filter(p=>names.has(p.name||p));
    const extra=await searchMarket(subset,{...options,deadline,depth:'extended',platformIds:[platform.id]});
    const candidates=new Map();
    for(const item of [...originalItems,...extra.items]){
      const key=keyOf(item);
      if(names.has(item.product)&&item.platform===platform.name&&!attempted.has(key)&&item.sourceType!=='rechecked_source'){
        candidates.set(key,{...item,capturedAt:first.capturedAt});
      }
    }
    const supplemental=await verifyMarketSources({...extra,items:[...candidates.values()]},{...options,deadline});
    for(const item of supplemental.items){
      const key=keyOf(item),old=items.get(key);
      if(!old?.priceEvidence && (!old||item.verification?.status!=='not_checked'))items.set(key,item);
    }
    for(const next of supplemental.searches){
      const row=comparison.searches.find(s=>s.product===next.product&&s.platform===next.platform);
      if(!row)continue;
      row.queries=[...new Set([...row.queries,...next.queries])];
      const seen=new Set([...originalItems,...extra.items].filter(i=>i.product===row.product&&i.platform===row.platform&&i.sourceType!=='rechecked_source').map(keyOf));
      row.directCount=Math.max(row.directCount,next.directCount,seen.size);
      if(next.error){
        row.status='partial';
        row.error=next.error;
        comparison.status='partial';
      }
    }
  }
  const grouped=comparison.searches.map(s=>({...s,items:[...items.values()].filter(i=>i.product===s.product&&i.platform===s.platform)}));
  comparison.items=excludeAmbiguousProducts(grouped).flatMap(row=>row.items);
  return updateCoverage(comparison);
}
// The search API receives only public terms. Its raw result counts are kept separate from usable matches.
async function pooled(values,limit,work){
  const output=new Array(values.length);
  let next=0;
  async function worker(){
    while(next<values.length){
      const index=next++;
      output[index]=await work(values[index]);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,values.length)},worker));
  return output;
}
function canonicalOffer(url){
  // The official mobile index carries short-lived navigation parameters. Both detail routes
  // identify an offer by the same numeric ID; preserve a specific SKU when present.
  const [domain,id,variant]=productPageKey(url).split('/');
  return domain==='1688'?`https://detail.1688.com/offer/${id}.html${variant?'?skuId='+variant:''}`:url;
}
function addSearchResults(data,candidates,direct,plan,platform,capturedAt,discoveryQuery){
  function add(hit,imageHit){
    const discoveryURL=safeMarketURL(hit.url,platform.domain);
    if(!discoveryURL||!isSingleProductURL(discoveryURL))return;
    const url=canonicalOffer(discoveryURL);
    const id=productPageKey(url);
    direct.add(id);
    const existing=candidates.get(id);
    const images=[...pageImages(hit,url),hit.imageUrl,hit.thumbnailUrl];
    const title=String(hit.title||'').slice(0,300),snippet=String(hit.description||'').slice(0,1500);
    const titleMatch=productSimilarity(plan,title);
    const hints=[indexedPackageMatch(plan,title,snippet),indexedBodyMatch(plan,title,snippet)].filter(Boolean);
    const hint=hints.sort((a,b)=>b.score-a.score)[0];
    const optionOnly=Boolean(hint&&hint.score>titleMatch.score);
    const similarity=optionOnly?hint:titleMatch;
    const previousScore=existing?.similarity?.score||0;
    if(existing&&(previousScore>similarity.score||(!existing.discoveryOnly&&previousScore===similarity.score))){
      addCoverImages(existing,[...marketCoverURLs(existing),...images],'search_index',existing.imageSourceURL||url);
      return;
    }
    if(!plan.legacy&&!similarity.score)return;
    if(imageHit&&!images.some(marketImageURL))return;
    const priceMentions=imageHit?[]:[...new Set((title+' '+snippet).match(/(?:[$¥￥]\s*\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s*元)/g)||[])].slice(0,5);
    const candidate={product:plan.name,platform:platform.name,sourceType:'marketplace',kind:platform.kind,title:title||'商品图片',
      url,snippet,priceMentions,capturedAt,discoveryQuery,discoveryURL,pageType:'product',match:similarity.matched.length?'标题匹配：'+similarity.matched.join('、'):'规格待核对'};
    if(!plan.legacy)candidate.similarity=similarity;
    if(optionOnly){
      candidate.discoveryOnly=true;
      candidate.priceMentions=[];
      candidate.match='搜索索引提及规格或组合选项，待单品原页核对';
    }
    addCoverImages(candidate,images,'search_index',url);
    candidates.set(id,candidate);
  }
  for(const hit of data.web||[])add(hit,false);
  for(const hit of data.images||[])add(hit,true);
}
function discoverProductLinks(data,candidates,direct,plan,platform,capturedAt,discoveryQuery){
  for(const hit of (data.web||[]).slice(0,10)){
    const cited=String(hit.description||'').match(/https?:\/\/[^\s<>"'()（）【】，。；]+/gi)||[];
    const links=[...(Array.isArray(hit.links)?hit.links.slice(0,100):[]),...cited];
    for(const link of links){
      if(typeof link!=='string')continue;
      const linkedURL=safeMarketURL(link.replace(/&amp;/g,'&'),platform.domain);
      if(!linkedURL||!isSingleProductURL(linkedURL))continue;
      const url=canonicalOffer(linkedURL);
      const id=productPageKey(url);
      direct.add(id);
      if(candidates.has(id)||candidates.size>=6)continue;
      // Search pages and third parties provide navigation only. Their text, prices and photos
      // never become product evidence. Scrape the linked, official detail page before display.
      candidates.set(id,{product:plan.name,platform:platform.name,kind:platform.kind,sourceType:'linked_detail',
        discoveryOnly:true,url,discoveryQuery,discoveryURL:safeMarketURL(hit.url)||linkedURL,title:'',pageType:'product',priceMentions:[],capturedAt});
    }
  }
}
function excludeAmbiguousProducts(searches){
  const assignments=Object.groupBy(searches.flatMap(s=>s.items).filter(i=>i.similarity),i=>productPageKey(i.url));
  const ambiguous=new Set();
  for(const entries of Object.values(assignments)){
    if(entries.length<2)continue;
    for(const item of entries){
      const rivals=entries.filter(other=>other.product!==item.product);
      const distinctive=item.similarity.matched.some(term=>rivals.every(other=>
        !other.product.normalize('NFKC').toLowerCase().includes(term)&&!other.similarity.matched.some(shared=>shared.includes(term))));
      if(rivals.length&&!distinctive)ambiguous.add(item);
    }
  }
  return searches.map(row=>({...row,items:row.items.filter(item=>!ambiguous.has(item))}));
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function searchPacer(fetcher,stopAt){
  let next=0,limitedUntil=0;
  // Space real provider requests, including parallel SKU probes. A 429 pauses the whole queue.
  const spacing=fetcher===fetch?1300:0;
  return {
    async wait(){
      for(;;){
        const now=Date.now(),start=Math.max(now,next,limitedUntil);
        if(start+250>=stopAt)throw new Error(limitedUntil>now?'检索服务限流':'本轮检索达到等待时限');
        if(start===now){next=now+spacing;return;}
        await delay(start-now);
      }
    },
    limit(response){
      const raw=response.headers?.get?.('retry-after');
      const seconds=raw==null?NaN:Number(raw);
      const retryMs=Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-Date.now();
      limitedUntil=Math.max(limitedUntil,Date.now()+(Number.isFinite(retryMs)?Math.max(0,retryMs):spacing*5));
    }
  };
}
async function searchRequest(query,discovery,{key,fetcher,pacer,stopAt,legacy,limit}){
  for(let attempt=0;attempt<2;attempt++){
    await pacer.wait();
    const remaining=Math.max(1,stopAt-Date.now());
    const response=await fetcher('https://api.firecrawl.dev/v2/search',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({query,sources:legacy?['web','images']:['web'],limit:discovery?4:limit,timeout:Math.min(13500,remaining),...(discovery?{scrapeOptions:{formats:['links'],proxy:'basic'}}:{})}),
      signal:AbortSignal.timeout(Math.min(15500,remaining))});
    if(response.status===429){
      pacer.limit(response);
      if(attempt===0)continue;
      throw new Error('检索服务限流');
    }
    if(!response.ok)throw new Error('检索服务 HTTP '+response.status);
    const data=await response.json();
    if(data.success===false||(!Array.isArray(data.data?.web)&&!Array.isArray(data.data?.images)))throw new Error('检索服务返回格式异常');
    return data.data;
  }
}
export async function searchMarket(inputs,{key=process.env.FIRECRAWL_API_KEY,fetcher=fetch,deadline=Infinity,depth,platformIds}={}){
  const legacy=inputs.every(p=>typeof p==='string');
  const plans=[...new Map(inputs.map(productPlan).filter(p=>p.name).map(p=>[p.name,p])).values()].slice(0,legacy?3:12);
  const now=Date.now(),capturedAt=new Date(now).toISOString(),queries=plans.map(p=>p.name);
  const products=plans.map(({name,keyword,attributes})=>({name,keyword,attributes}));
  const base={version:2,capturedAt,queries,products,searches:[],items:[]};
  if(!plans.length)return {...base,status:'needs_product',note:'尚未识别供应商产品，请填写公开产品名称后检索。'};
  const stopAt=now+Math.min(110000,Math.max(0,Math.floor((deadline-now)*0.45)));
  const pacer=searchPacer(fetcher,stopAt);
  const extended=depth==='extended'||depth==='body'||(plans.length===1&&Boolean(plans[0].companion));
  const platforms=platformIds?PLATFORMS.filter(p=>platformIds.includes(p.id)):PLATFORMS;
  if(!platforms.length)throw new Error('未选择支持的市场平台');
  const pairs=plans.flatMap(plan=>platforms.map(platform=>{
    const primary=plan.queries[0],fallback=plan.queries[1]||primary;
    const directSite=platform.id==='1688'?'m.1688.com/offer/':'taobao.com/list/item/';
    const prefix=platform.id==='1688'?'detail.1688.com/offer/':'taobao.com/list/item/';
    const companion=plan.companion;
    const bodyOnly=depth==='body'&&plan.bodyQueries.length>0;
    const giftQueries=bodyOnly?plan.bodyQueries:[...plan.queries.slice(0,2),...(extended?plan.packageQueries:[]),
      ...(extended?plan.bodyQueries:[]),...plan.queries.slice(2)];
    const attempts=legacy?[{query:'site:'+platform.domain+' '+primary}]:companion?[
      ...[...new Set(giftQueries)].map(q=>({query:'site:'+directSite+' '+q})),
      ...(bodyOnly?[]:[{query:primary+' "'+prefix+'"',discovery:true}])
    ]:[
      {query:'site:'+directSite+' '+primary},
      {query:(primary===fallback?'site:'+platform.domain:'site:'+directSite)+' '+fallback},
      {query:'site:'+platform.domain+' '+(plan.queries[2]||primary)},
      {query:fallback+' "'+prefix+'"',discovery:true}
    ];
    const size=plan.attributes.find(t=>/^\d+(?:\.\d+)?(?:ml|oz|g|kg)$/.test(t));
    return {plan,platform,companion,bodyOnly,size,attempts,found:new Map(),direct:new Set(),queries:[],completed:0,error:''};
  }));
  if(key){
    // Two distinct supplier SKUs can share a public query. Fetch it once, then apply each
    // SKU's own similarity checks. Retry transient failures on a later request.
    const responses=new Map();
    function queryOnce(query,discovery){
      const cacheKey=JSON.stringify([query,discovery]);
      if(!responses.has(cacheKey)){
        const request=searchRequest(query,discovery,{key,fetcher,pacer,stopAt,legacy,limit:extended?25:12})
          .catch(error=>{responses.delete(cacheKey);throw error;});
        responses.set(cacheKey,request);
      }
      return responses.get(cacheKey);
    }
    // Finish the first pass for all SKU/platform pairs before the first fallback query.
    const passes=Math.max(...pairs.map(p=>p.attempts.length));
    for(let pass=0;pass<passes;pass++){
      const pending=pairs.filter(p=>{
        const attempt=p.attempts[pass];
        if(!attempt||Date.now()>=stopAt||p.queries.includes(attempt.query))return false;
        const hits=[...p.found.values()].filter(i=>!i.discoveryOnly);
        if(p.bodyOnly)return hits.filter(i=>i.similarity?.matched.includes(p.size)).length<16;
        if(p.companion){
          const exact=hits.filter(i=>i.similarity?.matched.includes(p.companion)).length;
          const related=hits.filter(i=>i.similarity?.matched.some(t=>t.includes('与目标丝巾的材质待核'))).length;
          return exact<(extended?6:2)&&exact+related<(extended?10:4);
        }
        if(hits.length<3)return true;
        return Boolean(p.size&&!hits.some(i=>i.similarity?.matched.includes(p.size)));
      });
      await pooled(pending,5,async p=>{
        const {query:scoped,discovery=false}=p.attempts[pass];
        try{
          p.queries.push(scoped);
          const data=await queryOnce(scoped,discovery);
          p.completed++;
          addSearchResults(data,p.found,p.direct,p.plan,p.platform,capturedAt,scoped);
          if(!legacy)discoverProductLinks(data,p.found,p.direct,p.plan,p.platform,capturedAt,scoped);
        }catch(e){
          p.error=e.name==='TimeoutError'?'检索超时':e.message;
        }
      });
    }
  }
  for(const pair of pairs)if(key&&!pair.completed&&!pair.error)pair.error='本轮检索达到等待时限';
  const raw=pairs.map(p=>({
    product:p.plan.name,platform:p.platform.name,capturedAt,queries:p.queries,directCount:p.direct.size,
    matchedCount:0,readableCount:0,verifiedPriceCount:0,blockedCount:0,
    status:!key?'not_configured':p.error?(p.completed?'partial':'failed'):'empty',
    reason:key?p.error:'自动检索尚未配置',error:p.error||undefined,
    items:[...p.found.values()].filter(i=>!p.bodyOnly||i.similarity?.matched.includes(p.size)).sort((a,b)=>marketRank(b)-marketRank(a)).slice(0,extended?16:6)
  }));
  const searches=excludeAmbiguousProducts(raw);
  const status=!key?'not_configured':searches.every(s=>s.status==='failed')?'failed':searches.some(s=>s.error)?'partial':'completed';
  return updateCoverage({...base,status,searches:searches.map(({items,...s})=>s),items:searches.flatMap(s=>s.items),note:'仅展示1688和淘宝公开单品详情链接；搜到相似线索、读到标价和核实采购条件分别统计。'});
}
