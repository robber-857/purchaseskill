import {compareOffers,singlePrice,safeMarketURL,marketCoverURLs,marketRank,PLATFORMS,chinaMarketComparison} from '../lib/market.mjs';
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>safeMarketURL(url)?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`:e(label);
const n=value=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
function dateText(value){
  if(!value)return '';
  const date=new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(date):'';
}
function priceDisplay(o){
  if(singlePrice([o.verification?.price]))return [o.verification.price,'商品页标价，请与商家核对成交条件'];
  const matching=(o.ocr?.offers||[]).filter(x=>x.matchesCandidate);
  if(matching.length===1&&singlePrice([matching[0].priceText]))return [matching[0].priceText,o.ocr.buyerProvided?'买方截图中的标价，需与商品页核对':'商品页截图中的标价，规格待确认'];
  const indexed=singlePrice(o.priceMentions);
  if(indexed)return [indexed,'搜索摘要中的标价，请打开商品页核对'];
  if(o.priceMentions?.length>1||o.ocr?.offers?.length)return ['价格待确认','页面含多个规格或金额，请向商家确认对应单价'];
  if(o.verification?.status==='blocked'||o.ocr?.status==='blocked')return ['价格待确认','商品页要求登录或验证，可补充价格截图'];
  return ['价格待确认','可补充带规格、数量和标价的商品页截图'];
}
function ocrEvidence(o){
  if(!o.ocr)return '';
  const screenshotData=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(o.ocr.screenshotData||'')?o.ocr.screenshotData:null;
  const matching=(o.ocr.offers||[]).filter(p=>p.matchesCandidate);
  const offer=matching.length===1&&singlePrice([matching[0].priceText])?matching[0]:null;
  if(!offer&&!screenshotData&&!safeMarketURL(o.ocr.screenshotURL))return '';
  const checked=dateText(o.ocr.checkedAt);
  return `<details class="ocr-evidence"><summary>${o.ocr.buyerProvided?'买方提供的价格截图':'商品页截图依据'}</summary>
    ${checked?`<small>${e(checked)}</small>`:''}
    ${offer?`<div class="ocr-offer"><strong>${e(offer.title)} · ${e(offer.priceText)}</strong><p>规格 ${e(offer.specification)} · 单位 ${e(offer.unit)}</p><p>适用条件 ${e(offer.conditions)}</p></div>`:''}
    ${o.ocr.screenshotURL?link(o.ocr.screenshotURL,'打开截图'):''}
    ${screenshotData?`<img class="ocr-screenshot" src="${e(screenshotData)}" alt="买方提供的价格截图" loading="lazy">`:''}</details>`;
}
function marketCover(o,platform){
  // Stack the preferred photo last so an unavailable source reveals the next.
  const photos=marketCoverURLs(o).reverse().map(url=>`<div class="market-cover-photo">
    <span class="market-photo-mat"><i></i></span>
    <img src="${e(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">
  </div>`).join('');
  return `<div class="market-image" aria-hidden="true"><div class="market-cover-paper">
    <b>${e(platform)}</b><small>暂无可用商品图</small></div>${photos}</div>`;
}
const verificationLabel={
  page_observed:'已查看商品页，请核对具体规格、税费和运费。',
  blocked:'访问原页需要登录或验证。',failed:'商品页暂时无法打开，可稍后再试。',
  unavailable:'商品页暂时无法打开，可向商家索取最新报价。',
  unconfirmed:'尚未在商品页确认对应规格的价格。'
};
function candidateCards(items){
  return Object.entries(Object.groupBy(items,o=>o.product)).map(([product,candidates])=>`
    <div class="market-product-group"><h3>${e(product)} <small>${candidates.length} 个公开候选</small></h3>
    ${candidates.length===1?'<p class="market-coverage">目前只有一个来源，建议再核对一份同规格报价。</p>':''}
    <div class="market-cards">${candidates.map(o=>{
      const platform=PLATFORMS.find(p=>safeMarketURL(o.url,p.domain))?.name||o.platform;
      const [price,priceNote]=priceDisplay(o),checked=dateText(o.verification?.checkedAt||o.capturedAt);
      return `<article class="market-card">${marketCover(o,platform)}<div class="market-card-copy">
        <span class="outline-tag">${e(platform)} · ${e(o.ocr?.buyerProvided?'买方截图':o.kind)}</span>
        <h4>${link(o.url,o.title||product)}</h4><strong class="market-card-price">${e(price)}</strong><small>${e(priceNote)}</small>
        <div class="market-links">${link(o.url,'查看商品页')}</div>
        <details><summary>报价依据</summary>${checked?`<small>查看时间 ${e(checked)}</small>`:''}
        <p>${e(verificationLabel[o.verification?.status]||'请打开来源核对商品、规格与交易条件。')}</p>
        ${o.snippet?`<p>${e(o.snippet)}</p>`:''}
        ${marketCoverURLs(o).length?link(o.imageSourceURL||o.url,'查看图片来源'):''}</details>${ocrEvidence(o)}
        </div></article>`;
    }).join('')}</div></div>`).join('');
}
export function marketHTML(m){
  m=chinaMarketComparison(m);
  const rows=compareOffers(m?.offers,m?.baseline),valid=rows.filter(o=>o.comparable),items=Object.values(Object.groupBy(m?.items||[],o=>o.product)).flatMap(xs=>xs.sort((a,b)=>marketRank(b)-marketRank(a)).slice(0,3));
  const observed=items.filter(o=>o.verification?.amount>0&&o.verification?.currency);
  const groups=Object.groupBy(observed,o=>o.verification.currency);
  const states={needs_product:'待识别产品',not_configured:'自动搜索暂不可用',failed:'暂未取得搜索结果',partial:'部分平台检索完成',completed:'检索完成'};
  const heading='<div class="section-heading"><div><span class="section-index">比价</span><h2>相似产品与竞品价格</h2></div><p>买方内部使用</p></div>';
  const coverage=m?.searches?.length?`<details><summary>各平台搜索结果</summary><ul>${m.searches.map(s=>`<li>${e(s.product)} · ${e(s.platform)}：${e(({found:'找到候选',empty:'未检索到可用线索',failed:'暂未取得结果，可稍后重试'})[s.status]||'暂无结果')}</li>`).join('')}</ul></details>`:'';
  const updated=dateText(m?.capturedAt);
  const status=m?.status?`<p><strong>${e(states[m.status]||'尚未检索')}</strong>${updated?' · '+e(updated):''}</p>`:'';
  if(!items.length&&!rows.length&&!m?.baseline){
    return `<section id="market-comparison" class="market-section">${heading}${status}
      <p class="data-needed">此报告暂无可对照的报价。可补充产品型号或同规格商品的链接、起订量和到货单价。</p>${coverage}</section>`;
  }
  return `<section id="market-comparison" class="market-section">${heading}
    <div class="overview-grid"><div><span>公开候选</span><strong>${items.length}</strong><p>关键词线索，尚未确认为同款</p></div><div><span>人工核对报价</span><strong>${rows.length}</strong><p>买方录入，非平台独立认证</p></div><div><span>同口径批发报价</span><strong>${valid.length}</strong><p>规格、数量、单位、币种及税运一致</p></div><div><span>可比单价范围</span><strong>${valid.length?`${e(m.baseline.currency)} ${n(Math.min(...valid.map(o=>o.price)))}–${n(Math.max(...valid.map(o=>o.price)))}`:'待补充'}</strong><p>不混入零售券后价</p></div></div>
    ${status}${coverage}
    ${observed.length?`<h3>已读取商品页标价</h3><p>商品页标价可作市场参考。请在采购前与商家确认对应规格、采购数量和到货价。</p><div class="market-links">${Object.entries(groups).map(([currency,xs])=>`<strong>${e(currency)}：${n(Math.min(...xs.map(o=>o.verification.amount)))}–${n(Math.max(...xs.map(o=>o.verification.amount)))} · ${xs.length} 个候选</strong>`).join('')}</div><div class="table-scroll"><table class="market-reading-table"><thead><tr><th>相似商品 / 来源</th><th>商品页价格</th><th>规格与价格证据</th></tr></thead><tbody>${observed.map(o=>`<tr><td>${link(o.url,o.verification.productTitle)}<small>${e(o.platform)}</small></td><td data-label="商品页价格"><strong>${e(o.verification.price)}</strong><small>商品页参考 · ${e(o.verification.availability)}<br>${e(dateText(o.verification.checkedAt))}</small></td><td data-label="规格与价格依据"><details><summary>查看商品页原文与选项</summary><pre style="white-space:pre-wrap">${e(o.verification.excerpt)}</pre></details></td></tr>`).join('')}</tbody></table></div>`:''}
    ${items.length?candidateCards(items):'<div class="data-needed">暂无可对照的商品。可补充具体型号重新搜索，或录入已核对的商品链接和报价。</div>'}
    <h3>采购报价对照</h3><p>${m?.baseline?`供应商基准：${e(m.baseline.product)} · ${e(m.baseline.currency)} ${n(m.baseline.price)} / ${e(m.baseline.unit)} · 数量 ${n(m.baseline.quantity)} · ${m.baseline.taxShippingIncluded?'已确认含税到货':'税运待确认'}`:'尚未录入供应商基准，无法计算价差。'}</p>
    ${rows.length?`<div class="table-scroll"><table class="market-reading-table"><caption>同一采购数量下的报价差异</caption><thead><tr><th>商品 / 商家 / 来源</th><th>规格与采购条件</th><th>价格 / 数量</th><th>交付与售后</th><th>可比性与价差</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${link(o.url,o.title)}<small>${e(o.platform)} · ${e(o.seller||'商家待确认')}<br>评估对象：${e(o.product)}<br>核对日期 ${e(o.observedAt)}</small></td><td data-label="规格与采购条件">${e(o.model||'规格待确认')}<small>${e(o.conditions||'其他条件待确认')}<br>${o.taxShippingIncluded?'含税到货':'税运待确认'} · ${o.sameSpecification?'买方确认规格可替代':'规格待核验'}</small></td><td data-label="价格与数量">${e(o.currency)} ${n(o.price)} / ${e(o.unit)}<small>${e(o.kind)} · 起订量 ${n(o.moq)}<br>适用数量 ${n(o.quantity)}</small></td><td data-label="交付与售后">${e(o.delivery||'交期待确认')}<small>${e(o.afterSales||'售后待确认')}</small></td><td data-label="可比性与价差">${o.comparable?`单价差 ${n(o.delta)}（${n(o.deltaPercent)}%）<small>采购总额 ${n(o.total)} ${e(o.currency)}<br>较基准节省 ${n(o.savings)} ${e(o.currency)}</small>`:e(o.reasons.join('；'))}</td></tr>`).join('')}</tbody></table></div>`:'<p>可补充平台商品链接、规格、实际报价、起订量、税运、交付及售后，形成可复核的采购对照。</p>'}
    <p class="brief-boundary">比价仅供买方内部使用。采购前请核对同款规格、起订量、税费与运费。</p></section>`;
}
const input=(name,label,value='',type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${required?'required':''} ${type==='number'?'min="0.0001" max="1000000000" step="any"':'maxlength="300"'}></label>`;
const check=(name,label,value=false)=>`<label class="market-check"><input name="${name}" type="checkbox" ${value?'checked':''}>${label}</label>`;
const currencies=(value='CNY')=>`<label>币种<select name="currency">${['CNY'].map(x=>`<option ${x===value?'selected':''}>${x}</option>`).join('')}</select></label>`;
export function marketEditor(m){
  m=chinaMarketComparison(m);
  const b=m?.baseline||{},product=b.product||m?.queries?.[0]||'';
  return `<section class="market-editor" id="market-editor"><h2>完善内部比价资料</h2><p>只检索公开产品名称。内部成本、库存与采购底价不会发送到搜索服务。</p><form id="market-search"><label>公开产品名称 / 型号<input name="keyword" required maxlength="100" value="${e(m?.queries?.[0]||'')}" placeholder="例如：304不锈钢保温杯 500ml"></label><button class="secondary">检索1688与淘宝</button></form><p id="market-status" role="status"></p><details><summary>核对1688 / 淘宝公开商品链接</summary><form id="market-sources"><label>每行一个1688或淘宝商品链接，最多4个<textarea name="sourceUrls" required maxlength="8000" placeholder="https://detail.1688.com/offer/商品编号.html"></textarea></label><p>如商品页需要登录，可在下方提交价格截图。</p><button class="secondary">读取商品页价格</button></form></details>
    <details><summary>页面需要登录？上传价格截图识别</summary><form id="market-screenshot"><label>1688 / 淘宝来源链接<input type="url" name="sourceURL" required maxlength="2000"></label><label>截图中的目标商品名称<input name="title" required maxlength="300"></label><label>包含商品名称、规格、价格与优惠条件的截图<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required></label><p>请截取一款商品，同时保留规格和对应标价。截图仅用于内部比价。</p><button class="secondary">识别截图中的商品价格</button></form></details>
    <details><summary>设置供应商基准报价</summary><form id="market-baseline" class="market-form">${input('product','评估产品',product,'text',true)}${input('price','供应商单价',b.price||'','number',true)}${currencies(b.currency)}${input('unit','计价单位',b.unit||'件','text',true)}${input('quantity','计划采购数量',b.quantity||'','number',true)}${check('taxShippingIncluded','确认供应商报价含税到货',b.taxShippingIncluded)}<button class="primary">保存基准报价</button></form></details>
    <details><summary>添加已核对的相似产品报价</summary><form id="market-offer" class="market-form">${input('product','评估产品（与基准一致才比价）',product,'text',true)}<label>来源平台<select name="platform">${PLATFORMS.map(p=>`<option>${p.name}</option>`).join('')}</select></label>${input('title','竞品名称','','text',true)}<label>商品来源链接<input type="url" name="url" required maxlength="2000" placeholder="https://对应平台商品页"></label>${input('seller','商家')}${input('model','型号 / 材质 / 尺寸 / 包装')}<label>价格类型<select name="kind"><option>批发</option><option>零售</option></select></label>${input('price','核对单价','','number',true)}${currencies()}${input('unit','计价单位',b.unit||'件','text',true)}${input('moq','最小起订量','','number',true)}${input('quantity','报价适用数量',b.quantity||'','number',true)}${input('delivery','交期 / 发货地')}${input('afterSales','质保 / 退换 / 售后')}${input('conditions','阶梯价格 / 优惠 / 其他条件')}${input('observedAt','价格核对日期','','date',true)}${check('sameSpecification','已人工确认规格满足同一需求')}${check('taxShippingIncluded','已确认该单价含税到货')}<button class="primary">加入内部对比表</button></form></details>
    ${m?.offers?.length?`<details><summary>管理已录入报价（${m.offers.length}）</summary>${m.offers.map((o,i)=>`<p>${e(o.title)} · ${e(o.platform)} <button class="text-button" data-remove-offer="${i}">移除</button></p>`).join('')}</details>`:''}</section>`;
}
