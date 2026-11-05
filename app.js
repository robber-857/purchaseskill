const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>`${n<0?'−':''}¥${Math.abs(Math.round(n)).toLocaleString('zh-CN')}`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=PRODUCTS[0],tab='decision',activeView='review',reportSnapshot=null;
const states=Object.fromEntries(PRODUCTS.map(p=>[p.id,{...p.defaults,gate:false}]));
const fields=[['cost','模拟采购价','元',1,300,1,'每件采购成本，非供应商真实报价'],['price','预计净售价','元',1,500,1,'扣折让后的单件销售收入假设'],['qty','首批采购量','件',10,500,10,'用于估算资金占用与未售库存'],['sales','90 天预计销量','件',0,500,5,'情景销量不会超过首批采购量'],['sub','旧品替代比例','%',0,100,1,'新品销量中来自旧品迁移的比例']];
const advanced=[['freight','单位入仓运费','元',0,100,1,''],['fee','单件销售及售后费用','元',0,100,1,'渠道、履约与售后费用合计假设'],['fixed','上新固定成本','元',0,10000,100,''],['oldMargin','被替代旧品单位贡献','元',0,200,1,'用于简化替代损失测算']];
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2500)}
function fieldHtml([key,label,unit,min,max,step,hint]){const val=states[current.id][key];return `<div class="control"><div class="control-title"><label for="n-${key}">${label}</label><div class="number-box"><input id="n-${key}" type="number" min="${min}" max="${max}" step="${step}" data-key="${key}" value="${val}"><span>${unit}</span></div></div><input aria-label="${label}滑块" type="range" min="${min}" max="${max}" step="${step}" data-key="${key}" value="${val}">${hint?`<small>${hint}</small>`:''}</div>`}
function renderProduct(){
 $('#products').innerHTML=PRODUCTS.map(p=>`<button class="product-choice ${p.id===current.id?'selected':''}" data-product="${p.id}" aria-pressed="${p.id===current.id}"><img src="${p.image}" alt=""><span><small>${p.brand}</small><strong>${p.name}</strong><span class="choice-status">待补充资料</span></span></button>`).join('');
 $('#case-id').textContent=current.code;
 $('#product-visual').innerHTML=`<img src="${current.image}" class="${current.imageClass||''}" alt="${current.name}，来源于用户提供的产品资料"><span class="visual-label">${current.page}</span>`;
 $('#product-summary').innerHTML=`<div class="brand-name">${current.brand}</div><h2>${current.name}</h2><div class="product-subtitle">${current.subtitle}</div><div class="tag-list">${current.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>${current.facts.map(([a,b])=>`<div class="fact-row"><span>${a}</span><span>${b}</span></div>`).join('')}<a class="source-link" target="_blank" rel="noopener" href="${current.sourceLink}">${current.sourceLabel} ↗</a>`;
 $('#controls').innerHTML=fields.map(fieldHtml).join('')+`<details class="advanced"><summary>其他成本假设</summary>${advanced.map(fieldHtml).join('')}</details>`;
 $('#gate').checked=states[current.id].gate;
 renderResults();
}
function renderResults(){if(activeView!=='review')renderReport();const v=states[current.id],m=PurchaseModel.calculate(v),d=PurchaseModel.decision(v,v.gate);
 $('#mini-result').innerHTML=`<div class="mini-result ${m.profit<0?'loss':''}"><span>基准 · 增量贡献</span><strong>${money(m.profit)}</strong></div>`;
 $$('.review-tabs button').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===tab));b.tabIndex=b.dataset.tab===tab?0:-1});$('#tab-content').setAttribute('aria-labelledby',`tab-${tab}`);
 if(tab==='decision'){
 const peak=Math.max(1,...m.scenarios.map(s=>Math.abs(s.profit)));
 $('#tab-content').innerHTML=`<div class="decision-banner ${d.tone}"><div class="decision-icon">${v.gate?'↗':'!'}</div><div><h3>${d.label}</h3><p>${d.detail}</p></div><span class="status-label">${v.gate?'条件推演':'资料门槛'}</span></div><div class="section-label">90 天经营测算 <small>模拟数据 / 非收益预测</small></div><div class="metrics"><div class="metric"><div class="label">组合增量贡献利润</div><div class="value ${m.profit<0?'negative':'positive'}">${money(m.profit)}</div><small>已扣旧品替代损失与上新成本</small></div><div class="metric"><div class="label">首批资金需求</div><div class="value">${money(m.cash)}</div><small>含首批到仓成本及上新成本</small></div><div class="metric"><div class="label">盈亏平衡销量</div><div class="value">${m.breakEven===null?'—':m.breakEven}<span style="font-size:12px">${m.breakEven===null?'':' 件'}</span></div><small>${m.breakEven===null?'单位增量贡献非正，无法平衡':m.breakEven>v.qty?'超过首批数量，需调整条件':'按基准替代比例计算'}</small></div></div><div class="section-label">三个需求情景 <small>同一采购条件，不同销量与替代假设</small></div><div class="scenario-chart">${m.scenarios.map((s,i)=>`<div class="scenario-row ${i===1?'base':''}"><span>${s.name}</span><div class="bar-track"><div class="bar ${s.profit<0?'loss':''}" style="width:${Math.max(2,Math.abs(s.profit)/peak*100)}%"></div></div><strong class="${s.profit<0?'negative':''}">${money(s.profit)}</strong></div>`).join('')}<div class="chart-note">销量 ${m.scenarios.map(s=>s.sold).join(' / ')} 件 · 替代比例 ${m.scenarios.map(s=>s.sub+'%').join(' / ')}（保守 / 基准 / 乐观）<br>条长表示贡献金额的绝对值；红色与负号表示亏损。</div></div><div class="next-action"><b>建议下一步 →</b><span>${!v.gate?'先索取正式报价、型号与必要证明材料，再安排样品验收。':m.profit<=0?'测试更低的采购报价或更高的实际净售价，再决定是否试销。':'先限定规格和试销预算，记录真实销量、退货与旧品迁移，再决定是否扩单。'}</span></div><details class="formula-detail"><summary>查看计算口径与未售库存</summary><p>单位贡献 = ${v.price} − ${v.cost} − ${v.freight} − ${v.fee} = ${money(m.unit)}。<br>基准增量贡献 = ${m.scenarios[1].sold} × (${m.unit} − ${v.sub}% × ${v.oldMargin}) − ${v.fixed} = ${money(m.profit)}。<br>预计剩余 ${m.remaining} 件，按到仓成本计 ${money(m.remaining*(v.cost+v.freight))}；未售库存单列，不重复计入已售商品成本。未建模后续清仓损失、资金利息、税务抵扣和季节性变化。销量与替代率均为假设。</p></details>`;
 }else if(tab==='evidence'){
 $('#tab-content').innerHTML=`<div class="evidence-list">${current.claims.map((c,i)=>`<article><div class="evidence-title"><strong>0${i+1} / ${c.title}</strong><span>${c.state}</span></div><p>${c.text}</p><a href="${current.id!=='bkt'&&i===1?'assets/warmies-brand-book.pdf#page=4':current.sourceLink}" target="_blank" rel="noopener">${current.id!=='bkt'&&i===1?'品牌册第 4 页':current.page} ↗</a></article>`).join('')}</div><div class="source-warning">本演示只读取了用户附件，未进行外网事实核验。所有采购、库存与需求数字为模拟；品牌宣传不视为认证结论。</div>`;
 }else{
 $('#tab-content').innerHTML=`<div class="section-label" style="margin-top:0">同类 SKU 对比 <small>模拟库存 / 不代表真实在售商品</small></div><div class="table-wrap"><table><thead><tr><th>现有商品</th><th>售价</th><th>库存</th><th>90天销量</th><th>重叠</th></tr></thead><tbody>${current.inventory.map(r=>`<tr><td>${r.name}<small>${r.id}</small></td><td>${money(r.price)}</td><td>${r.stock}</td><td>${r.sales}</td><td><span class="overlap">${r.overlap}</span></td></tr>`).join('')}</tbody></table></div><div class="inventory-note">${current.inventory.map(r=>`<p><b>${r.name}：</b>${r.action}。</p>`).join('')}</div><div class="source-warning">相似商品不等于必然互相替代。此处只演示筛选逻辑；没有真实销售和试销证据，不形成清退名单。${current.id==='bkt'?' BKT 全颜色 × 尺寸可能占用 12 个名额，可先限定 1—2 个规格。':''}</div>`;
 }
}
function supplierPayload(p){return {name:p.name,brand:p.brand,source:p.source,page:p.page,status:'待补充资料',missing:[...p.missing]};}
function supplierMarkup(p){return `<div class="report-badge">供应商沟通草稿 · 根据所提供材料初筛 · 不构成采购承诺</div><div class="report-meta">${esc(p.brand)} / ${esc(p.name)} · 来源：${esc(p.source)}，${esc(p.page)}</div><h3>当前评估：${esc(p.status)}</h3><p>感谢提供产品资料。为继续评估供货可行性，请协助补充以下信息，收到后我们将安排进一步评审。</p><h3>请供应商补充</h3><ul>${p.missing.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><h3>样品与交付沟通</h3><p>请提供样品及对应的产品说明，明确质检验收方式、交付时间、售后责任和退换货流程。请按采购量梯度提供正式报价及有效期。</p><h3>后续安排</h3><p>资料完整后评审产品适配性及样品表现；具体采购数量、价格与交期以后续双方确认的订单为准。</p><h3>建议回复</h3><div class="report-quote">您好，已收到 ${esc(p.name)} 的资料，目前评估状态为待补充资料。请先提供上述文件、正式报价与样品条件，方便我们继续评审。感谢配合。</div>`}
function internalMarkup(p,v){const m=PurchaseModel.calculate(v),d=PurchaseModel.decision(v,v.gate);return `<div class="report-badge">内部评审 · 演示数据 · 不可作为正式采购依据</div><div class="report-meta">${esc(p.code)} / ${esc(p.name)} · 90天 / 人民币 · ${new Date().toLocaleDateString('zh-CN')}</div><h3>真实材料状态：待补充资料</h3><p>${esc(p.source)}，${esc(p.page)}。授权、检测及采购条款未核验，无实时外部市场证据。</p><h3>条件推演：${d.label}</h3><p>${d.detail} ${v.gate?'“资料通过”仅为演示假设，未改变实际材料状态。':''}</p><h3>模拟采购输入</h3><table><tbody>${[...fields,...advanced].map(([k,label,unit])=>`<tr><td>${label}</td><td>${v[k]} ${unit}</td></tr>`).join('')}</tbody></table><h3>90天经营测算</h3><p>单位贡献 ${money(m.unit)}；首批资金需求 ${money(m.cash)}；基准增量贡献 ${money(m.profit)}。盈亏平衡销量：${m.breakEven===null?'单位增量贡献非正，无法达到':m.breakEven+' 件'}。</p><table><thead><tr><th>情景</th><th>销量</th><th>替代比例</th><th>增量贡献</th></tr></thead><tbody>${m.scenarios.map(s=>`<tr><td>${s.name}</td><td>${s.sold}</td><td>${s.sub}%</td><td>${money(s.profit)}</td></tr>`).join('')}</tbody></table><p>基准预计剩余 ${m.remaining} 件，到仓库存价值 ${money(m.remaining*(v.cost+v.freight))}。增量贡献 = 销量 ×（售价 − 采购价 − 运费 − 销售及售后费用 − 替代比例 × 旧品贡献）− 上新成本。未建模后续清仓损失、资金利息及税务抵扣。</p><h3>模拟 SKU 组合建议</h3><ul>${p.inventory.map(r=>`<li>${r.id} ${r.name}：库存 ${r.stock}；90天销量 ${r.sales}；${r.action}。</li>`).join('')}</ul><h3>必要补件</h3><ul>${p.missing.map(t=>`<li>${t}</li>`).join('')}</ul><h3>人工复核与下一步</h3><p>采购负责人核对正式报价、证据和样品；真实经营数据接入后重新测算。试销关注动销、退货与旧品迁移，不自动下单或清退。</p><p>复核人：____________　结论：____________　日期：____________</p>`}
function renderReport(){
 const type=activeView,p=current,v={...states[p.id]};
 reportSnapshot={name:p.name,code:p.code,type,markup:type==='supplier'?supplierMarkup(supplierPayload(p)):internalMarkup(p,v)};
 $('#report-audience').textContent=type==='supplier'?'SUPPLIER FEEDBACK':'INTERNAL REVIEW';
 $('#report-title').textContent=type==='supplier'?'供应商反馈报告':'内部采购评审报告';
 $('#report-product').textContent=`${p.brand} · ${p.name} / ${p.code}`;
 $('#report-content').innerHTML=reportSnapshot.markup;
 $('#export-note').textContent=type==='supplier'?'对外文件仅包含补件及沟通要求，不含内部测算和库存。':'内部演示报告，包含模拟经营数据，请勿作为正式采购依据。';
}
function setView(view,scroll=true){
 activeView=['internal','supplier'].includes(view)?view:'review';
 const isReport=activeView!=='review';
 $('#review-view').hidden=isReport;$('#report-view').hidden=!isReport;
 $('.inspector').hidden=isReport;$('#reset').hidden=isReport;
 $('.workspace').classList.toggle('report-mode',isReport);
 $('.page-title h1').textContent=isReport?(activeView==='supplier'?'供应商视角':'内部评审'):'新品采购评审';
 $$('.view-navigation button').forEach(b=>{if(b.dataset.view===activeView)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 if(isReport)renderReport();
 try{history.replaceState(null,'',`#${activeView}`)}catch{}
 if(scroll)window.scrollTo({top:0,behavior:'instant'});
}
function openReport(type){setView(type)}
function reportDocument(){
 const r=reportSnapshot;if(!r)return '';
 const title=(r.type==='supplier'?'供应商反馈':'内部评审')+' · '+r.name;
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{max-width:780px;margin:40px auto;padding:0 25px;font:14px/1.8 "Microsoft YaHei",sans-serif;color:#263b30}h1{font-size:26px}h3{margin-top:26px;border-bottom:1px solid #ddd;padding-bottom:8px;break-after:avoid}.report-badge{background:#f4f0e6;padding:12px;color:#796442}.report-meta{color:#63705c;font-size:12px}table{border-collapse:collapse;width:100%}thead{display:table-header-group}tr{break-inside:avoid}td,th{padding:9px;text-align:left;border-bottom:1px solid #ddd}.report-quote{border-left:3px solid #97ad89;padding:15px;background:#f3f6ef}li{break-inside:avoid}@page{size:A4;margin:16mm}@media print{body{margin:0;padding:0;max-width:none;font-size:11pt}.report-badge{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>${esc(title)}</h1>${r.markup}</body></html>`;
}
function exportReport(){
 const r=reportSnapshot;if(!r)return;
 const url=URL.createObjectURL(new Blob([reportDocument()],{type:'text/html;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`${r.code}-${r.type}-report.html`;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已下载独立 HTML 报告');
}
function printReport(){
 if(!reportSnapshot)return;
 $('#print-frame')?.remove();
 const frame=document.createElement('iframe');frame.id='print-frame';frame.title='当前报告打印文档';frame.setAttribute('aria-hidden','true');
 frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;bottom:0;border:0';
 frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print()};
 frame.srcdoc=reportDocument();document.body.append(frame);
 toast('在打印窗口选择“另存为 PDF”，仅打印当前报告');
}
$('.view-navigation').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view)});
window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));
$('#products').addEventListener('click',e=>{const b=e.target.closest('[data-product]');if(!b)return;current=PRODUCTS.find(p=>p.id===b.dataset.product);renderProduct()});
$('.review-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;renderResults()});
$('.review-tabs').addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const tabs=$$('.review-tabs button');let i=tabs.indexOf(document.activeElement);i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[i].click();tabs[i].focus()});
$('#controls').addEventListener('submit',e=>e.preventDefault());
$('#controls').addEventListener('input',e=>{const el=e.target,key=el.dataset.key;if(!key)return;if(el.value===''||!Number.isFinite(Number(el.value)))return;const n=Number(el.value);if(n<Number(el.min)||n>Number(el.max)){el.setCustomValidity(`请输入 ${el.min} 到 ${el.max} 之间的数值`);return;}el.setCustomValidity('');states[current.id][key]=n;$$(`[data-key="${key}"]`).filter(x=>x!==el).forEach(x=>x.value=n);renderResults()});
$('#controls').addEventListener('change',e=>{const el=e.target,key=el.dataset.key;if(!key)return;if(!el.checkValidity()||el.value===''){el.value=states[current.id][key];el.setCustomValidity('');toast('已恢复最近有效值，请在范围内输入');}});
$('#gate').addEventListener('change',e=>{states[current.id].gate=e.target.checked;renderResults()});
$('#reset').addEventListener('click',()=>{states[current.id]={...current.defaults,gate:false};renderProduct();toast('已恢复本商品的演示假设')});
$('#evaluate').addEventListener('click',()=>{tab='decision';renderResults();$('#tab-content').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'center'});toast('已按当前参数重新计算，未进行联网查询')});
$$('[data-report]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.report)));
$('#close-report').addEventListener('click',()=>setView('review'));$('#export-report').addEventListener('click',exportReport);$('#print-report').addEventListener('click',printReport);
$('#guide').addEventListener('click',()=>$('#guide-dialog').showModal());$('#close-guide').addEventListener('click',()=>$('#guide-dialog').close());$('#start-guide').addEventListener('click',()=>{$('#guide-dialog').close();toast('先从左侧选择一个商品，查看原始资料')});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){const img=e.target;img.style.display='none';if(img.parentElement.id==='product-visual'){const note=document.createElement('p');note.className='missing-asset';note.textContent='本地产品图片未导入。请按 README 准备素材。';img.parentElement.prepend(note);}}},true);
renderProduct();
setView(location.hash.slice(1),false);
