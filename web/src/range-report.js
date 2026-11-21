// The same sections are used in the app, standalone HTML and printed reports.
export function rangeSections(report, {escape, heading, citation}) {
  const review = report.assessment?.rangeReview;
  const products = review?.products || [];
  const sources = refs => (refs || []).map(citation).join(' ');
  const list = items => `<ul class="report-list">${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
  const quoteRow = p => `<tr>
    <td><strong>${escape(p.name)}</strong><small>${escape(p.specification)}</small>${sources(p.refs)}</td>
    <td data-label="供货报价">${escape(p.quote)}</td>
    <td data-label="建议零售价">${escape(p.retailPrice)}</td>
    <td data-label="评估顺序">${escape(p.recommendation)}</td></tr>`;
  const priceTable = products.length ? `<div class="table-scroll"><table class="range-price-table reading-table">
    <thead><tr><th>产品与规格</th><th>供货报价</th><th>建议零售价</th><th>评估顺序</th></tr></thead>
    <tbody>${products.map(quoteRow).join('')}</tbody></table></div>` : '';

  function productGroup(label, items) {
    if (!items.length) return '';
    return `<div class="product-group"><h3>${escape(label)}</h3><div class="product-rows">${items.map(p => `<article>
      <div><h4>${escape(p.name)}</h4><p class="range-role">${escape(p.role)}</p></div>
      <div><p>${escape(p.reason)}</p><p class="range-condition"><strong>推进条件</strong> ${escape(p.conditions)}</p>${sources(p.refs)}</div>
      </article>`).join('')}</div></div>`;
  }
  const legacyProducts = report.products.map(p => `<article class="analysis-row"><h3>${escape(p.name)}</h3><p>${escape(p.description)}</p>${citation(p)}</article>`).join('');
  const groups = ['优先评估','第二阶段','暂缓','待确认'].map(label => productGroup(label, products.filter(p => p.recommendation === label))).join('');
  const candidates = `<section id="candidates">${heading('候选产品与评估顺序')}${groups || legacyProducts || '<p>请先向供应商确认拟供产品名称与型号。</p>'}</section>`;
  const opportunities = report.assessment?.opportunities || [];
  const highlights = `<section id="highlights">${heading('合作机会')}${opportunities.map(x => `<article class="analysis-row"><h3>${escape(x.title)}</h3><p>${escape(x.detail)}</p>${sources(x.refs)}</article>`).join('') || '<p>合作优势待确认，可请供应商补充产品特点及对应依据。</p>'}</section>`;

  const requirements = review?.requirements?.length ? review.requirements : [{category:'需确认的资料',items:report.missing}];
  const steps = review?.steps || report.nextSteps.map(detail => ({detail}));
  const actions = `<section id="requirements">${heading('补充资料清单')}<dl class="requirement-list">${requirements.map(x => `<div><dt>${escape(x.category)}</dt><dd>${list(x.items)}</dd></div>`).join('')}</dl></section>
    <section id="actions">${heading('推进步骤')}<ol class="range-steps">${steps.map(x => `<li>${x.title ? `<h3>${escape(x.title)}</h3>` : ''}<p>${escape(x.detail)}</p></li>`).join('')}</ol></section>`;
  return {priceTable, candidates, highlights, actions};
}
