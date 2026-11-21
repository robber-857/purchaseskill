import {z} from 'zod';

export const PLATFORMS = [
  {id:'1688',name:'1688',domain:'1688.com',kind:'批发线索'},
  {id:'taobao',name:'淘宝',domain:'taobao.com',kind:'零售线索'},
];
export function safeMarketURL(value,domain){
  try {const u=new URL(value);const host=u.hostname;for(const key of [...u.searchParams.keys()])if(/^(utm_|srsltid$|spm$|ad_od$)/.test(key))u.searchParams.delete(key);u.hash='';return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&host.includes('.')&&!/^[\d.]+$|[:\[\]]|(?:^|\.)(?:localhost|local|internal)$/.test(host)&&(!domain||host===domain||host.endsWith('.'+domain))?u.href:null;}catch{return null;}
}
export function isChinaMarketURL(url){return PLATFORMS.some(p=>Boolean(safeMarketURL(url,p.domain)));}
export function isSingleProductURL(url){try{return isChinaMarketURL(url)&&marketPageType(url)==='product';}catch{return false;}}
export function singlePrice(values=[]){const prices=[...new Set(values.map(x=>String(x).trim()).filter(x=>/^(?:CNY|[¥￥])\s*\d[\d,]*(?:\.\d{1,2})?$|^\d[\d,]*(?:\.\d{1,2})?\s*元$/.test(x)))];return prices.length&&new Set(prices.map(p=>Number(p.replace(/[^0-9.]/g,'')))).size===1?prices[0]:null;}
export function marketRank(item){return (item.verification?.price?100:0)+(item.ocr?.offers?.length?70:0)+(item.priceMentions?.length?40:0)+(item.pageType==='product'?10:0)+(item.imageUrl?5:0);}
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
  const sku=page.searchParams.get('skuId')||page.searchParams.get('sku_id')||'';
  const offer=page.hostname==='detail.1688.com'&&page.pathname.match(/^\/offer\/(\d+)\.html\/?$/);
  if(offer)return '1688/'+offer[1]+'/'+sku;
  const id=(/^(item|detail)\.taobao\.com$/.test(page.hostname)&&page.pathname==='/item.htm'&&page.searchParams.get('id'))
    ||(page.hostname==='www.taobao.com'&&page.pathname.match(/^\/list\/item\/(\d+)\.htm(?:l)?\/?$/)?.[1]);
  if(id&&/^\d+$/.test(id))return 'taobao/'+id+'/'+sku;
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
  return {...m,items:(m.items||[]).filter(i=>isSingleProductURL(i.url)&&!['redirected','listing'].includes(i.verification?.status)&&(!i.verification?.currency||i.verification.currency==='CNY')),offers:(m.offers||[]).filter(o=>isChinaMarketURL(o.url)&&o.currency==='CNY'),baseline:m.baseline?.currency==='CNY'?m.baseline:null,searches:(m.searches||[]).filter(s=>PLATFORMS.some(p=>p.name===s.platform)),note:'仅检索1688和淘宝公开内容，不登录。保留商品链接、价格原文及获取时间；仅展示单品链接；每个商品只展示一个有依据的价格，无法确定规格或价格时不猜测。'};
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
  if(/^\/products\/[^/]+\/?$|^\/product-page\/[^/]+\/?$/.test(u.pathname))return 'product';
  if(/^(item|detail)\.taobao\.com$/.test(u.hostname)&&u.pathname==='/item.htm'&&/^\d+$/.test(u.searchParams.get('id')||''))return 'product';
  return /\/offer\/|\/list\/item\/|\/product\/\d+|\/\d+\.html/.test(u.pathname)&&/^(detail\.1688|item(?:\.m)?\.jd|www\.taobao)\.com$/.test(u.hostname)?'product':'listing';
}
export function inspectMarketPage(item,data){
  const markdown=String(data?.markdown||'');
  const finalURL=data?.metadata?.url||item.url;
  if(data?.metadata?.statusCode>=400)return {status:'unavailable',note:'来源页面返回错误，价格未核实'};
  if(/captcha|slider to verify|滑块验证|登录查看价格|登录后可查看商品到手价|密码登录短信登录|下载APP前往抢购/i.test(markdown)||/login\.|\/download(?:\?|$)/.test(finalURL))return {status:'blocked',note:'来源要求登录、验证码或 App，未核实商品价格'};
  if(new URL(finalURL).origin!==new URL(item.url).origin||new URL(finalURL).pathname!==new URL(item.url).pathname||['id','itemId'].some(k=>new URL(item.url).searchParams.has(k)&&new URL(item.url).searchParams.get(k)!==new URL(finalURL).searchParams.get(k)))return {status:'redirected',note:'来源跳转到其他页面，不能确认该商品价格'};
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
export async function verifyMarketSources(result,{key=process.env.FIRECRAWL_API_KEY,fetcher=fetch,visionReader}={}){
  if(!key)return result;
  const groups=Object.groupBy(result.items.filter(i=>isSingleProductURL(i.url)),i=>i.product);
  const grouped=Object.values(groups).map(items=>[...items].sort((a,b)=>marketRank(b)-marketRank(a)).slice(0,5));
  // Round-robin caps avoid giving every screenshot to the first product.
  const targets=[0,1,2,3,4].flatMap(index=>grouped.map(xs=>xs[index]).filter(Boolean)).slice(0,9);
  const screenshotTargets=new Set(targets.slice(0,3));
  await Promise.all(targets.map(async item=>{
    try{
      const formats=['markdown'];
      if(!marketCoverURLs(item).length)formats.push('rawHtml');
      if(screenshotTargets.has(item))formats.push({type:'screenshot',fullPage:true,viewport:{width:1440,height:1000}});
      const response=await fetcher('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({url:item.url,formats,onlyMainContent:true,maxAge:0,timeout:20000}),signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new Error(`来源核验服务 HTTP ${response.status}`);
      const data=await response.json();if(!data.success||!data.data)throw new Error();
      item.verification={...inspectMarketPage(item,data.data),checkedAt:new Date().toISOString()};
      if(item.pageType==='product'&&!['blocked','redirected','unavailable'].includes(item.verification.status)){
        addCoverImages(item,pageImages(data.data,item.url),'source_page',item.url);
      }
      if(screenshotTargets.has(item)&&!item.verification.price){
        const screenshot=safeMarketURL(data.data.screenshot);
        if(['blocked','redirected','unavailable'].includes(item.verification.status))item.ocr={status:'blocked',offers:[],note:'来源被登录、验证或跳转拦截，OCR不能读取隐藏价格'};
        else if(screenshot){
          const reader=visionReader||(await import('./market-vision.mjs')).readMarketScreenshot;
          item.ocr={...await reader({screenshot,title:item.title,product:item.product,pageType:item.pageType,referenceImage:marketImageURL(item.imageUrl)}),sourceURL:item.url,screenshotURL:screenshot,checkedAt:new Date().toISOString()};
        }else item.ocr={status:'no_screenshot',offers:[],note:'抓取服务未返回可识别截图'};
      }
      if(item.ocr&&!item.ocr.checkedAt)item.ocr.checkedAt=item.verification.checkedAt;
      if(!item.title)item.title=String(data.data.metadata?.['og:title']||data.data.metadata?.title||item.url).slice(0,300);
    }catch(error){item.verification={status:'failed',note:/^来源核验服务 HTTP \d+$/.test(error.message)?error.message:'原页面核验失败或超时，保留为搜索线索',checkedAt:new Date().toISOString()};}
  }));
  return result;
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
// Search receives only a public product keyword, never the manifest, buyer files or context.
export async function searchMarket(keywords,{key=process.env.FIRECRAWL_API_KEY,fetcher=fetch}={}){
  const queries=[...new Set(keywords.map(x=>String(x).trim().slice(0,100)).filter(Boolean))].slice(0,3);
  const capturedAt=new Date().toISOString();
  if(!queries.length)return {status:'needs_product',capturedAt,queries,searches:[],items:[],note:'尚未识别供应商产品，请填写公开产品名称后检索。'};
  if(!key)return {status:'not_configured',capturedAt,queries,searches:[],items:[],note:'自动检索尚未配置。可打开平台限定搜索并补录已核对报价。'};
  const providers=PLATFORMS;
  const searches=await Promise.all(queries.flatMap(product=>providers.map(async platform=>{
    try {
      const response=await fetcher('https://api.firecrawl.dev/v2/search',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({query:platform.domain?`site:${platform.domain} ${product} 价格`:`${product} price`,sources:['web','images'],limit:10,timeout:15000}),signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(`检索服务 HTTP ${response.status}`);
      const data=await response.json();if(data.success===false||(!Array.isArray(data.data?.web)&&!Array.isArray(data.data?.images)))throw new Error('检索服务返回格式异常');
      const candidates=new Map();
      const items=(data.data.web||[]).flatMap(item=>{
        const url=safeMarketURL(item.url,platform.domain);if(!url||!isSingleProductURL(url))return [];
        const sourceKey=productPageKey(url);
        if(candidates.has(sourceKey))return [];
        const title=String(item.title||'未命名结果').slice(0,300),snippet=String(item.description||'').slice(0,1500);
        // Preserve raw evidence rather than turning ambiguous promotional prices into offers.
        const priceMentions=[...new Set((title+' '+snippet).match(/(?:[$¥￥]\s*\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s*元)/g)||[])].slice(0,5);
        const pageType=marketPageType(url);
        const candidate={product,platform:platform.name,sourceType:'marketplace',kind:platform.kind,title,url,snippet,priceMentions,capturedAt,pageType,match:'商品候选 · 规格未核验'};
        addCoverImages(candidate,[...pageImages(item,url),item.imageUrl,item.thumbnailUrl],'search_index',url);
        candidates.set(sourceKey,candidate);
        return [candidate];
      });
      for(const found of data.data.images||[]){
        const url=safeMarketURL(found.url,platform.domain);
        const images=[found.imageUrl,found.thumbnailUrl].map(marketImageURL).filter(Boolean);
        if(!url||!isSingleProductURL(url)||!images.length)continue;
        const sourceKey=productPageKey(url);
        const existing=candidates.get(sourceKey);
        if(existing){
          addCoverImages(existing,[...marketCoverURLs(existing),...images],'search_index',existing.imageSourceURL||url);
          continue;
        }
        const candidate={product,platform:platform.name,sourceType:'marketplace',kind:platform.kind,title:String(found.title||'商品图片').slice(0,300),url,snippet:'请打开商品页核对规格与价格。',priceMentions:[],capturedAt,pageType:'product',match:'图片搜索结果 · 规格待核对'};
        addCoverImages(candidate,images,'search_index',url);
        candidates.set(sourceKey,candidate);
        items.push(candidate);
      }
      items.sort((a,b)=>marketRank(b)-marketRank(a));
      return {product,platform:platform.name,status:items.length?'found':'empty',items:items.slice(0,6)};
    }catch(error){return {product,platform:platform.name,status:'failed',error:error.name==='TimeoutError'?'检索超时':error.message,items:[]};}
  })));
  return {status:searches.every(s=>s.status==='failed')?'failed':searches.some(s=>s.status==='failed')?'partial':'completed',capturedAt,queries,searches:searches.map(({items,...s})=>s),items:searches.flatMap(s=>s.items),note:'公开搜索索引线索，非平台成交价或实时库存；相似性、规格、价格及税运需打开来源复核。登录、验证码或未收录可能导致无结果。'};
}
