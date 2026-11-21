import {marketHTML} from './market-report.js';
import {rangeSections} from './range-report.js';
import {scoreAssessment,economicsSummary} from '../lib/assessment.mjs';

export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=items=>`<ul class="report-list">${items.map(x=>`<li>${escape(x)}</li>`).join('')}</ul>`;
const modes={reviewed_sample:'已审阅案例',cached_review:'已审阅报告',ai:'AI 资料初筛',basic:'资料整理',supplier:'供应商反馈'};
const statuses={observed:'资料可见',supplier_claim:'供应商声明',inferred:'推断',unknown:'待确认'};
const decisions={
  '待补资料':{label:'暂缓采购，先补齐关键资料',tone:'hold'},
  '有条件进入样品评估':{label:'可进入样品评估，暂不批量采购',tone:'sample'},
  '不满足已确认需求':{label:'不建议采购，当前不满足需求',tone:'reject'}
};
const amount=(n,currency)=>`${escape(currency)} ${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n)}`;
const heading = (title, subtitle = '') => `<div class="section-heading"><h2>${escape(title)}</h2>${subtitle ? `<p>${escape(subtitle)}</p>` : ''}</div>`;
const readingLinks = (items, className = '') => `<nav class="reading-links ${className}" aria-label="报告快速导航">${items.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>`;
function citation(e,r,interactive){
  const name=r.files?.[e.source]?.name||'来源文件';
  const unit=/\.(ppt|txt|docx|xlsx?|csv)$/i.test(name)?'片段':'页';
  const location=unit==='片段' ? `片段 ${e.page}` : `第 ${e.page} 页`;
  const source=`${escape(name)} · ${location}`;
  return interactive
    ? `<button class="citation" data-source="${e.source}" data-page="${e.page}" type="button" title="${source}" aria-label="查看 ${source}">${r.files?.length===1 ? location : source} ↗</button>`
    : `<span class="citation">${source}</span>`;
}
function supplierImage(image,name){
 if(!image?.data||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image.data))return '<div class="supplier-image-empty">供应商资料未提供可确认的对应产品图</div>';
 let w=1000,h=1000;try{const b=Uint8Array.from(atob(image.data.split(',')[1]),c=>c.charCodeAt(0));if(b[0]===137){const v=new DataView(b.buffer);w=v.getUint32(16);h=v.getUint32(20);}else if(b[0]===255){for(let i=2;i<b.length-9;){if(b[i]!==255)break;const marker=b[i+1],len=b[i+2]*256+b[i+3];if([192,193,194].includes(marker)){h=b[i+5]*256+b[i+6];w=b[i+7]*256+b[i+8];break;}if(len<2)break;i+=len+2;}}}catch{}
 return `<svg class="supplier-product-image" viewBox="${image.x*w} ${image.y*h} ${image.width*w} ${image.height*h}" role="img" aria-label="${escape(name)} · 供应商资料产品图"><image href="${escape(image.data)}" width="${w}" height="${h}"/></svg>`;
}
function supplierReviewSections(review) {
  if (!review?.products?.length) return '';
  const retail = value => /^\d+(?:\.\d+)?$/.test(value) ? value + '（币种待确认）' : value;
  const groups = ['建议样品评估', '先补资料再评估', '第二阶段讨论'];
  const quoteRows = review.products.map(p => `<tr>
    <td><strong>${escape(p.name)}</strong><small>${escape(p.specification)}</small></td>
    <td data-label="供货报价">${escape(p.quote)}</td><td data-label="建议零售价">${escape(retail(p.retail))}</td>
    <td data-label="报价条件">${escape(p.conditions)}<details><summary>查看报价原文</summary>${escape(p.quoteEvidence)}</details></td>
    </tr>`).join('');
  const groupsHTML = groups.map(label => {
    const products = review.products.filter(p => p.recommendation === label);
    if (!products.length) return '';
    return `<div class="product-group"><h3>${label}</h3><div class="supplier-product-grid">${products.map(p => `<article class="supplier-product-card">
      ${p.image ? supplierImage(p.image, p.name) : ''}<div><h4>${escape(p.name)}</h4>
      <p class="supplier-repeat-detail">${escape(p.specification)}</p><p>${escape(p.reason)}</p>
      <h5>推进条件</h5>${list(p.requirements)}</div></article>`).join('')}</div></div>`;
  }).join('');
  const opportunities = review.opportunities || [];
  return `<section id="supplier-price">${heading('报价摘要','请按型号确认币种、计价单位与报价条件')}
    <div class="table-scroll"><table class="supplier-quote-table reading-table"><thead><tr><th>产品与规格</th><th>供货报价</th><th>建议零售价</th><th>报价条件</th></tr></thead><tbody>${quoteRows}</tbody></table></div></section>
    <section id="supplier-products" class="supplier-recommendations">${heading('逐款产品建议')}${groupsHTML}</section>
    ${opportunities.length ? `<section>${heading('合作机会')}${opportunities.map(o => `<article class="analysis-row"><h3>${escape(o.title)}</h3><p>${escape(o.detail)}</p></article>`).join('')}</section>` : ''}`;
}
function supplierHTML(r) {
  const review = r.supplierReview;
  const products = r.supplierProducts || [];
  const links = [...(review?.products?.length ? [['supplier-price','查报价'],['supplier-products','看选款建议']] : []),
    ...(products.length ? [['supplier-samples','核对样品']] : []), ['supplier-reply','准备回复']];
  const groups = review?.requestGroups || [];
  const requests = groups.length ? `<div class="supplier-request-groups">${groups.map(g => `<div><h3>${escape(g.category)}</h3>${list(g.items)}</div>`).join('')}</div>` : list(r.missing);
  const subjects = (review?.products || products).map(p => p.name);
  const subject = subjects.slice(0,2).join('、') + (subjects.length > 2 ? `等 ${subjects.length} 款` : '');
  const scope = (r.limitations || []).filter(t => t !== '本版不含内部库存、成本、采购底价、评分与竞品分析。');
  return `<article class="report-document supplier-document">
    <header class="report-masthead"><p class="report-kicker">供应商沟通</p><h1>${escape(r.title)}</h1><p class="report-meta">${escape(new Date(r.createdAt).toLocaleDateString('zh-CN',{timeZone:'Australia/Sydney'}))}${subject ? ' · ' + escape(subject) : ''}</p></header>
    <section class="supplier-decision"><h2>${review ? '本轮合作建议' : '本轮需确认的事项'}</h2><p>${escape(r.summary)}</p></section>
    ${readingLinks(links)}${supplierReviewSections(review)}
    ${products.length ? `<section id="supplier-samples" class="supplier-followup">${heading('规格确认与样品要求')}
      <div class="table-scroll"><table class="supplier-followup-table reading-table"><thead><tr><th>候选产品</th><th>待确认规格与资料</th><th>逐款样品要求</th></tr></thead>
      <tbody>${products.map(p => `<tr><td><strong>${escape(p.name)}</strong><small>${escape(p.specificationStatus)}</small></td><td data-label="规格与资料">${list(p.specifications)}</td><td data-label="样品要求">${list(p.samples)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    <div class="supplier-closing" id="supplier-reply"><section>${heading('请补充的资料')}${requests}</section>
    <section>${heading('后续安排')}<ol class="steps-list">${r.nextSteps.map(x => `<li>${escape(x)}</li>`).join('')}</ol></section></div>
    ${scope.length ? `<section class="limits"><details><summary>沟通说明</summary>${list(scope)}</details></section>` : ''}
    <footer>选品有据 · 供应商沟通</footer></article>`;
}
function detailedReportHTML(r,{interactive=true}={}){
  const cite=x=>citation(x,r,interactive),refs=xs=>(xs||[]).map(cite).join(' ');
  const score=scoreAssessment(r),economics=economicsSummary(r),assessment=r.assessment;
  const resale=r.purpose==='转售商品';
  const skuRows=assessment?.skuImpact.rows||[];
  const base=economics?.scenarios.find(x=>x.name==='基准');
  const worst=economics?.scenarios.find(x=>x.name==='保守');
  const comparison=!economics?'收益与风险尚无法量化比较':base.net<=0?'基准情景未形成正增量贡献':worst.net<0?'基准有收益，保守情景仍可能亏损':economics.scenarios.some(s=>s.net<0)?'基准有收益，部分情景仍可能亏损':'已给定情景均有非负增量贡献';
  return `<div class="report-document internal-document" id="detail-overview">
    ${r.assessment?.brief && r.summary !== r.assessment.brief.takeaway ? `<section>${heading('评审摘要')}<p>${escape(r.summary)}</p></section>` : ''}
    <section id="scoring" class="score-section">${heading('评分依据',score ? `资料支持度 ${score.total} / 100` : '')}
      <div class="assessment-columns"><div class="dimension-list">${score?score.rows.map(x=>`<div class="dimension"><div class="dimension-title"><strong>${x.label}</strong><span>${x.points} <small>/ ${x.weight}</small></span></div><div class="dimension-track"><span style="width:${x.points/x.weight*100}%"></span></div><div class="dimension-note"><span class="level ${x.status}">${x.statusLabel}</span><p>${escape(x.basis)}</p></div>${refs(x.refs)}</div>`).join(''):`<div class="empty-analysis"><span>— / 100</span><h3>本报告暂未评分</h3><p>${r.mode==='basic'?'请先核对资料，再安排产品评审。':'这份报告没有记录各项评分依据。'}</p></div>`}
      <details class="scoring-method"><summary>评分方法与边界</summary><p>产品与需求 20%、质量与使用条件 25%、商务与交付 20%、组合适配 15%、收益与成本 20%。无依据计 0%，部分依据计 50%，较完整依据计 100%，加权总分四舍五入。</p><p>低分可能源于资料缺失，并不表示产品劣质；高分也不代表满足需求或批准采购。供应商宣传不等于独立核验，硬门槛不被分数覆盖。${score?'当前 '+score.complete+' / 5 个维度依据较完整。':''}</p></details></div>
      <div class="product-context"><span class="mini-heading">评估范围</span>${r.products.length?r.products.map((p,i)=>`<div class="product-item"><span class="product-number">${String(i+1).padStart(2,'0')}</span><div><h3>${escape(p.name)}</h3><p>${escape(p.description)}</p>${cite(p)}</div></div>`).join(''):'<p>尚未确认具体产品型号，请先完成产品识别。</p>'}<div class="context-note"><strong>下一次评审需要什么？</strong><p>${escape(r.nextSteps[0]||'请补充当前缺失资料。')}</p></div></div></div>
    </section>
    <section id="detail-returns">${heading('收益与风险','用组合增量贡献判断价值，不只看销售额')}
      <div class="balance-line"><span class="balance-symbol">↔</span><div><h3>${comparison}</h3><p>${economics?`${escape(economics.period)} · ${escape(economics.currency)} · 按提供的情景计算，非收益承诺。`:'尚未形成完整经济测算；已有风险仍需逐项处理。'}</p></div></div>
      <div class="benefit-risk"><div><h3><span class="column-dot opportunity-dot"></span>潜在收益 <small>仍需验证</small></h3>${assessment?.opportunities.length?assessment.opportunities.map(x=>`<div class="analysis-row"><h4>${escape(x.title)}</h4><p>${escape(x.detail)}</p>${refs(x.refs)}</div>`).join(''):'<div class="analysis-row"><h4>新增需求与组合价值尚待验证</h4><p>需要产品适配证据与真实经营基线，才能判断新增收入是否覆盖替代和上新成本。</p></div>'}</div><div><h3><span class="column-dot risk-dot"></span>主要风险 <small>${r.risks.length} 项</small></h3>${r.risks.map(x=>`<div class="analysis-row"><h4>${escape(x.title)}</h4><p>${escape(x.detail)}</p></div>`).join('')||'<p>未列出具体风险不代表没有风险，仍需买方复核。</p>'}</div></div>
      ${economics?`<div class="scenario-grid">${['保守','基准','乐观'].map(name=>{const s=economics.scenarios.find(x=>x.name===name);return `<div class="scenario ${name==='基准'?'baseline':''}"><span>${name}情景</span><strong class="${s.net<0?'negative':''}">${amount(s.net,economics.currency)}</strong><p>组合增量贡献</p>${refs(s.refs)}</div>`;}).join('')}</div><details class="calculation-detail"><summary>展开测算输入与公式</summary><p>${escape(economics.basis)}</p><div class="table-scroll"><table class="scenario-input-table"><caption>同周期金额 · ${escape(economics.period)} · ${escape(economics.currency)}</caption><thead><tr><th>项目</th>${economics.scenarios.map(s=>`<th>${escape(s.name)}</th>`).join('')}</tr></thead><tbody>${[['revenue','新品销售收入'],['variableCost','− 新品变动成本'],['displacedContribution','− 旧品贡献损失'],['launchCost','− 上新成本'],['exitCost','− 退出成本'],['holdingCost','− 仓储资金成本'],['net','= 组合增量贡献']].map(([key,label])=>`<tr><td>${label}</td>${economics.scenarios.map(s=>`<td data-label="${escape(s.name)}">${amount(s[key],economics.currency)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:`<div class="data-needed"><strong>${resale?'测算缺口':'经济模型待补充'}</strong><p>${resale?'请提供报价与税运、销量基线、变动成本、旧品贡献损失及上新 / 退出 / 仓储资金成本。缺失数值不按零计算。':'请按实际用途提供总拥有成本或单位合格产出成本，不套用零售贡献公式。'}</p></div>`}
    </section>
    <section id="detail-portfolio">${heading(resale?'现有 SKU 影响':'现有方案与资产影响','新增、替代与退出一起评估')}
      <p class="section-intro">${escape(assessment?.skuImpact.summary||'请补充在用或在售清单，核对哪些商品或方案可以替换。')}</p>
      ${skuRows.length?`<div class="table-scroll"><table class="sku-table"><thead><tr><th>${resale?'现有 SKU':'现有方案'}</th><th>关系与影响</th><th>建议</th><th>退出 / 调整条件</th></tr></thead><tbody>${skuRows.map(x=>`<tr><td><strong>${escape(x.sku)}</strong>${refs(x.refs)}</td><td>${escape(x.relationship)}<small>${escape(x.reason)}</small></td><td><span class="action-tag">${escape(x.action)}</span></td><td>${escape(x.exitCondition)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="portfolio-empty"><span class="empty-grid-symbol">⊞</span><div><h3>${resale?'尚不能给出现有 SKU 的退出名单':'尚不能给出现有方案的替换名单'}</h3><p>补充现有清单、成本与使用 / 销售基线后，再逐项判断保留、并行验证或评估替换。</p></div><span class="outline-tag">待内部数据</span></div>`}
    </section>
    <section class="limits"><details><summary>报告范围与限制</summary>${list(r.limitations)}${r.files?.length?`<p>来源：${r.files.map(f=>escape(f.name)).join('；')}</p>`:''}</details></section>
    <section id="detail-evidence">${heading('证据与来源',`${r.evidence.length} 条记录 · 保留声明与事实的区别`)}<details class="evidence-details"><summary>展开证据台账 <span>文件 / 页码 / 依据 / 局限</span></summary><div class="evidence-list">${r.evidence.map(x=>`<div class="evidence-row"><div><span class="badge ${escape(x.status)}">${escape(statuses[x.status])}</span>${cite(x)}</div><p>${escape(x.claim)}</p><small>${escape(x.limitation)}</small></div>`).join('')}</div></details></section>
    <section id="detail-actions">${heading('推进条件与下一步','补齐缺口，再重新评审')}<div class="action-columns"><div><h3>待补资料 <span>${r.missing.length}</span></h3>${list(r.missing)}</div><div><h3>建议执行顺序</h3><ol class="steps-list">${r.nextSteps.map(x=>`<li>${escape(x)}</li>`).join('')}</ol></div></div></section>
  </div>`;
}
// Translate only the app's own fixed messages from previously saved basic reports.
function readableBasicReport(r) {
  const oldCopy = new Map([
    ['图片尚未经模型识别；不能据此判断产品信息。', '请对照原图确认产品信息。'],
    ['需要启用视觉模型或由评审人逐页阅读，才能形成产品摘要、识别声明冲突和评估适配性。', '请逐页核对型号、产品说明与采购需求。'],
    ['确认文件是否包含正式报价、MOQ、交期、授权及检测材料；基础模式不会自动判定这些资料缺失。', '请逐项核对正式报价、起订量、交期、授权及检测资料。'],
    ['启用模型分析或安排人工评审后，再形成采购建议。', '请采购负责人核对产品资料，再决定是否安排样品。'],
    ['基础初筛使用固定规则，不是 AI 语义评估。', '本次仅整理文件，产品适用性尚待评审。']
  ]);
  const readable = value => oldCopy.get(value) || value;
  return {...r, summary:r.summary.replace('本报告由固定规则整理来源与通用补件要求，未调用 AI，尚未对产品作语义评估。','本次仅整理文件，产品适用性尚待评审。'),
    risks:r.risks.map(x => ({...x,detail:readable(x.detail)})),evidence:r.evidence.map(x => ({...x,limitation:readable(x.limitation)})),
    missing:r.missing.map(readable),nextSteps:r.nextSteps.map(readable),limitations:r.limitations.map(readable)};
}
export function reportHTML(report, {interactive = true} = {}) {
  if (report.mode === 'supplier') return supplierHTML(report);
  const r = report.mode === 'basic' ? readableBasicReport(report) : report;
  const brief = r.assessment?.brief;
  const decision = decisions[r.decision] || decisions['待补资料'];
  const cite = x => citation(x, r, interactive);
  const refs = items => (items || []).map(cite).join(' ');
  const range = rangeSections(r, {escape, heading, citation:cite});
  const economics = economicsSummary(r);
  const base = economics?.scenarios.find(s => s.name === '基准');
  const date = new Date(r.createdAt).toLocaleDateString('zh-CN', {timeZone:'Australia/Sydney'});
  const price = brief?.price;
  const next = brief?.nextAction || r.nextSteps[0];
  const priorities = brief?.priorities;
  const links = [['priorities','看关键问题'],['price','查报价'],['requirements','看补件清单'],['actions','看推进步骤']];
  return `<article class="report-document brief-document">
    <header class="report-masthead"><p class="report-kicker">买方内部评审</p><h1>${escape(r.title)}</h1>
    <p class="report-meta">${[date,r.purpose,r.market,modes[r.mode]].filter(Boolean).map(escape).join(' · ')}</p></header>
    <section id="overview" class="decision-banner decision-spread ${decision.tone}">
      <div class="decision-copy"><span class="decision-eyebrow">采购建议</span><h2>${decision.label}</h2><p>${escape(brief?.takeaway || r.summary)}</p></div>
      <div class="decision-action"><h3>现在先做什么</h3><p>${escape(next)}</p><a href="#requirements">查看补件清单 ↓</a></div></section>
    ${readingLinks(links,'internal-reading-links')}
    <section id="priorities">${heading(priorities?.length ? '最影响采购决定的事' : '需核对的问题')}
      ${priorities?.length ? `<ol class="priority-list">${priorities.map(x => `<li><h3>${escape(x.title)}</h3><p>${escape(x.why)}</p><p class="priority-action"><strong>建议</strong> ${escape(x.action)}</p>${refs(x.refs)}</li>`).join('')}</ol>`
        : r.risks.length ? r.risks.map(x => `<article class="analysis-row"><h3>${escape(x.title)}</h3><p>${escape(x.detail)}</p></article>`).join('') : '<p>尚无已记录的问题，请核对采购需求与资料。</p>'}
    </section>
    <section id="price" class="brief-price">${heading('报价摘要')}${range.priceTable}
      ${price ? `<div class="price-comparison"><div><span>供应商报价</span><strong>${escape(price.quote)}</strong></div><div><span>价格对比</span><strong>${escape(price.comparison)}</strong></div></div>
      <p class="price-insight">${escape(price.judgment)} ${refs(price.refs)}</p>` : !range.priceTable ? '<p>请核对原始报价，确认型号、起订量与含税到货价。</p>' : ''}
      ${brief?.facts?.length ? `<div class="brief-facts">${brief.facts.map(x => `<div><span>${escape(x.label)}</span><strong>${escape(x.value)}</strong><p>${escape(x.meaning)}</p>${refs(x.refs)}</div>`).join('')}</div>` : ''}
      ${base ? `<div class="brief-earnings"><strong>基准情景的组合增量贡献为 ${amount(base.net,economics.currency)}</strong><p>${escape(economics.period)} · 各情景的成本与假设见详细依据。</p></div>` : ''}
    </section>
    ${range.candidates}${range.highlights}${marketHTML(r.marketComparison)}
    <section id="portfolio" class="brief-portfolio">${heading(r.purpose === '转售商品' ? '对现有商品的影响' : '对现有方案的影响')}
      <p>${escape(brief?.portfolio || r.assessment?.skuImpact?.summary || '请提供现有清单和使用或销售记录，再判断哪些项目需要调整。')}</p></section>
    ${range.actions}
    <details id="evidence" class="report-appendix"><summary><span>查看详细依据</span><small>${r.evidence.length} 条证据 · 评分、风险与测算 · 展开后可随正文打印</small></summary>
      ${detailedReportHTML(r,{interactive})}</details>
    <footer><span>选品有据 · 内部采购评审</span><span>对外沟通请使用供应商反馈版。</span></footer>
  </article>`;
}
export function downloadReport(r,css){const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(r.title)}</title><style>${css}</style></head><body class="export-body">${reportHTML(r,{interactive:false})}</body></html>`;const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=(r.title.replace(/[<>:"/\\|?*]/g,'_')||'采购初筛')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
