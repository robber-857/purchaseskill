import test from 'node:test';
import assert from 'node:assert/strict';
import {marketProducts,searchMarket,verifyMarketSources,includeKnownSources,isSingleProductURL,inspectMarketPage,chinaMarketComparison} from '../lib/market.mjs';
import {mergeMarketRefresh} from '../lib/market-refresh.mjs';
import {productPlan,productSimilarity} from '../lib/market-products.mjs';

const ok = data => ({ok:true,json:async()=>({success:true,data})});
const detail = 'https://detail.1688.com/offer/12345.html';
const opaque = 'https://www.taobao.com/list/item/UUVf123fooXYZ=.htm';
const fetchResults = data => async () => ok(data);

test('search terms for branded bottles and gift sets emphasize physical product features, excluding carton dimensions and quote terms',()=>{
  const files=[{role:'supplier'}], refs=[{source:0,page:2}];
  const make=(name,description,specification)=>productPlan(marketProducts({
    products:[{name,description,...refs[0]}],supplierReview:{products:[{name,specification,refs}]}
  },files)[0]);
  const titanium=make('星河 钛杯','容量280ml，外箱尺寸515×280×3855mm，建议零售价239','280ml；整杯可拆卸及加大杯口');
  assert.match(titanium.queries.join(' '),/钛杯.*280ml/);
  assert.doesNotMatch(titanium.queries.join(' '),/3855|239|纯钛|星河/);
  assert.equal(productSimilarity(titanium,'280ml 不锈钢水杯 可拆卸').score,0);
  const gift=make('糖果梦境礼盒','630ml；页面称礼盒配雪纺发圈','内胆S31603；吸管盖；四种饮用方式');
  assert.match(gift.queries.join(' '),/水杯.*礼盒.*发圈/);
  assert.equal(productSimilarity(gift,'雪纺发圈 时尚礼盒').score,0);
  assert.equal(productSimilarity(gift,'水杯 礼盒').score,0);
  assert.ok(productSimilarity(gift,'630ml 水杯礼盒 带发绳').score>0);
});

test('supplier SKUs are independent of a shared keyword; private descriptions and buyer files are never queried',async()=>{
  const report={products:[
    {name:'松香红茶',source:0,description:'包装为袋泡。库存 PRIVATE-SECRET 9kg'},
    {name:'冻顶乌龙',source:0,description:'散茶。成本 PRIVATE-SECRET'},
    {name:'运动棉袜',source:0}, {name:'企鹅毛绒玩偶',source:0}, {name:'PRIVATE-BUYER',source:1}
  ]};
  const plans=marketProducts(report,[{role:'supplier'},{role:'internal'}],'买方公开检索词');
  assert.equal(plans.length,4);
  const calls=[];
  const result=await searchMarket(plans,{key:'test',fetcher:async(_,opts)=>{calls.push(JSON.parse(opts.body).query);return ok({web:[]});}});
  assert.equal(result.searches.length,8);
  assert.ok(calls.every(q=>!/PRIVATE|9kg/.test(q)));
  assert.ok(calls.some(q=>q.includes('买方公开检索词')));
  assert.ok(result.searches.every(s=>s.status==='empty'&&s.directCount===0&&s.matchedCount===0));
  const unavailable=await searchMarket(plans,{key:''});
  assert.equal(unavailable.searches.length,8);
  assert.ok(unavailable.searches.every(s=>s.status==='not_configured'));
});

test('title identity outranks image/price; incompatible varieties, accessories and duplicate generic listings do not count',async()=>{
  const inputs=[{name:'冻顶乌龙茶'},{name:'高山乌龙茶'}];
  const result=await searchMarket(inputs,{key:'test',fetcher:fetchResults({web:[
    {title:'冻顶乌龙茶散茶',url:detail},{title:'高山乌龙茶台式烘焙',url:opaque},
    {title:'乌龙茶',url:'https://detail.1688.com/offer/234.html'},
    {title:'精美乌龙茶包装盒 50元',url:'https://detail.1688.com/offer/345.html'},
    {title:'蜜香红茶 茶叶',url:'https://detail.1688.com/offer/456.html'},
    {title:'红茶热销',url:'https://www.taobao.com/list/product/tea.htm'}
  ]})});
  assert.deepEqual(result.items.map(i=>[i.product,i.url]).sort(),[['冻顶乌龙茶',detail],['高山乌龙茶',opaque]].sort());
  assert.ok(result.items.every(i=>i.similarity.matched.length>0));
  assert.equal(isSingleProductURL('https://www.taobao.com/list/product/'+opaque.split('/').pop()),false);
  assert.equal(isSingleProductURL('https://detail.1688.com/offer/collection'),false);
});

