import test from 'node:test';import assert from 'node:assert/strict';import {supplierInput,validateSupplierReview} from '../lib/supplier-review.mjs';import {supplierSnapshot} from '../lib/contracts.mjs';import {reportHTML} from '../src/report.js';
const image='data:image/jpeg;base64,aGVsbG8=';const files=[{role:'supplier'},{role:'internal'}];const manifest={pages:[{file:0,page:1,text:'公开杯 供应商报价19元',images:[image]},{file:1,page:1,text:'SECRET成本2库存999底价1',images:['data:image/png;base64,U0VDUkVU']}]};
const p={name:'公开杯',specification:'500ml',quote:'19元/只',retail:'未提供',conditions:'待确认',quoteEvidence:'供应商报价19元',refs:[{source:0,page:1}],recommendation:'建议样品评估',reason:'需确认密封与材质',requirements:['送样确认'],image:{source:0,page:1,index:0,x:0,y:0,width:1,height:1}};
test('Supplier generation sees only supplier pages; internal citations and images rejected',()=>{const input=JSON.stringify(supplierInput(manifest,files));assert.doesNotMatch(input,/SECRET|U0VDUkVU/);assert.throws(()=>validateSupplierReview({summary:'test',products:[{...p,refs:[{source:1,page:1}]}]},manifest,files));assert.throws(()=>validateSupplierReview({summary:'test',products:[{...p,image:{...p.image,source:1}}]},manifest,files));});
test('Supplier v3 renders images quotes and advice without internal report fields',()=>{const review=validateSupplierReview({summary:'产品讨论',products:[p]},manifest,files);const s=supplierSnapshot({supplierReview:review,files,createdAt:'2026-11-12',summary:'SECRET成本',marketComparison:{items:[{price:'SECRET底价'}]}});const html=reportHTML(s);assert.match(html,/报价摘要/);assert.match(html,/19元\/只/);assert.match(html,/supplier-product-image/);assert.match(html,/逐款产品建议/);assert.doesNotMatch(JSON.stringify(s)+html,/SECRET/);});
test('Supplier quote links keep their product after recommendations are grouped', () => {
  const products = [
    {...p, name:'一号杯', recommendation:'先补资料再评估', image:null},
    {...p, name:'二号杯', recommendation:'建议样品评估'}
  ];
  const review = validateSupplierReview({summary:'请逐款核对',products},manifest,files);
  const html = reportHTML(supplierSnapshot({supplierReview:review,files,createdAt:'2026-11-12'}));
  for (const [i, product] of products.entries()) {
    const id = 'supplier-product-' + (i + 1);
    assert.ok(html.includes(`href="#${id}">${product.name}</a>`));
    const card = html.split(`id="${id}">`)[1].split('</article>')[0];
    assert.ok(card.includes(`<h4>${product.name}</h4>`));
  }
  assert.ok(html.indexOf('id="supplier-product-2"') < html.indexOf('id="supplier-product-1"'));
  assert.match(html, /<figcaption>二号杯<\/figcaption>/);
  const older = reportHTML(supplierSnapshot({products:[],files,createdAt:'2026-11-12'}));
  assert.doesNotMatch(older, /class="supplier-cover-plate"|class="supplier-product-jump"/);
});
test('Supplier cooperation opportunities require supplier evidence and stay optional for older reports', () => {
  const opportunity = {title:'可按单款送样',detail:'样品版本仍需双方确认',refs:[{source:0,page:1}]};
  const requestGroups = [{category:'产品与合规',items:['请提供对应型号标签样稿']}];
  const input = {summary:'本轮先核对两款规格',products:[p],opportunities:[opportunity],requestGroups};
  const review = validateSupplierReview(input,manifest,files);
  const report = supplierSnapshot({files,supplierReview:review,createdAt:'2026-11-21'});
  const html = reportHTML(report);
  assert.match(html,/可按单款送样/);
  assert.match(html,/请提供对应型号标签样稿/);
  assert.throws(() => validateSupplierReview({...input,requestGroups:[...requestGroups,...requestGroups]},manifest,files));
  assert.match(html,/本轮合作建议/);
  assert.doesNotMatch(html,/资料齐备后，继续评估/);
  assert.throws(() => validateSupplierReview({...input,opportunities:[{...opportunity,refs:[{source:1,page:1}]}]},manifest,files));
  delete review.opportunities;
  delete review.requestGroups;
  assert.doesNotMatch(reportHTML(report),/合作机会/);
  assert.ok(reportHTML(report).includes(report.missing[0]));
});
