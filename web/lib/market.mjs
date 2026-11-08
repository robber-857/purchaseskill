import {z} from 'zod';

export const PLATFORMS = [
  {id:'1688',name:'1688',domain:'1688.com',kind:'批发线索'},
  {id:'taobao',name:'淘宝',domain:'taobao.com',kind:'零售线索'},
];
export function safeMarketURL(value,domain){
  try {const u=new URL(value);const host=u.hostname;for(const key of [...u.searchParams.keys()])if(/^(utm_|srsltid$|spm$|ad_od$)/.test(key))u.searchParams.delete(key);u.hash='';return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&host.includes('.')&&!/^[\d.]+$|[:\[\]]|(?:^|\.)(?:localhost|local|internal)$/.test(host)&&(!domain||host===domain||host.endsWith('.'+domain))?u.href:null;}catch{return null;}
}
export function isChinaMarketURL(url){return PLATFORMS.some(p=>Boolean(safeMarketURL(url,p.domain)));}
export function chinaMarketComparison(m){
  if(!m)return m;
  return {...m,items:(m.items||[]).filter(i=>isChinaMarketURL(i.url)&&(!i.verification?.currency||i.verification.currency==='CNY')),offers:(m.offers||[]).filter(o=>isChinaMarketURL(o.url)&&o.currency==='CNY'),baseline:m.baseline?.currency==='CNY'?m.baseline:null,searches:(m.searches||[]).filter(s=>PLATFORMS.some(p=>p.name===s.platform)),note:'仅检索1688和淘宝公开内容，不登录。保留商品链接、价格原文及获取时间；搜索摘要或聚合页金额仅作线索，不等于最终成交报价。'};
}
const text=z.string().trim().max(300);
const positive=z.number().finite().positive().max(1e9);
export const OfferSchema=z.object({
  product:text.min(1),platform:z.enum(PLATFORMS.map(p=>p.name)),title:text.min(1),url:z.string().max(2000),
  seller:text,model:text,kind:z.enum(['批发','零售']),price:positive,currency:z.literal('CNY'),unit:text.min(1),
  moq:positive,quantity:positive,taxShippingIncluded:z.boolean(),sameSpecification:z.boolean(),
  delivery:text,afterSales:text,conditions:text,observedAt:z.string().date(),
}).superRefine((o,ctx)=>{const p=PLATFORMS.find(p=>p.name===o.platform);if(!safeMarketURL(o.url,p.domain))ctx.addIssue({code:'custom',message:'请提供对应平台的 HTTPS 商品链接',path:['url']});});
export const MarketInputSchema=z.object({
  sourceUrls:z.array(z.string().max(2000).refine(x=>isChinaMarketURL(x),'仅支持1688或淘宝的公开商品链接').transform(x=>safeMarketURL(x))).min(1).max(4).optional(),
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
  return /\/offer\/|\/list\/item\/|\/product\/\d+|\/\d+\.html/.test(u.pathname)&&/^(detail\.1688|item(?:\.m)?\.jd|www\.taobao)\.com$/.test(u.hostname)?'product':'listing';
}
export function inspectMarketPage(item,data){
  const markdown=String(data?.markdown||'');
  const finalURL=data?.metadata?.url||item.url;
  if(data?.metadata?.statusCode>=400)return {status:'unavailable',note:'来源页面返回错误，价格未核实'};
  if(/captcha|slider to verify|滑块验证|登录查看价格|登录后可查看商品到手价|密码登录短信登录|下载APP前往抢购/i.test(markdown)||/login\.|\/download(?:\?|$)/.test(finalURL))return {status:'blocked',note:'来源要求登录、验证码或 App，未核实商品价格'};
  if(new URL(finalURL).origin!==new URL(item.url).origin||new URL(finalURL).pathname!==new URL(item.url).pathname)return {status:'redirected',note:'来源跳转到其他页面，不能确认该商品价格'};
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
  const price=item.priceMentions.find(p=>compact(markdown).includes(compact(p)));
  if(title.length>=4&&compact(markdown).includes(title)&&price)return {status:'page_observed',note:'商品页可见标题与索引金额；具体 SKU、优惠资格及结算价仍需核对',price,excerpt:markdown.slice(Math.max(0,markdown.indexOf(price)-120),markdown.indexOf(price)+200)};
  return {status:'unconfirmed',note:'未在原页面同时确认商品标题和索引金额'};
}
export async function verifyMarketSources(result,{key=process.env.FIRECRAWL_API_KEY,fetcher=fetch}={}){
  const targets=result.items.filter(i=>isChinaMarketURL(i.url)&&i.pageType==='product').sort((a,b)=>(Number(b.sourceType==='open_web')-Number(a.sourceType==='open_web'))||b.priceMentions.length-a.priceMentions.length).slice(0,4);
  await Promise.all(targets.map(async item=>{
    try{
      const response=await fetcher('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({url:item.url,formats:['markdown'],onlyMainContent:true,maxAge:0,timeout:20000}),signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new Error(`来源核验服务 HTTP ${response.status}`);
      const data=await response.json();if(!data.success||!data.data)throw new Error();
      item.verification={...inspectMarketPage(item,data.data),checkedAt:new Date().toISOString()};
      if(!item.title)item.title=String(data.data.metadata?.['og:title']||data.data.metadata?.title||item.url).slice(0,300);
    }catch(error){item.verification={status:'failed',note:/^来源核验服务 HTTP \d+$/.test(error.message)?error.message:'原页面核验失败或超时，保留为搜索线索',checkedAt:new Date().toISOString()};}
  }));
  return result;
}
export async function inspectProductLinks(urls,product,options={}){
  const capturedAt=new Date().toISOString();
  if(urls.some(url=>!isChinaMarketURL(url)))throw new Error('仅支持1688或淘宝的公开商品链接');
  const result={items:[...new Set(urls)].map(url=>({product,url,platform:new URL(url).hostname,title:'',sourceType:'open_web',kind:'零售市场参考',pageType:marketPageType(url),snippet:'买方提供的公开商品链接',priceMentions:[],capturedAt,match:'公开商品链接 · 是否可替代需核对'}))};
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
      const response=await fetcher('https://api.firecrawl.dev/v2/search',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({query:platform.domain?`site:${platform.domain} ${product} 价格`:`${product} price`,sources:['web'],limit:platform.domain?3:6,timeout:15000}),signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(`检索服务 HTTP ${response.status}`);
      const data=await response.json();if(data.success===false||!Array.isArray(data.data?.web))throw new Error('检索服务返回格式异常');
      const seen=new Set();
      const items=data.data.web.flatMap(item=>{
        const url=safeMarketURL(item.url,platform.domain);if(!url||seen.has(url))return [];seen.add(url);
        const title=String(item.title||'未命名结果').slice(0,300),snippet=String(item.description||'').slice(0,1500);
        // Preserve raw evidence rather than turning ambiguous promotional prices into offers.
        const priceMentions=[...new Set((title+' '+snippet).match(/(?:[$¥￥]\s*\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s*元)/g)||[])].slice(0,5);
        const pageType=marketPageType(url);
        return [{product,platform:platform.domain?platform.name:new URL(url).hostname,sourceType:platform.domain?'marketplace':'open_web',kind:platform.kind,title,url,snippet,priceMentions,capturedAt,pageType,match:pageType==='product'?'商品候选 · 规格未核验':'聚合 / 推广页线索 · 非单个商品报价'}];
      });
      return {product,platform:platform.name,status:items.length?'found':'empty',items};
    }catch(error){return {product,platform:platform.name,status:'failed',error:error.name==='TimeoutError'?'检索超时':error.message,items:[]};}
  })));
  return {status:searches.every(s=>s.status==='failed')?'failed':searches.some(s=>s.status==='failed')?'partial':'completed',capturedAt,queries,searches:searches.map(({items,...s})=>s),items:searches.flatMap(s=>s.items),note:'公开搜索索引线索，非平台成交价或实时库存；相似性、规格、价格及税运需打开来源复核。登录、验证码或未收录可能导致无结果。'};
}