test('off-domain and list-page hits contribute only explicit official links, with no price until confirmed on detail',async()=>{
  const requests=[];
  const search=await searchMarket([{name:'冻顶乌龙茶'}],{key:'test',fetcher:async(_,opts)=>{
    const body=JSON.parse(opts.body); requests.push(body);
    return body.scrapeOptions&&body.query.includes('1688.com')?ok({web:[{url:'https://example.org/case',title:'冻顶乌龙茶 ￥999',
      description:'抢购价￥999',links:[detail,'https://example.org/seller'],ogImage:'https://example.org/fake.jpg'}]}):ok({web:[]});
  }});
  assert.ok(requests.some(r=>r.query.includes('"detail.1688.com/offer/"')&&r.scrapeOptions.formats.includes('links')));
  assert.equal(chinaMarketComparison(search).items.length,0);
  assert.equal(search.items[0].discoveryOnly,true);
  const verify=data=>verifyMarketSources(structuredClone(search),{key:'test',fetcher:fetchResults(data)});
  assert.equal((await verify({markdown:'登录查看价格',metadata:{url:detail}})).items.length,0);
  assert.equal((await verify({markdown:'# 电动工具',metadata:{url:detail}})).items.length,0);
  const result=await verify({markdown:'# 冻顶乌龙茶叶',metadata:{url:detail}});
  assert.equal(result.items.length,1);
  const [item]=result.items;
  assert.equal(item.title,'冻顶乌龙茶叶');
  assert.deepEqual(item.priceMentions,[]);
  assert.equal(item.verification.readable,true);
  assert.doesNotMatch(JSON.stringify(item),/999|example\.org/);
  assert.equal(result.searches.find(s=>s.platform==='1688').readableCount,1);
});

test('price screenshots require exact official product and variant, and storage failure preserves the text evidence',async()=>{
  const url=opaque+'?skuId=98';
  const item={product:'红茶',platform:'淘宝',url,title:'蜜香工夫红茶',priceMentions:['￥24'],pageType:'product'};
  const input={products:[{name:'红茶'}],searches:[{product:'红茶',platform:'淘宝',directCount:1,status:'found'}],items:[item]};
  const screenshot='https://storage.googleapis.com/private-screenshot';
  const captures=[];
  const verify=(finalURL,saveEvidence)=>verifyMarketSources(structuredClone(input),{key:'test',fetcher:fetchResults({markdown:'# 蜜香工夫红茶\n￥24',screenshot,metadata:{url:finalURL}}),saveEvidence});
  const saved={id:'stored',version:1};
  const good=await verify(url,async data=>{captures.push(data);return saved;});
  assert.equal(captures[0].priceText,'￥24');
  assert.deepEqual(good.items[0].priceEvidence,saved);
  assert.equal(good.searches[0].verifiedPriceCount,1);
  assert.ok(!JSON.stringify(good).includes(screenshot));
  const changed=await verify(opaque+'?skuId=99',async()=>{throw Error('should not run');});
  assert.equal(changed.items[0].verification.status,'redirected');
  assert.equal(changed.searches[0].matchedCount,0);
  assert.equal(changed.searches[0].verifiedPriceCount,0);
  const offline=await verify(url,async()=>{throw Error('offline');});
  assert.equal(offline.items[0].verification.price,'￥24');
  assert.equal(offline.items[0].priceEvidence,undefined);
  assert.equal(inspectMarketPage(item,{markdown:'captcha',metadata:{url}}).status,'blocked');
});

test('all twelve SKUs get a first platform probe before fallbacks, and a limited retry never becomes an empty result',async()=>{
  const inputs=Array.from({length:12},(_,i)=>({name:'候选绿茶 '+(i+1)}));
  const calls=[];
  const search=await searchMarket(inputs,{key:'test',fetcher:async(_,opts)=>{
    const {query}=JSON.parse(opts.body);calls.push(query);
    return query.startsWith('site:1688.com ')||query.startsWith('site:taobao.com ')?ok({web:[]}):{ok:false,status:429};
  }});
  assert.equal(search.searches.length,24);
  assert.ok(calls.slice(0,24).every(q=>/^site:(1688|taobao)\.com /.test(q)));
  assert.equal(search.status,'partial');
  assert.ok(search.searches.every(s=>s.status==='partial'&&s.reason.includes('限流')));
  const timed=await searchMarket(inputs,{key:'test',deadline:Date.now(),fetcher:()=>assert.fail('expired quota should not issue requests')});
  assert.ok(timed.searches.every(s=>s.status==='failed'&&s.reason.includes('时限')));
});

