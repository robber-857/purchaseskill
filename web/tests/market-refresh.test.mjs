import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMarketRefresh,publicMarketItem,reportSearchTargets} from '../lib/market-refresh.mjs';
import {marketHTML,coverageSummary,listingId} from '../src/market-report.js';

const first='甲杯',second='乙杯';
const item=(product,id,sourceType='marketplace')=>({product,title:product,sourceType,url:'https://detail.1688.com/offer/'+id+'.html',platform:'1688'});
test('official listing archives survive reordering and work without JavaScript or an external marketplace login',()=>{
  const digest='f'.repeat(64);
  const record={...item(first,1),sourceAccess:'login',originalPageTitle:'原商品名',priceConditions:'银色，起订 2 件',variantTextEvidence:'银色 300ml ¥20',
    similarity:{matched:['内胆材质'],missing:['容量相差 20ml']},verification:{excerpt:'原页面文字'},
    priceEvidence:{id:digest,capturedAt:'2026-11-22T01:00:00Z',priceText:'¥20',embedded:'data:image/png;base64,YQ=='}};
  const related={...record,product:second,sourceAccess:'verification'};
  const records={version:2,products:[{name:first},{name:second}],items:[record],historyItems:[related]};
  const html=marketHTML(records),reordered=marketHTML({...records,items:[related],historyItems:[record]});
  assert.notEqual(listingId(record),listingId(related));
  for(const content of [html,reordered]){
    assert.equal(content.split('id="listing-'+digest+'"').length,2);
    for(const row of [record,related]){
      const anchor=listingId(row);
      assert.equal(content.split('id="'+anchor+'"').length,2);
      assert.ok(content.includes('href="#'+anchor+'"'));
    }
    for(const text of ['直接访问原页时要求登录','直接访问原页时要求完成平台验证','原商品名','采集时间','银色，起订 2 件','容量相差 20ml','商品页规格选项原文','原页面文字','查看官方商品页'])
      assert.ok(content.includes(text),text);
    assert.ok(content.includes('href="#price-proof-'+digest+'"'));
    assert.ok(!content.includes('data-price-proof')&&!content.includes('javascript:'));
  }
});
test('refresh one SKU preserves the other SKU, manual notes and prior evidence across retries',()=>{
  const a=item(first,1),b=item(second,2),manual=item(first,3,'buyer_screenshot'),old=item('保温杯',4);
  const previous={items:[a,b,manual,old],offers:[{title:'人工报价'}],baseline:{product:second},searches:[{product:second,platform:'1688'}]};
  const fresh={items:[item(first,5)],products:[{name:first}],searches:[{product:first,platform:'淘宝'}],capturedAt:'2026-11-22'};
  const run=prev=>mergeMarketRefresh(prev,fresh,[{name:first}],[first,second]);
  const next=run(previous);
  assert.deepEqual(new Set(next.items.map(i=>i.url)),new Set([b,manual,...fresh.items].map(i=>i.url)));
  assert.deepEqual(next.historyItems,[a,old]);
  assert.deepEqual(next.offers,previous.offers);
  assert.deepEqual(next.baseline,previous.baseline);
  assert.deepEqual(run(next).historyItems,next.historyItems);
  assert.deepEqual(run(next).searches,next.searches);
});
test('a refresh rejects products not present in supplier attachments',()=>{
  const report={products:[{name:first,source:0},{name:second,source:1}]},files=[{role:'supplier'},{role:'internal'}];
  assert.equal(reportSearchTargets(report,files,first)[0].name,first);
  assert.throws(()=>reportSearchTargets(report,files,second),/不在供应商/);
});
test('interrupted searches retain dated proof and a late response cannot replace a newer SKU refresh',()=>{
  const saved={...item(first,11),priceEvidence:{id:'x'},capturedAt:'2026-11-20'};
  const previous={items:[saved],searches:[{product:first,platform:'1688',capturedAt:'2026-11-20'}]};
  const fresh={items:[],searches:[{product:first,platform:'1688',status:'failed',capturedAt:'2026-11-22'}],capturedAt:'2026-11-22'};
  const next=mergeMarketRefresh(previous,fresh,[first],[first]);
  assert.deepEqual(next.items,[saved]);
  assert.deepEqual(mergeMarketRefresh(next,{...fresh,capturedAt:'2026-11-21'},[first],[first]),next);
});
test('owner history, marketplace columns and exported screenshot evidence remain distinguishable',()=>{
  const candidate={...item(first,1),similarity:{matched:['容量']},priceEvidence:{id:'a'.repeat(64),priceText:'¥20'},verification:{readable:true}};
  const m={version:2,products:[{name:first},{name:second}],items:[candidate],searches:[]};
  assert.match(coverageSummary(m),/1 \/ 2 款/);
  const html=marketHTML(m,{editable:true});
  assert.equal((html.match(/class="platform-column"/g)||[]).length,4);
  assert.equal((html.match(/data-refresh-product=/g)||[]).length,2);
  assert.match(html,/data-price-proof=/);
  candidate.priceEvidence.embedded='data:image/png;base64,YQ==';
  assert.match(marketHTML(m),/href="#price-proof-a{64}"/);
  assert.doesNotMatch(marketHTML(m),/data-refresh-product=|data-price-proof=/);
  const legacy=publicMarketItem({ocr:{screenshotURL:'https://storage.googleapis.com/expired'},priceMentions:['¥10']});
  assert.equal(legacy.ocr.screenshotUnavailable,true);
  assert.doesNotMatch(JSON.stringify(legacy),/googleapis/);
});
