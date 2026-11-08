import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreAssessment,netContribution,economicsSummary} from '../lib/assessment.mjs';
import {validateReport,supplierSnapshot} from '../lib/contracts.mjs';
import {warmiesReport} from '../src/sample.js';
import {reportHTML} from '../src/report.js';
const manifest={pages:[1,4,22,30].map(page=>({file:0,page}))};
const copy=()=>structuredClone(warmiesReport);
const scenario=(name,revenue)=>({name,revenue,variableCost:600,displacedContribution:120,launchCost:100,exitCost:50,holdingCost:30,refs:[{source:0,page:4}]});
test('Inventory recommendations can pause replenishment without claiming SKU exit and remain internal',()=>{
  const r=copy();
  r.assessment.skuImpact.rows=[{sku:'INTERNAL-OLD-500',relationship:'同用途',action:'暂停补货',reason:'现有库存足够且补货可取消，建议买方确认暂停。',exitCondition:'保留在售，不自动下架；替换需试销与售后安排。',refs:[{source:0,page:4}]}];
  assert.doesNotThrow(()=>validateReport(r,manifest));
  assert.match(reportHTML(r),/暂停补货/);
  assert.doesNotMatch(reportHTML(supplierSnapshot(r)),/INTERNAL-OLD-500|暂停补货/);
  r.assessment.skuImpact.rows[0].refs=[];
  assert.throws(()=>validateReport(r,manifest));
});
test('Brief keeps priorities bounded and validates every product and price source',()=>{
  const r=copy();r.assessment.brief.priorities.push(r.assessment.brief.priorities[0]);
  assert.throws(()=>validateReport(r,manifest));
  const p=copy();p.assessment.brief.price.refs=[{source:0,page:999}];
  assert.throws(()=>validateReport(p,manifest));
  const f=copy();f.assessment.brief.facts[0].refs=[];
  assert.throws(()=>validateReport(f,manifest));
});
test('Brief escapes its own fields, retains detailed evidence and never crosses supplier boundary',()=>{
  const r=copy();r.assessment.brief.takeaway='<img src=x onerror=alert(1)>SECRET_BRIEF';
  const html=reportHTML(r,{interactive:false});
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
  assert.match(html,/<details id="evidence" class="report-appendix">/);
  assert.match(html,/id="detail-overview"/);
  assert.doesNotMatch(reportHTML(supplierSnapshot(r)),/SECRET_BRIEF|report-appendix/);
});
test('Scoring distinguishes missing evidence, product quality and hard rejection',()=>{
  assert.equal(scoreAssessment(warmiesReport).total,23);
  assert.equal(scoreAssessment({...warmiesReport,mode:'basic'}),null);
  assert.equal(scoreAssessment({...warmiesReport,assessment:undefined}),null);
  const r=copy();r.assessment.criteria.forEach(c=>{c.status='supported';c.refs=[{source:0,page:4}];});r.decision='不满足已确认需求';
  assert.equal(scoreAssessment(r).total,100);
  assert.match(reportHTML(r),/不建议采购，当前不满足需求/);
  assert.match(reportHTML(r),/高分也不代表满足需求或批准采购/);
});
test('Assessment contract rejects duplicate dimensions, unsupported scores and invented source pages',()=>{
  assert.doesNotThrow(()=>validateReport(warmiesReport,manifest));
  for(const mutate of [r=>r.assessment.criteria[0].id='quality',r=>r.assessment.criteria[0].refs=[],r=>r.assessment.criteria[0].refs[0].page=999,r=>r.assessment.opportunities[0].refs[0].source=5]){
    const r=copy();mutate(r);assert.throws(()=>validateReport(r,manifest));
  }
});
test('Economics deducts cannibalization and all transition costs, preserves loss scenarios and cents',()=>{
  assert.equal(netContribution(scenario('基准',1000)),100);
  assert.equal(netContribution(scenario('保守',800)),-100);
  assert.equal(netContribution({...scenario('基准',1000.12),variableCost:600.11}),100.01);
  const r=copy();r.assessment.economics={currency:'CNY',period:'90天',basis:'测试合成情景，非真实预测',scenarios:[scenario('保守',800),scenario('基准',1000),scenario('乐观',1500)]};
  assert.doesNotThrow(()=>validateReport(r,manifest));
  assert.equal(economicsSummary(r).scenarios[1].net,100);
  assert.match(reportHTML(r),/基准有收益，保守情景仍可能亏损/);
  assert.equal(economicsSummary({...r,purpose:'自用设备 / 软件'}),null);
  r.assessment.economics.scenarios[0].exitCost=undefined;
  assert.throws(()=>validateReport(r,manifest));
  r.assessment.economics.scenarios[0].exitCost=-1;
  assert.throws(()=>validateReport(r,manifest));
});
test('Supplier HTML is independent of internal scoring, SKU, economics and source metadata',()=>{
  const r=copy();r.summary='SECRET_SUMMARY';r.assessment.criteria[0].basis='SECRET_SCORE';r.assessment.skuImpact.summary='SECRET_SKU';r.files=[{name:'SECRET_SOURCE'}];
  const s=supplierSnapshot(r),html=reportHTML(s,{interactive:false});
  assert.doesNotMatch(JSON.stringify(s)+html,/SECRET_|采购评估分|组合增量贡献|data-source|<script/);
  assert.match(html,/供应商资料补充清单/);
});
test('New structured fields escape hostile text and unknown data is not rendered as profit or an exit list',()=>{
  const r=copy();r.assessment.criteria[0].basis='<img src=x onerror=alert(1)>';r.assessment.skuImpact.rows=[{sku:'<script>evil</script>',relationship:'unknown',action:'待核验',reason:'unknown',exitCondition:'unknown',refs:[{source:0,page:4}]}];
  const html=reportHTML(r,{interactive:false});assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;script&gt;/);
  const empty=reportHTML(warmiesReport);assert.match(empty,/收益与风险尚无法量化比较/);assert.match(empty,/尚不能给出现有 SKU 的退出名单/);assert.doesNotMatch(empty,/CNY 0/);
});
