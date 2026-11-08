import test from 'node:test';
import assert from 'node:assert/strict';
import {searchMarket,compareOffers,MarketInputSchema,safeMarketURL,chinaMarketComparison,marketPageType,inspectMarketPage} from '../lib/market.mjs';
import {marketHTML} from '../src/market-report.js';
import {supplierSnapshot} from '../lib/contracts.mjs';
import {reportHTML} from '../src/report.js';
const baseline={product:'企鹅',price:100,currency:'CNY',unit:'件',quantity:100,taxShippingIncluded:true};
const offer={product:'企鹅',platform:'1688',title:'企鹅对照款',url:'https://detail.1688.com/offer/123.html',seller:'商家',model:'同规格',kind:'批发',price:80,currency:'CNY',unit:'件',moq:50,quantity:100,taxShippingIncluded:true,sameSpecification:true,delivery:'7天',afterSales:'待确认',conditions:'无促销',observedAt:'2026-11-08'};
test('source verification rejects login, captcha, redirects, listings and hidden product prices',()=>{
  const item={url:'https://item.jd.com/123.html',title:'304不锈钢保温杯500ml',pageType:'product',priceMentions:['￥69.00']};
  assert.equal(marketPageType('https://s.1688.com/kq/cup.html'),'listing');
  assert.equal(marketPageType(item.url),'product');
  for(const markdown of ['CAPTCHA Verification','登录查看价格 运费 ￥0.00','下载APP前往抢购'])assert.equal(inspectMarketPage(item,{markdown}).status,'blocked');
  assert.equal(inspectMarketPage(item,{markdown:item.title+' ￥69.00',metadata:{url:'https://www.jd.com/'}}).status,'redirected');
  assert.equal(inspectMarketPage({...item,pageType:'listing'},{markdown:item.title+' ￥69.00'}).status,'listing');
  assert.equal(inspectMarketPage(item,{markdown:'运费 ￥0.00'}).status,'unconfirmed');
  assert.equal(inspectMarketPage(item,{markdown:item.title+' ￥69.00'}).status,'page_observed');
});
test('public product prices require matching visible heading, amount and explicit currency',()=>{
  const item={url:'https://brand.example/products/bottle',title:'500ml Bottle - Brand',pageType:'product',priceMentions:[]};
  const data={markdown:'# 500ml Bottle\n\n$29.95\n\n500ml stainless steel',metadata:{'og:type':'product','og:title':'500ml Bottle','og:price:amount':'29.95','og:price:currency':'AUD'}};
  const found=inspectMarketPage(item,data);assert.equal(found.amount,29.95);assert.equal(found.currency,'AUD');
  for(const patch of [{'og:price:currency':undefined},{'og:price:amount':'79.95'},{'og:title':'Other product'}])assert.notEqual(inspectMarketPage(item,{...data,metadata:{...data.metadata,...patch}}).method,'product_metadata_and_visible_text');
  assert.equal(safeMarketURL('https://127.0.0.1/products/a'),null);
  assert.equal(safeMarketURL('https://host.internal/products/a'),null);
  assert.equal(safeMarketURL('https://brand.example/products/bottle?srsltid=tracking&utm_source=test&variant=blue'),'https://brand.example/products/bottle?variant=blue');
  assert.equal(MarketInputSchema.safeParse({sourceUrls:[item.url]}).success,false);
  assert.equal(MarketInputSchema.safeParse({sourceUrls:['http://localhost/a']}).success,false);
  const html=marketHTML({items:[{...item,product:'500ml',platform:'brand.example',kind:'零售',snippet:'',verification:found}],queries:[]});assert.doesNotMatch(html,/AUD 29.95/);assert.doesNotMatch(html,/brand.example/);
});
test('comparable wholesale costs and gaps use consistent units and quantity',()=>{
  assert.equal(MarketInputSchema.safeParse({offers:[offer],baseline}).success,true);
  const [row]=compareOffers([offer],baseline);assert.equal(row.delta,-20);assert.equal(row.deltaPercent,-20);assert.equal(row.total,8000);assert.equal(row.savings,2000);
  for(const patch of [{kind:'零售'},{sameSpecification:false},{taxShippingIncluded:false},{moq:101},{unit:'箱'},{currency:'USD'},{quantity:50},{product:'龙'}]){
    const [r]=compareOffers([{...offer,...patch}],baseline);assert.equal(r.comparable,false);assert.equal(r.delta,null);assert.equal(r.savings,null);
  }
  assert.equal(compareOffers([offer],null)[0].comparable,false);
  assert.equal(compareOffers([offer],{...baseline,taxShippingIncluded:false})[0].comparable,false);
});
test('price input rejects negative/nonfinite prices and platform spoofing',()=>{
  for(const patch of [{price:-1},{price:Infinity},{quantity:0},{url:'https://1688.com.attacker.test/a'},{url:'javascript:alert(1)'},{observedAt:'bad'}])assert.equal(MarketInputSchema.safeParse({offers:[{...offer,...patch}]}).success,false);
  assert.equal(safeMarketURL('https://user:pass@1688.com/a','1688.com'),null);
});
test('missing provider and missing products are explicit, no invented candidates',async()=>{
  const r=await searchMarket(['企鹅'],{key:''});assert.equal(r.status,'not_configured');assert.deepEqual(r.items,[]);
  assert.equal((await searchMarket([],{key:'key'})).status,'needs_product');
});
test('search isolates platform failures, filters links and preserves raw price evidence',async()=>{
  const requests=[];
  const r=await searchMarket(['企鹅'],{key:'test',includeOpenWeb:false,fetcher:async(url,opts)=>{
    const body=JSON.parse(opts.body);requests.push(body);
    if(body.query.includes('taobao.com'))throw new Error('网络中断');
    if(!body.query.includes('1688.com'))return {ok:true,json:async()=>({data:{web:[]}})};
    return {ok:true,json:async()=>({data:{web:[{url:offer.url,title:'企鹅 ￥80',description:'100件起 80元 含运费待确认'},{url:'https://1688.com.evil.test/a',title:'假货 1元'}]}})};
  }});
  assert.equal(requests.length,2);assert.equal(r.status,'partial');assert.equal(r.items.length,1);assert.deepEqual(r.items[0].priceMentions,['￥80','80元']);assert.equal(r.items[0].price,undefined);
  assert.equal(r.searches.find(s=>s.platform==='淘宝').status,'failed');
  assert.equal(JSON.stringify(requests).includes('供应商基准'),false);
});
test('provider errors stay errors, repeated products are bounded',async()=>{
  const r=await searchMarket(['一','一','二','三','四'],{key:'test',includeOpenWeb:false,fetcher:async()=>({ok:false,status:429})});
  assert.equal(r.status,'failed');assert.equal(r.searches.length,6);assert.deepEqual(r.items,[]);
});
test('internal market HTML escapes external data; supplier exports omit market prices',()=>{
  const marketComparison={status:'completed',queries:['企鹅'],items:[],baseline,offers:[{...offer,title:'<script>private-price</script>'}]};
  const html=marketHTML(marketComparison);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/2,000/);
  const supplier=supplierSnapshot({createdAt:'2026-11-08',marketComparison});assert.equal(supplier.marketComparison,undefined);
  assert.doesNotMatch(reportHTML(supplier),/private-price|采购报价对照|企鹅/);
});
