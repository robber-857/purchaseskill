import {marketHTML} from './market-report.js';
import {scoreAssessment,economicsSummary} from '../lib/assessment.mjs';

export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=items=>`<ul class="report-list">${items.map(x=>`<li>${escape(x)}</li>`).join('')}</ul>`;
const modes={reviewed_sample:'已审阅案例',cached_review:'复用已审阅报告',ai:'AI 资料初筛',basic:'基础整理 · 未调用 AI',supplier:'供应商反馈'};
const statuses={observed:'资料可见',supplier_claim:'供应商声明',inferred:'推断',unknown:'待确认'};
const decisions={
  '待补资料':{label:'暂缓采购，先补齐关键资料',short:'暂缓采购',tone:'hold',note:'当前资料不足以支持正式采购；补齐依据后重新评审。'},
  '有条件进入样品评估':{label:'可进入样品评估，暂不批量采购',short:'进入样品评估',tone:'sample',note:'按已确认条件开展样品验收，评估通过后再讨论采购。'},
  '不满足已确认需求':{label:'不建议采购，当前不满足需求',short:'不建议采购',tone:'reject',note:'已确认的需求未被满足；请先处理报告列出的不符项。'}
};
const amount=(n,currency)=>`${escape(currency)} ${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n)}`;
const heading=(n,title,subtitle='')=>`<div class="section-heading"><div><span class="section-index">${n}</span><h2>${title}</h2></div>${subtitle?`<p>${subtitle}</p>`:''}</div>`;
function citation(e,r,interactive){
  const name=r.files?.[e.source]?.name||'来源文件';
  const unit=/\.(ppt|txt|docx)$/i.test(name)?'片段':'页';
  return interactive?`<button class="citation" data-source="${e.source}" data-page="${e.page}" type="button" title="${escape(name)}">文件 ${e.source+1} · ${e.page} ${unit} ↗</button>`:`<span class="citation">${escape(name)} · ${e.page} ${unit}</span>`;
}
function supplierHTML(r){
  return `<article class="report-document supplier-document"><div class="report-kicker">SUPPLIER FEEDBACK <span>对外沟通 · 独立版本</span></div><h1>${escape(r.title)}</h1><p class="report-meta">${escape(new Date(r.createdAt).toLocaleDateString('zh-CN',{timeZone:'Australia/Sydney'}))}</p><section class="supplier-decision"><span class="state-label">待补资料</span><h2>资料齐备后，继续评估</h2><p>${escape(r.summary)}</p></section><section>${heading('01','请补充以下资料')}${list(r.missing)}</section><section>${heading('02','后续安排')}<ol class="steps-list">${r.nextSteps.map(x=>`<li>${escape(x)}</li>`).join('')}</ol></section><section class="limits"><h2>沟通说明</h2>${list(r.limitations)}</section><footer>选品有据 · 本清单不构成采购承诺。</footer></article>`;
}
function detailedReportHTML(r,{interactive=true}={}){
  if(r.mode==='supplier')return supplierHTML(r);
  const cite=x=>citation(x,r,interactive),refs=xs=>(xs||[]).map(cite).join(' ');
  const score=scoreAssessment(r),economics=economicsSummary(r),assessment=r.assessment;
  const decision=decisions[r.decision]||decisions['待补资料'];
  const resale=r.purpose==='转售商品';
  const skuRows=assessment?.skuImpact.rows||[];
  const base=economics?.scenarios.find(x=>x.name==='基准');
  const worst=economics?.scenarios.find(x=>x.name==='保守');
  const comparison=!economics?'收益与风险尚无法量化比较':base.net<=0?'基准情景未形成正增量贡献':worst.net<0?'基准有收益，保守情景仍可能亏损':economics.scenarios.some(s=>s.net<0)?'基准有收益，部分情景仍可能亏损':'已给定情景均有非负增量贡献';
  const overview=[
    ['采购建议',decision.short,decision.note],
    [resale?'现有 SKU 影响':'现有方案影响',skuRows.length?`${skuRows.length} 项需对照`:'待内部数据',skuRows.length?'逐项查看替代关系及退出条件。':'尚不能确认重叠、替代损失或退出名单。'],
    ['组合增量贡献',base?amount(base.net,economics.currency):'待测算',base?escape(economics.period):'需同周期收入、成本及替代损失。'],
    ['风险与门槛',`${r.risks.length} 项待处理`,r.risks[0]?escape(r.risks[0].title):'仍需对照买方验收要求复核。']
  ];
  return `<article class="report-document internal-document">
    <div class="report-kicker">PURCHASE INTELLIGENCE <span>${escape(modes[r.mode]||'资料初筛')} · 内部评审</span></div>
    <div class="report-title-row"><div><h1>${escape(r.title)}</h1><div class="report-meta">${escape(new Date(r.createdAt).toLocaleDateString('zh-CN',{timeZone:'Australia/Sydney'}))}${r.market?' · '+escape(r.market):''}${r.purpose?' · '+escape(r.purpose):''}</div></div><span class="outline-tag">${r.files?.length||0} 份资料 · ${r.evidence.length} 条证据</span></div>
    <section class="decision-banner ${decision.tone}" id="overview" aria-label="采购决策总览">
      <div class="decision-copy"><span class="decision-eyebrow"><i></i> 当前采购建议</span><h2>${decision.label}</h2><p>${escape(r.summary)}</p><a class="decision-link" href="#actions">查看推进条件 <span>↗</span></a></div>
      <div class="score-summary"><div class="score-ring" style="--score:${score?.total||0}" role="img" aria-label="采购评估分 ${score?score.total+'分，共100分':'暂未评分'}"><div><strong>${score?score.total:'—'}</strong><span>${score?'/ 100':'暂未评分'}</span></div></div><b>采购评估分</b><span>资料支持度 · 非品质评级</span><a href="#score">查看评分依据 ↗</a></div>
    </section>
    <section class="overview-section" aria-label="Overview 评估概览"><div class="mini-heading">OVERVIEW <span>决策概览</span></div><div class="overview-grid">${overview.map(([label,value,note])=>`<div><span>${label}</span><strong>${value}</strong><p>${note}</p></div>`).join('')}</div></section>
    <section id="score" class="score-section">${heading('01','评分与评估对象','先看依据，再看分数')}
      <div class="assessment-columns"><div class="dimension-list">${score?score.rows.map(x=>`<div class="dimension"><div class="dimension-title"><strong>${x.label}</strong><span>${x.points} <small>/ ${x.weight}</small></span></div><div class="dimension-track"><span style="width:${x.points/x.weight*100}%"></span></div><div class="dimension-note"><span class="level ${x.status}">${x.statusLabel}</span><p>${escape(x.basis)}</p></div>${refs(x.refs)}</div>`).join(''):`<div class="empty-analysis"><span>— / 100</span><h3>本报告暂未评分</h3><p>${r.mode==='basic'?'当前仅整理文件内容，尚未进行语义评估。启用 AI 或人工评审后再评分。':'这份历史报告不含结构化评分依据。重新生成报告后可查看五维评分。'}</p></div>`}
      <details class="scoring-method"><summary>评分方法与边界</summary><p>产品与需求 20%、质量与使用条件 25%、商务与交付 20%、组合适配 15%、收益与成本 20%。无依据计 0%，部分依据计 50%，较完整依据计 100%，加权总分四舍五入。</p><p>低分可能源于资料缺失，并不表示产品劣质；高分也不代表满足需求或批准采购。供应商宣传不等于独立核验，硬门槛不被分数覆盖。${score?'当前 '+score.complete+' / 5 个维度依据较完整。':''}</p></details></div>
      <div class="product-context"><span class="mini-heading">评估范围</span>${r.products.length?r.products.map((p,i)=>`<div class="product-item"><span class="product-number">${String(i+1).padStart(2,'0')}</span><div><h3>${escape(p.name)}</h3><p>${escape(p.description)}</p>${cite(p)}</div></div>`).join(''):'<p>尚未确认具体产品型号，请先完成产品识别。</p>'}<div class="context-note"><strong>下一次评审需要什么？</strong><p>${escape(r.nextSteps[0]||'请补充当前缺失资料。')}</p></div></div></div>
    </section>
    <section id="returns">${heading('02','收益与风险','用组合增量贡献判断价值，不只看销售额')}
      <div class="balance-line"><span class="balance-symbol">↔</span><div><h3>${comparison}</h3><p>${economics?`${escape(economics.period)} · ${escape(economics.currency)} · 按提供的情景计算，非收益承诺。`:'尚未形成完整经济测算；已有风险仍需逐项处理。'}</p></div></div>
      <div class="benefit-risk"><div><h3><span class="column-dot opportunity-dot"></span>潜在收益 <small>仍需验证</small></h3>${assessment?.opportunities.length?assessment.opportunities.map(x=>`<div class="analysis-row"><h4>${escape(x.title)}</h4><p>${escape(x.detail)}</p>${refs(x.refs)}</div>`).join(''):'<div class="analysis-row"><h4>新增需求与组合价值尚待验证</h4><p>需要产品适配证据与真实经营基线，才能判断新增收入是否覆盖替代和上新成本。</p></div>'}</div><div><h3><span class="column-dot risk-dot"></span>主要风险 <small>${r.risks.length} 项</small></h3>${r.risks.map(x=>`<div class="analysis-row"><h4>${escape(x.title)}</h4><p>${escape(x.detail)}</p></div>`).join('')||'<p>未列出具体风险不代表没有风险，仍需买方复核。</p>'}</div></div>
      ${economics?`<div class="scenario-grid">${['保守','基准','乐观'].map(name=>{const s=economics.scenarios.find(x=>x.name===name);return `<div class="scenario ${name==='基准'?'baseline':''}"><span>${name}情景</span><strong class="${s.net<0?'negative':''}">${amount(s.net,economics.currency)}</strong><p>组合增量贡献</p>${refs(s.refs)}</div>`;}).join('')}</div><details class="calculation-detail"><summary>展开测算输入与公式</summary><p>${escape(economics.basis)}</p><div class="table-scroll"><table><caption>同周期金额 · ${escape(economics.period)} · ${escape(economics.currency)}</caption><thead><tr><th>项目</th>${economics.scenarios.map(s=>`<th>${escape(s.name)}</th>`).join('')}</tr></thead><tbody>${[['revenue','新品销售收入'],['variableCost','− 新品变动成本'],['displacedContribution','− 旧品贡献损失'],['launchCost','− 上新成本'],['exitCost','− 退出成本'],['holdingCost','− 仓储资金成本'],['net','= 组合增量贡献']].map(([key,label])=>`<tr><td>${label}</td>${economics.scenarios.map(s=>`<td>${amount(s[key],economics.currency)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:`<div class="data-needed"><strong>${resale?'测算缺口':'经济模型待补充'}</strong><p>${resale?'请提供报价与税运、销量基线、变动成本、旧品贡献损失及上新 / 退出 / 仓储资金成本。缺失数值不按零计算。':'请按实际用途提供总拥有成本或单位合格产出成本，不套用零售贡献公式。'}</p></div>`}
    </section>
    <section id="portfolio">${heading('03',resale?'现有 SKU 影响':'现有方案与资产影响','新增、替代与退出一起评估')}
      <p class="section-intro">${escape(assessment?.skuImpact.summary||'本报告没有现有组合的结构化对照数据，无法确认替代关系及退出名单。')}</p>
      ${skuRows.length?`<div class="table-scroll"><table class="sku-table"><thead><tr><th>${resale?'现有 SKU':'现有方案'}</th><th>关系与影响</th><th>建议</th><th>退出 / 调整条件</th></tr></thead><tbody>${skuRows.map(x=>`<tr><td><strong>${escape(x.sku)}</strong>${refs(x.refs)}</td><td>${escape(x.relationship)}<small>${escape(x.reason)}</small></td><td><span class="action-tag">${escape(x.action)}</span></td><td>${escape(x.exitCondition)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="portfolio-empty"><span class="empty-grid-symbol">⊞</span><div><h3>${resale?'尚不能给出现有 SKU 的退出名单':'尚不能给出现有方案的替换名单'}</h3><p>补充现有清单、成本与使用 / 销售基线后，再逐项判断保留、并行验证或评估替换。</p></div><span class="outline-tag">待内部数据</span></div>`}
      <div class="portfolio-principles"><div><span>01</span><strong>先确认重叠</strong><p>相似外观不等于真实替代。</p></div><div><span>02</span><strong>再验证增量</strong><p>扣除旧品损失与切换成本。</p></div><div><span>03</span><strong>最后评估退出</strong><p>确认库存消化、售后与停止条件。</p></div></div>
    </section>
    <section class="limits"><details><summary>报告范围与限制</summary>${list(r.limitations)}${r.files?.length?`<p>来源：${r.files.map(f=>escape(f.name)).join('；')}</p>`:''}${r.model?`<p>模型：${escape(r.model)} · 规则版本：${escape(r.ruleVersion)}</p>`:''}</details></section>
    <section id="evidence">${heading('04','证据与来源',`${r.evidence.length} 条记录 · 保留声明与事实的区别`)}<details class="evidence-details"><summary>展开证据台账 <span>文件 / 页码 / 依据 / 局限</span></summary><div class="evidence-list">${r.evidence.map(x=>`<div class="evidence-row"><div><span class="badge ${escape(x.status)}">${escape(statuses[x.status])}</span>${cite(x)}</div><p>${escape(x.claim)}</p><small>${escape(x.limitation)}</small></div>`).join('')}</div></details></section>
    <section id="actions">${heading('05','推进条件与下一步','补齐缺口，再重新评审')}<div class="action-columns"><div><h3>待补资料 <span>${r.missing.length}</span></h3>${list(r.missing)}</div><div><h3>建议执行顺序</h3><ol class="steps-list">${r.nextSteps.map(x=>`<li>${escape(x)}</li>`).join('')}</ol></div></div></section>
<footer><span>选品有据 · 采购评审</span><span>资料评审记录，不构成采购订单或合规证明。</span></footer>
  </article>`;
}
export function reportHTML(r,{interactive=true}={}){
  if(r.mode==='supplier')return supplierHTML(r);
  const brief=r.assessment?.brief,score=scoreAssessment(r),decision=decisions[r.decision]||decisions['待补资料'];
  const economics=economicsSummary(r),base=economics?.scenarios.find(s=>s.name==='基准');
  const low=economics?Math.min(...economics.scenarios.map(s=>s.net)):null;
  const high=economics?Math.max(...economics.scenarios.map(s=>s.net)):null;
  const date=new Date(r.createdAt).toLocaleDateString('zh-CN',{timeZone:'Australia/Sydney'});
  // Older reports remain readable; never invent a price or rank their risks retroactively.
  const takeaway=brief?.takeaway||r.summary;
  const priorities=brief?.priorities||[];
  const facts=brief?.facts||[];
  const price=brief?.price;
  const full=detailedReportHTML(r,{interactive}).replace(/\bid="([^"]+)"/g,'id="detail-$1"').replace(/href="#([^"]+)"/g,'href="#detail-$1"');
  return `<article class="report-document brief-document">
    <div class="report-kicker">采购决策摘要 <span>${escape(modes[r.mode]||'资料初筛')} · 买方内部使用</span></div>
    <div class="report-title-row"><div><h1>${escape(r.title)}</h1><div class="report-meta">${escape(date)}${r.purpose?' · '+escape(r.purpose):''}</div></div></div>
    <section id="overview" class="decision-banner ${decision.tone}"><div class="decision-copy"><span class="decision-eyebrow"><i></i> 现在怎么决定</span><h2>${decision.label}</h2><p>${escape(takeaway)}</p></div><div class="score-summary"><div class="score-ring" style="--score:${score?.total||0}" role="img" aria-label="采购评估分 ${score?score.total+' / 100':'暂未评分'}"><div><strong>${score?score.total:'—'}</strong><span>${score?'/ 100':'暂未评分'}</span></div></div><b>采购评估分</b><span>反映资料充分程度，非品质分</span><a href="#evidence">查看依据 ↗</a></div></section>
    <section id="price" class="brief-price">${heading('01','价格与产品','这笔采购，划不划算')}
      <div class="price-comparison"><div><span>供应商报价</span><strong>${escape(price?.quote||'本报告未单独整理报价')}</strong></div><div><span>价格对比</span><strong>${escape(price?.comparison||'尚无可比价格结论')}</strong></div></div>
      <p class="price-insight">${escape(price?.judgment||'请先核对型号、数量和含税到货价，再判断是否划算。')}</p>
      ${facts.length?`<div class="brief-facts">${facts.map(x=>`<div><span>${escape(x.label)}</span><strong>${escape(x.value)}</strong><p>${escape(x.meaning)}</p></div>`).join('')}</div>`:''}
      ${base?`<div class="brief-earnings"><strong>按基准情况，扣除相关成本后${base.net>=0?'预计多赚':'预计少赚'} ${amount(Math.abs(base.net),economics.currency)}</strong><p>${escape(economics.period)}；提供的情景结果为 ${amount(low,economics.currency)} 至 ${amount(high,economics.currency)}。${low<0?'较差情况下可能亏损，需先控制试单规模。':'仍需验证实际销量。'}不是财务净利润或收益承诺。</p></div>`:''}
    </section>
    ${marketHTML(r.marketComparison)}
    <section id="priorities">${heading('02','最影响决策的事',priorities.length?'按重要程度排序':'先核对关键问题')}
      ${priorities.length?`<ol class="priority-list">${priorities.map(x=>`<li><h3>${escape(x.title)}</h3><p>${escape(x.why)}</p><p class="priority-action"><span>建议</span>${escape(x.action)}</p></li>`).join('')}</ol>`:`<p>这份报告尚未整理重点摘要。请展开详细依据核对${r.risks.length}项问题，重新生成报告后可查看按重要程度排序的建议。</p>`}
    </section>
    <section id="portfolio" class="brief-portfolio">${heading('03',r.purpose==='转售商品'?'对现有商品有什么影响':'对现有方案有什么影响')}
      <p>${escape(brief?.portfolio||'尚未形成简要对比结论，请在详细报告中查看现有方案分析。')}</p>
    </section>
    <section id="actions" class="brief-next"><span class="mini-heading">下一步</span><h2>现在先做这一件事</h2><p>${escape(brief?.nextAction||r.nextSteps[0])}</p></section>
    <p class="brief-boundary">仅依据已提供资料；${r.mode==='basic'?'尚未进行 AI 分析。':'报价、供应商声明及预测仍需核实。'}采购前由买方确认。</p>
    <details id="evidence" class="report-appendix"><summary><span>查看详细依据</span><small>评分、来源、完整风险与测算 · 展开后打印将包含附录</small></summary><div class="brief-source-notes"><h3>摘要来源</h3>${price?`<p>价格：${price.refs.length?price.refs.map(x=>citation(x,r,interactive)).join(' '):'暂无已引用的报价或比价资料'}</p>`:''}${facts.map(x=>`<p>${escape(x.label)}：${x.refs.map(ref=>citation(ref,r,interactive)).join(' ')}</p>`).join('')}${priorities.filter(x=>x.refs.length).map(x=>`<p>${escape(x.title)}：${x.refs.map(ref=>citation(ref,r,interactive)).join(' ')}</p>`).join('')}</div>${full}</details>
    <footer><span>选品有据 · 采购决策摘要</span><span>买方内部使用；供应商请使用独立反馈版。</span></footer>
  </article>`;
}
export function downloadReport(r,css){const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(r.title)}</title><style>${css}</style></head><body class="export-body">${reportHTML(r,{interactive:false})}</body></html>`;const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=(r.title.replace(/[<>:"/\\|?*]/g,'_')||'采购初筛')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