test('verification preserves inspected prices and stops queued SKUs when a slow archive reaches the function budget',async()=>{
  const products=Array.from({length:12},(_,i)=>({name:'蜜香红茶 '+i}));
  const items=products.map((p,i)=>({product:p.name,platform:'1688',title:p.name,url:'https://detail.1688.com/offer/'+(100+i)+'.html',pageType:'product',priceMentions:['￥24']}));
  let fetches=0;
  const result=await verifyMarketSources({items,products,searches:products.map(p=>({product:p.name,platform:'1688',directCount:1,status:'found'}))},{
    key:'test',deadline:Date.now()+550,
    fetcher:async(_,opts)=>{fetches++;const {url}=JSON.parse(opts.body),item=items.find(i=>i.url===url);return ok({markdown:'# '+item.title+'\n￥24',metadata:{url},screenshot:'https://storage.googleapis.com/sample'});},
    saveEvidence:({signal})=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve(null),{once:true}))
  });
  assert.equal(fetches,6);
  assert.equal(result.items.filter(i=>i.verification.status==='not_checked').length,6);
  assert.equal(result.items.filter(i=>i.verification.price==='￥24').length,6);
  assert.ok(result.items.every(i=>!i.priceEvidence));
});

test('refresh deduplicates known aliases per SKU and variant, prioritizes proof, and carries no stale observations',()=>{
  const targets=[{name:'蜜香红茶'}],capturedAt='2026-11-22';
  const item=(url,opts={})=>({product:targets[0].name,url,sourceType:'reviewed_source',capturedAt:'2026-11-01',...opts});
  const verified=item('https://item.taobao.com/item.htm?id=4321&skuId=90',{priceEvidence:{id:'old'},priceMentions:['￥999'],ocr:{status:'read'},similarity:{matched:['私有复核批注']}});
  const indexed='https://www.taobao.com/list/item/4321.htm?skuId=90';
  const previous={items:[verified,item('https://item.taobao.com/item.htm?id=4321&skuId=91'),item('https://item.taobao.com/item.htm?id=4',{product:'别的产品'})],
    historyItems:[item(indexed),item('https://item.taobao.com/item.htm?id=5',{sourceType:'marketplace',verification:{readable:true}}),item('https://s.1688.com/selloffer/list'),item(detail)]};
  const fresh={items:[{product:'蜜香红茶',url:indexed,title:'本轮索引',priceMentions:[]}],capturedAt,status:'partial'};
  const result=includeKnownSources(fresh,previous,targets);
  assert.equal(result.items.length,3);
  assert.equal(result.items.filter(i=>i.recheckKnownSource).length,3);
  assert.equal(fresh.items[0].recheckKnownSource,undefined);
  assert.ok(result.items.some(i=>i.url.includes('skuId=91')));
  assert.doesNotMatch(JSON.stringify(result),/999|私有复核批注|2026-11-01|"old"|selloffer|别的产品/);
});

test('a rate-limited SKU can refresh a known price from the original page; failure keeps the dated original only',async()=>{
  const product='工夫红茶',products=[{name:product}],capturedAt='2026-11-22';
  const previous={items:[{product,url:detail,platform:'1688',title:'人工复核旧标题',sourceType:'reviewed_source',priceEvidence:{id:'old',priceText:'￥99'},
    similarity:{matched:['人工记录']},capturedAt:'2026-11-01'}]};
  const fresh={capturedAt,items:[],products,searches:[{product,platform:'1688',directCount:0,status:'failed',error:'检索服务限流'}],status:'failed'};
  for(const blocked of [false,true]){
    const plan=includeKnownSources(structuredClone(fresh),previous,products);
    const result=await verifyMarketSources(plan,{key:'test',
      fetcher:fetchResults({markdown:blocked?'CAPTCHA':'# 工夫红茶\n￥24',metadata:{url:detail,'og:type':'product','og:title':'工夫红茶','og:price:amount':'24','og:price:currency':'CNY'}})});
    const merged=mergeMarketRefresh(previous,result,products,[product]);
    assert.equal(merged.items.find(i=>i.priceEvidence?.id==='old').capturedAt,'2026-11-01');
    assert.ok(merged.items.find(i=>i.priceEvidence?.id==='old').similarity.matched.includes('人工记录'));
    assert.ok(!result.items.some(i=>i.priceEvidence?.id==='old'));
    const latest=result.items.find(i=>i.sourceType==='rechecked_source');
    if(blocked){
      assert.equal(latest,undefined);
      assert.equal(result.searches[0].verifiedPriceCount,0);
    }else{
      assert.equal(latest.verification.price,'CNY 24.00');
      assert.equal(result.searches[0].status,'partial');
      assert.match(result.searches[0].reason,/限流.*重新核实/);
    }
  }
});
