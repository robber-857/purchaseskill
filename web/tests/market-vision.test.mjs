import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVisualPrices,readMarketScreenshot} from '../lib/market-vision.mjs';
import {verifyMarketSources,marketRank,MarketInputSchema} from '../lib/market.mjs';
import {marketHTML} from '../src/market-report.js';
const offer={title:'保温杯500ml',priceText:'￥19.90',currency:'CNY',specification:'500ml',unit:'只',conditions:'100只起订，税运未知',evidenceText:'保温杯500ml ￥19.90 100只起订',matchesCandidate:true};
test('OCR keeps visible price evidence, drops capacity and refuses login screenshots',()=>{
  assert.equal(validateVisualPrices({blocked:false,offers:[offer]}).offers.length,1);
  assert.equal(validateVisualPrices({blocked:false,offers:[{...offer,priceText:'500ml'}]}).offers.length,0);
  assert.equal(validateVisualPrices({blocked:false,offers:[{...offer,priceText:'￥29.90'}]}).offers.length,0);
  assert.equal(validateVisualPrices({blocked:true,offers:[offer]}).offers.length,0);
  assert.throws(()=>validateVisualPrices({blocked:false,offers:[{...offer,currency:'USD'}]}));
});
test('unpriced single products attempt screenshot OCR; login pages do not',async()=>{
  let calls=0;const item={url:'https://detail.1688.com/offer/123.html',pageType:'product',title:'保温杯',product:'杯',priceMentions:[],platform:'1688'};
  for(const blocked of [false,true]){
    const result=await verifyMarketSources({items:[{...item}]},{key:'test',fetcher:async(_url,options)=>{
      assert.ok(JSON.parse(options.body).formats.some(x=>x.type==='screenshot'));
      return {ok:true,json:async()=>({success:true,data:{markdown:blocked?'密码登录短信登录':'保温杯',screenshot:'https://storage.googleapis.com/screen.png'}})};
    },visionReader:async()=>{calls++;return validateVisualPrices({blocked:false,offers:[offer]});}});
    assert.equal(result.items[0].ocr.status,blocked?'blocked':'read');
    const html=marketHTML(result);assert.match(html,blocked?/登录/:/￥19.90/);
    assert.equal(result.items[0].verification.amount,undefined);
  }
  assert.equal(calls,1);
});
test('pricing evidence outranks image-only hits and cannot promote OCR into verified offers',()=>{
  assert.ok(marketRank({priceMentions:['￥20']})>marketRank({imageUrl:'x',pageType:'product'}));
  const html=marketHTML({items:[{url:'https://s.1688.com/kq/cups.html',product:'杯',title:'杯',priceMentions:[],ocr:{status:'read',offers:[{...offer,matchesCandidate:false}],note:'待核验'}}]});
  assert.doesNotMatch(html,/market-card-price|￥19.90/);
  assert.doesNotMatch(html,/已读取商品页标价/);
});
test('screenshot upload is bounded and source is restricted to allowed marketplaces',()=>{
  const screenshot={sourceURL:'https://detail.1688.com/offer/123.html',title:'杯',image:'data:image/png;base64,aGVsbG8='};
  assert.equal(MarketInputSchema.safeParse({screenshot}).success,true);
  assert.equal(MarketInputSchema.safeParse({screenshot:{...screenshot,sourceURL:'https://example.com'}}).success,false);
  assert.equal(MarketInputSchema.safeParse({screenshot:{...screenshot,image:'https://example.com/a.png'}}).success,false);
});
test('vision timeout or invalid output stays a failure without invented prices',async()=>{
  assert.equal((await readMarketScreenshot({screenshot:'https://example.com/a.png'},{key:''})).status,'not_configured');
  const r=await readMarketScreenshot({screenshot:'https://example.com/a.png'},{key:'test',model:'test',fetcher:async()=>({ok:false})});
  assert.equal(r.status,'failed');assert.deepEqual(r.offers,[]);
});

test('product cards reject aggregation pages and never join unrelated prices',()=>{
 const base={product:'杯',title:'单品',url:'https://detail.1688.com/offer/123.html',pageType:'product',priceMentions:['￥6.5','￥59.0']};
 const html=marketHTML({items:[base,{...base,title:'聚合标题',url:'https://guangtao.taobao.com/product-abc.html'}]});
 assert.doesNotMatch(html,/聚合标题|￥6.5|￥59.0|taobao.com\/product-abc/);assert.match(html,/价格待确认/);
 assert.equal(MarketInputSchema.safeParse({sourceUrls:['https://s.1688.com/kq/cups.html']}).success,false);
});
