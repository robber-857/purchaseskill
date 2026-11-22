import test from 'node:test';
import assert from 'node:assert/strict';
import {withEmbeddedEvidence} from '../src/price-evidence.js';
import {marketHTML,evidenceAppendix} from '../src/market-report.js';

test('standalone export keeps healthy current and legacy evidence if an archived image cannot be opened',async t=>{
  const id='a'.repeat(64),gone='b'.repeat(64);
  const bytes='fixture-png-body', encoded='data:image/png;base64,'+Buffer.from(bytes).toString('base64');
  const requests=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer fake-share');
    const params=new URL(url,'http://test').searchParams;
    assert.equal(params.get('action'),'shared-evidence');
    assert.ok(!params.has('token')&&!params.has('id'));
    requests.push(params.get('evidence'));
    return params.get('evidence')===id?new Response(bytes,{headers:{'Content-Type':'image/png'}}):new Response('',{status:404});
  });
  const previous=globalThis.FileReader;
  globalThis.FileReader=class{
    async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}
  };
  t.after(()=>{if(previous)globalThis.FileReader=previous;else delete globalThis.FileReader;});
  const url='https://detail.1688.com/offer/1234.html';
  const item={product:'茶杯',url,title:'茶杯样例',priceEvidence:{id,sourceURL:url,priceText:'¥12',origin:'source_page'}};
  const archive={...item,title:'之前的截图',priceEvidence:{...item.priceEvidence,id:gone}};
  const oldImage='data:image/png;base64,TEVHQUNZ';
  const legacy={product:item.product,url,title:'买方旧截图',ocr:{screenshotData:oldImage,buyerProvided:true}};
  const report={marketComparison:{version:2,products:[{name:item.product}],items:[item],historyItems:[item,archive,legacy]}};
  const exported=(await withEmbeddedEvidence(report,{share:'fake-share'})).marketComparison;
  assert.deepEqual(requests.sort(),[id,gone]);
  assert.equal(report.marketComparison.items[0].priceEvidence.embedded,undefined);
  const cards=marketHTML(exported), appendix=evidenceAppendix(exported);
  assert.ok(cards.includes('href="#price-proof-'+id+'"'));
  assert.ok(cards.includes('href="#price-proof-legacy-1"'));
  assert.ok(!cards.includes('data-price-proof')&&!cards.includes('base64'));
  assert.ok(!cards.includes('href="#price-proof-'+gone+'"'));
  assert.ok(cards.includes('未收录于本文件'));
  assert.equal(appendix.split(encoded).length,2);
  assert.equal(appendix.split(oldImage).length,2);
  assert.ok(appendix.includes('按原始尺寸查看')&&appendix.includes('之前的截图'));
  assert.ok(!appendix.includes('fake-share'));
});
