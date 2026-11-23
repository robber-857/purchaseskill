import {compareOffers,singlePrice,safeMarketURL,marketCoverURLs,marketRank,marketProducts,isSingleProductURL,PLATFORMS,chinaMarketComparison} from '../lib/market.mjs';
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>safeMarketURL(url)?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`:e(label);
const n=value=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
function dateText(value){
  if(!value)return '';
  const date=new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(date):'';
}
function priceDisplay(o){
  if(o.priceEvidence?.priceText)return [o.priceEvidence.priceText+(o.priceIsFrom?' 起':''),o.priceConditions||(o.priceEvidence.origin==='buyer_upload'?'买方截图标价，规格待核对':'原页截图标价，规格与成交条件待核对')];
  if(singlePrice([o.verification?.price]))return [o.verification.price,'商品页标价，请与商家核对成交条件'];
  const matching=(o.ocr?.offers||[]).filter(x=>x.matchesCandidate);
  if(matching.length===1&&singlePrice([matching[0].priceText]))return [matching[0].priceText,o.ocr.buyerProvided?'买方截图中的标价，需与商品页核对':'商品页截图中的标价，规格待确认'];
  const indexed=singlePrice(o.priceMentions);
  if(indexed)return [indexed,'搜索摘要中的标价，请打开商品页核对'];
  if(o.priceMentions?.length>1||o.ocr?.offers?.length)return ['价格待确认','页面含多个规格或金额，请向商家确认对应单价'];
  if(o.verification?.status==='blocked'||o.ocr?.status==='blocked')return ['价格待确认','商品页要求登录或验证，可补充价格截图'];
  return ['价格待确认','可补充带规格、数量和标价的商品页截图'];
}
function validImage(value){
  return typeof value==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}
function evidenceControl(item){
  const id=item.priceEvidence?.id;
  if(item.priceEvidence?.exportUnavailable)return '<small>价格截图未能读取，未收录于本文件。</small>';
  const offlineId=item.exportProofId||(validImage(item.priceEvidence?.embedded)?id:null);
  if(offlineId)return `<a class="offline-proof-open" href="#price-proof-${e(offlineId)}">查看价格截图</a>`;
  if(validImage(item.ocr?.screenshotData))return `<details class="inline-proof"><summary>查看买方价格截图</summary><img alt="买方提供的价格截图" src="${e(item.ocr.screenshotData)}"></details>`;
  if(typeof id==='string'&&/^[a-f0-9]{64}$/i.test(id))return `<button type="button" class="proof-open text-button" data-price-proof="${e(id)}">查看价格截图</button>`;
  if(item.ocr?.screenshotUnavailable||item.ocr?.screenshotURL)return '<small>历史截图未归档</small>';
  return '';
}
export function evidenceAppendix(m){
  if(!m)return '';
  const sheets=new Map(),missing=[];
  for(const item of [...(m.items||[]),...(m.historyItems||[])]){
    const proof=item.priceEvidence;
    if(proof?.exportUnavailable){
      missing.push(e([item.product,item.title,proof.priceText].filter(Boolean).join(' · ')));
      continue;
    }
    const id=proof?.id||item.exportProofId;
    const image=proof?.embedded||(item.exportProofId&&item.ocr?.screenshotData);
    if(!id||sheets.has(id)||!validImage(image))continue;
    const source=proof?.sourceURL||item.url;
    const origin=proof?.origin==='buyer_upload'||item.ocr?.buyerProvided?'买方提供的截图':'商品页截图';
    const date=dateText(proof?.capturedAt||item.ocr?.checkedAt||item.capturedAt);
    sheets.set(id,`<figure class="price-proof-sheet" id="price-proof-${e(id)}" tabindex="-1">
      <figcaption><h3>${e(item.title||item.product)}</h3><p>${e([origin,proof?.priceText,date].filter(Boolean).join(' · '))}</p>
      ${isSingleProductURL(source)?link(source,'打开商品原页'):''}</figcaption>
      <input type="checkbox" class="proof-scale" id="scale-${e(id)}"><label for="scale-${e(id)}">按原始尺寸查看（可滑动）</label>
      <div class="price-proof-pan" tabindex="0" aria-label="商品与价格截图"><img alt="${e(item.title||item.product)}的价格截图" src="${e(image)}"></div>
      <a class="proof-back" href="#market-comparison">返回逐款比价</a></figure>`);
  }
  if(!sheets.size&&!missing.length)return '';
  return `<section class="price-proof-appendix"><h2>价格截图凭证</h2>${[...sheets.values()].join('')}
    ${missing.length?`<p>以下截图未能读取，未收录于本文件。</p><ul>${[...new Set(missing)].map(title=>`<li>${title}</li>`).join('')}</ul>`:''}</section>`;
}
function marketCover(o,platform){
  const preview=o.archivedCover;
  if(o.priceEvidence?.id&&preview?.proofId===o.priceEvidence.id&&preview?.data?.length<26000&&/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(preview.data)){
    return `<div class="market-image market-archived-photo"><img loading="lazy" alt="${e(o.title)}，采集时商品图" src="${e(preview.data)}"></div>`;
  }
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
export function listingId(item){
  const proof=item.priceEvidence;
  if(!/^[a-f0-9]{64}$/.test(proof?.id||''))return null;
  // The same screenshot can serve different products or variants. A stable
  // suffix preserves each relationship when rows are reordered or archived.
  const identity=JSON.stringify([item.product,proof.sourceURL||item.url,proof.capturedAt,proof.priceText]);
  let hash=14695981039346656037n;
  for(const byte of new TextEncoder().encode(identity))hash=BigInt.asUintN(64,(hash^BigInt(byte))*1099511628211n);
  return 'listing-'+proof.id+'-'+hash.toString(36);
}
function listingLink(item){
  const id=listingId(item);
  return id?`<a class="listing-link" href="#${id}">商品留档</a>`:'';
}
function listingRecords(items){
  const records=new Map(),proofs=new Set();
  for(const item of items){
    const id=listingId(item);
    if(!id||records.has(id))continue;
    const proof=item.priceEvidence,source=proof.sourceURL||item.url;
    const platform=PLATFORMS.find(p=>safeMarketURL(source,p.domain))?.name||item.platform;
    const [price,conditions]=priceDisplay(item);
    const matched=item.similarity?.matched?.join('、'),missing=item.similarity?.missing?.join('、');
    const access=item.sourceAccess==='login'?'直接访问原页时要求登录。':item.sourceAccess==='verification'?'直接访问原页时要求完成平台验证。':'';
    const short=proofs.has(proof.id)?'':`<span class="listing-alias" id="listing-${proof.id}" data-listing-target="${id}"></span>`;
    proofs.add(proof.id);
    records.set(id,`${short}<section class="listing-record" id="${id}" aria-labelledby="${id}-title" tabindex="-1">
      <p class="report-kicker">${e(platform)} · 商品留档</p><h3 id="${id}-title">${e(item.originalPageTitle||item.title||item.product)}</h3>
      <p>对应采购款式：${e(item.product)}</p>
      <dl><dt>留档标价</dt><dd><strong>${e(price)}</strong> · ${e(conditions)}</dd>
      <dt>采集时间</dt><dd>${e(dateText(proof.capturedAt||item.capturedAt)||'原记录未注明')}</dd>
      <dt>相似点</dt><dd>${e(matched||'原记录未注明，待核对')}</dd>
      <dt>差异及待核规格</dt><dd>${e(missing||'具体规格与交易条件仍待核对')}</dd></dl>
      ${item.variantTextEvidence?`<p><b>商品页规格选项原文</b>　${e(item.variantTextEvidence)}</p>`:''}
      ${item.verification?.excerpt?`<details><summary>查看留档时的商品页文字</summary><blockquote>${e(item.verification.excerpt)}</blockquote></details>`:''}
      ${access?`<p class="listing-access">${access} 可在本报告查看采集时保存的价格截图。</p>`:''}
      <div class="market-links">${evidenceControl(item)}${isSingleProductURL(source)?link(source,'查看官方商品页'):''}<a href="#market-comparison">返回逐款比价</a></div>
    </section>`);
  }
  return [...records.values()].join('');
}
function candidateCard(o){
  const platform=PLATFORMS.find(p=>safeMarketURL(o.url,p.domain))?.name||o.platform;
  const [price,priceNote]=priceDisplay(o);
  const checked=dateText(o.verification?.checkedAt||o.capturedAt);
  const matches=o.similarity?.matched||[],missing=o.similarity?.missing||[];
  const showCover=o.archivedCover?.data||marketCoverURLs(o).length||!o.priceEvidence?.id;
  return `<article class="market-card${showCover?'':' market-text-card'}"><div class="market-product-heading">${showCover?marketCover(o,platform):''}<div>
    <h4>${link(o.url,o.title||o.product)}</h4><strong class="market-card-price">${e(price)}</strong></div></div>
    <div class="market-card-copy"><p class="market-price-note">${e(priceNote)}</p>
    ${matches.length?`<p class="market-spec"><b>相似点</b><span>${e(matches.join('、'))}</span></p>`:''}
    ${missing.length?`<p class="market-spec"><b>待核规格</b><span>${e(missing.join('、'))}</span></p>`:''}
    <div class="market-links">${evidenceControl(o)}${listingLink(o)}${link(o.url,'查看商品页')}</div>
    <details><summary>报价依据</summary>${checked?`<small>采集于 ${e(checked)}</small>`:''}
    ${o.discoveryQuery && o.discoveryURL?`<p>自动检索词：${e(o.discoveryQuery)}</p>`:o.sourceType==='rechecked_source'?'<p>从历史商品链接重新核验。</p>':''}
    <p>${e(verificationLabel[o.verification?.status]||'请核对页面中的规格和交易条件。')}</p>
    ${o.ocr?.offers?.length===1?`<p>${e([o.ocr.offers[0].specification,o.ocr.offers[0].unit,o.ocr.offers[0].conditions].filter(Boolean).join(' · '))}</p>`:''}
    ${marketCoverURLs(o).length?link(o.imageSourceURL||o.url,'查看图片来源'):''}</details></div></article>`;
}
function currentItems(m){
  const items=m?.items||[];
  if(m?.version!==2)return items;
  const names=new Set((m.products||[]).map(p=>p.name));
  const rows=new Map();
  for(const item of items.filter(i=>names.has(i.product))){
    const key=JSON.stringify([item.product,safeMarketURL(item.url)]);
    const old=rows.get(key);
    if(!old||!old.priceEvidence?.id||(item.priceEvidence?.id&&Date.parse(item.capturedAt)>=Date.parse(old.capturedAt)))rows.set(key,item);
  }
  return [...rows.values()];
}
export function marketForReport(r){
  const m=r.marketComparison||{};
  if(m.products?.length)return m;
  const targets=marketProducts(r,r.files||[]);
  if(!targets.length)return m;
  const names=new Set(targets.map(t=>t.name));
  return {...m,products:targets,items:(m.items||[]).filter(i=>names.has(i.product)),
    historyItems:[...(m.historyItems||[]),...(m.items||[]).filter(i=>!names.has(i.product))]};
}
export function coverageSummary(m){
  if(!m?.products?.length)return '';
  const items=currentItems(m);
  const covered=new Set(items.filter(i=>i.similarity?.matched?.length&&(i.verification?.readable||i.priceEvidence?.id)).map(i=>i.product));
  const withProof=new Set(items.filter(i=>i.priceEvidence?.id).map(i=>i.product));
  const comparable=new Set(compareOffers(m.offers||[],m.baseline).filter(o=>o.comparable).map(o=>o.product));
  return `<a href="#market-comparison" class="market-summary-link"><span>逐款市场比价</span><strong>${covered.size} / ${m.products.length} 款有匹配线索</strong><span>${withProof.size} 款有价格截图 · ${comparable.size} 款有可比批发报价</span><b aria-hidden="true">↓</b></a>`;
}
const searchState={empty:'未找到相符的公开商品',failed:'检索暂不可用，请稍后重试',not_configured:'搜索服务尚未配置',blocked:'商品页要求登录或验证'};
function productGroups(m,items,editable){
  const descriptors=m?.products?.length?m.products:[...new Set([...items.map(i=>i.product),...(m?.searches||[]).map(s=>s.product)])].map(name=>({name}));
  return descriptors.map(({name,attributes=[]},index)=>{
    const candidates=items.filter(i=>i.product===name);
    return `<section class="market-sku" id="market-sku-${index}"><header class="market-sku-head"><div><h3>${e(name)}</h3>
      ${attributes.length?`<p>${e(attributes.join(' · '))}</p>`:''}</div>
      ${editable?`<button type="button" class="secondary market-refresh" data-refresh-product="${e(name)}">更新这一款</button>`:''}</header>
      <div class="platform-pair">${PLATFORMS.map(p=>{
        const records=(m?.searches||[]).filter(s=>s.product===name&&s.platform===p.name);
        const s=records.at(-1);
        const found=candidates.filter(i=>Boolean(safeMarketURL(i.url,p.domain))).sort((a,b)=>marketRank(b)-marketRank(a));
        const why=s?.reason||searchState[s?.status]||(s?'本次没有可展示的单品':'尚未逐款检索');
        const confirmed=m?.version===2?found.filter(i=>i.priceEvidence?.id):found;
        const leads=found.filter(i=>!confirmed.includes(i));
        const tracked=Number.isInteger(s?.automaticProofCount) && !s.reviewed;
        const fresh=tracked?confirmed.filter(i=>i.capturedAt===s.capturedAt && i.discoveryQuery && i.discoveryURL && ['marketplace','linked_detail'].includes(i.sourceType)):confirmed;
        const saved=tracked?confirmed.filter(i=>!fresh.includes(i)):[];
        return `<div class="platform-column"><h4 class="platform-heading"><span>${e(p.name)} <small>${p.id==='1688'?'批发':'零售'}</small></span><small>${found.length} 个公开候选</small></h4>
        ${tracked?`<p class="market-coverage">本轮自动找到并留有价格截图：${fresh.length} 个</p>`:''}
        ${fresh.length?fresh.map(candidateCard).join(''):`<p class="platform-empty">${e(tracked&&why?why:leads.length?'尚无带价格截图的匹配商品。':why)}</p>`}
        ${saved.length?`<details><summary>其他已留档商品（${saved.length}）</summary>${saved.map(candidateCard).join('')}</details>`:''}
        ${leads.length?`<details><summary>待核商品线索（${leads.length}）</summary>${leads.map(candidateCard).join('')}</details>`:''}
        ${s?.capturedAt?`<small class="market-checked">最近检索 ${e(dateText(s.capturedAt))}</small>`:''}</div>`;
      }).join('')}</div></section>`;
  }).join('');
}
export function marketHTML(m,{editable=false}={}){
  m=chinaMarketComparison(m);
  const rows=compareOffers(m?.offers,m?.baseline),valid=rows.filter(o=>o.comparable),items=currentItems(m);
  const observed=items.filter(o=>o.verification?.amount>0&&o.verification?.currency);
  const groups=Object.groupBy(observed,o=>o.verification.currency);
  const states={needs_product:'待识别产品',not_configured:'自动搜索暂不可用',failed:'暂未取得搜索结果',partial:'部分平台检索完成',completed:'检索完成'};
  const heading='<div class="section-heading"><h2>相似产品与竞品价格</h2></div>';
  const coverage=m?.searches?.length?`<details><summary>各平台搜索结果</summary><ul>${m.searches.map(s=>`<li>${e(s.product)} · ${e(s.platform)}：${e(({found:'找到候选',empty:'未检索到可用线索',failed:'暂未取得结果，可稍后重试'})[s.status]||'暂无结果')}</li>`).join('')}</ul></details>`:'';
  const updated=dateText(m?.capturedAt);
  const status=m?.status?`<p><strong>${e(states[m.status]||'尚未检索')}</strong>${updated?' · '+e(updated):''}</p>`:'';
  if(!items.length&&!rows.length&&!m?.baseline&&!m?.products?.length&&!m?.searches?.length&&!m?.historyItems?.length){
    return `<section id="market-comparison" class="market-section">${heading}${status}
      <p class="data-needed">此报告暂无可对照的报价。可补充产品型号或同规格商品的链接、起订量和到货单价。</p>${coverage}</section>`;
  }
  const proofCount=items.filter(item=>item.priceEvidence?.id).length;
  const jump=m?.products?.length>1?`<details class="market-contents"><summary>跳至款式（${m.products.length} 款）</summary><ul>${m.products.map((p,i)=>`<li><a href="#market-sku-${i}">${e(p.name)}</a></li>`).join('')}</ul></details>`:'';
  return `<section id="market-comparison" class="market-section">${heading}
    <dl class="market-metrics">
      <div><dt>公开候选</dt><dd>${items.length}</dd></div>
      <div><dt>已归档价格截图的候选</dt><dd>${proofCount}</dd></div>
      <div><dt>同口径批发报价</dt><dd>${valid.length}</dd></div>
    </dl>
    ${valid.length?`<p>可比单价范围：${e(m.baseline.currency)} ${n(Math.min(...valid.map(o=>o.price)))}–${n(Math.max(...valid.map(o=>o.price)))}；按相同规格、数量、单位及税运条件核对。</p>`:''}
    <div class="market-status-line">${status}${jump}</div>
    ${productGroups(m,items,editable)}
    ${coverage}
    ${observed.length?`<details class="market-observed"><summary>已读取商品页标价（${observed.length}）</summary><p>商品页标价可作市场参考。请在采购前与商家确认对应规格、采购数量和到货价。</p><div class="market-links">${Object.entries(groups).map(([currency,xs])=>`<strong>${e(currency)}：${n(Math.min(...xs.map(o=>o.verification.amount)))}–${n(Math.max(...xs.map(o=>o.verification.amount)))} · ${xs.length} 个候选</strong>`).join('')}</div><div class="table-scroll"><table class="market-reading-table"><thead><tr><th>相似商品 / 来源</th><th>商品页价格</th><th>规格与价格证据</th></tr></thead><tbody>${observed.map(o=>`<tr><td>${link(o.url,o.verification.productTitle)}<small>${e(o.platform)}</small></td><td data-label="商品页价格"><strong>${e(o.verification.price)}</strong><small>商品页参考 · ${e(o.verification.availability)}<br>${e(dateText(o.verification.checkedAt))}</small></td><td data-label="规格与价格依据"><details><summary>查看商品页原文与选项</summary><pre style="white-space:pre-wrap">${e(o.verification.excerpt)}</pre></details></td></tr>`).join('')}</tbody></table></div></details>`:''}
    ${listingRecords([...(m?.items||[]),...(m?.historyItems||[])])}
    ${m?.historyItems?.length?`<details class="market-history"><summary>以往检索记录（${m.historyItems.length}）</summary><p>记录保留采集时的款式归属和日期。</p>${m.historyItems.map(i=>`<div><span>${e(i.product)} · ${e(dateText(i.capturedAt))}</span> ${isSingleProductURL(i.url)&&!['redirected','unavailable','blocked'].includes(i.verification?.status)?link(i.url,i.title||'商品页'):e(i.title||'未核实的来源')} ${listingLink(i)} ${evidenceControl(i)}</div>`).join('')}</details>`:''}
    <h3>采购报价对照</h3><p>${m?.baseline?`供应商基准：${e(m.baseline.product)} · ${e(m.baseline.currency)} ${n(m.baseline.price)} / ${e(m.baseline.unit)} · 数量 ${n(m.baseline.quantity)} · ${m.baseline.taxShippingIncluded?'已确认含税到货':'税运待确认'}`:'尚未录入供应商基准，无法计算价差。'}</p>
    ${rows.length?`<div class="table-scroll"><table class="market-reading-table"><caption>同一采购数量下的报价差异</caption><thead><tr><th>商品 / 商家 / 来源</th><th>规格与采购条件</th><th>价格 / 数量</th><th>交付与售后</th><th>可比性与价差</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${link(o.url,o.title)}<small>${e(o.platform)} · ${e(o.seller||'商家待确认')}<br>评估对象：${e(o.product)}<br>核对日期 ${e(o.observedAt)}</small></td><td data-label="规格与采购条件">${e(o.model||'规格待确认')}<small>${e(o.conditions||'其他条件待确认')}<br>${o.taxShippingIncluded?'含税到货':'税运待确认'} · ${o.sameSpecification?'买方确认规格可替代':'规格待核验'}</small></td><td data-label="价格与数量">${e(o.currency)} ${n(o.price)} / ${e(o.unit)}<small>${e(o.kind)} · 起订量 ${n(o.moq)}<br>适用数量 ${n(o.quantity)}</small></td><td data-label="交付与售后">${e(o.delivery||'交期待确认')}<small>${e(o.afterSales||'售后待确认')}</small></td><td data-label="可比性与价差">${o.comparable?`单价差 ${n(o.delta)}（${n(o.deltaPercent)}%）<small>采购总额 ${n(o.total)} ${e(o.currency)}<br>较基准节省 ${n(o.savings)} ${e(o.currency)}</small>`:e(o.reasons.join('；'))}</td></tr>`).join('')}</tbody></table></div>`:'<p>可补充平台商品链接、规格、实际报价、起订量、税运、交付及售后，形成可复核的采购对照。</p>'}
    <p class="brief-boundary">比价仅供买方内部使用。采购前请核对同款规格、起订量、税费与运费。</p></section>`;
}
const input=(name,label,value='',type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${required?'required':''} ${type==='number'?'min="0.0001" max="1000000000" step="any"':'maxlength="300"'}></label>`;
const check=(name,label,value=false)=>`<label class="market-check"><input name="${name}" type="checkbox" ${value?'checked':''}>${label}</label>`;
const currencies=(value='CNY')=>`<label>币种<select name="currency">${['CNY'].map(x=>`<option ${x===value?'selected':''}>${x}</option>`).join('')}</select></label>`;
export function marketEditor(m,targets=[]){
  m=chinaMarketComparison(m);
  const b=m?.baseline||{},product=b.product||m?.queries?.[0]||'';
  const names=targets.map(t=>t.name).filter(Boolean);
  const selectProduct=(label)=>names.length?`<label>${label}<select name="product">${names.map(name=>`<option value="${e(name)}">${e(name)}</option>`).join('')}</select></label>`:'';
  return `<section class="market-editor" id="market-editor"><h2>完善内部比价资料</h2><form id="market-search">${selectProduct('供应商款式')}<label>补充检索词<input name="keyword" ${names.length?'':'required'} maxlength="100" placeholder="例如：茶水分离 600ml"></label><button class="secondary">检索淘宝与1688</button></form><p id="market-status" role="status"></p><details><summary>核对1688 / 淘宝公开商品链接</summary><form id="market-sources">${selectProduct('对应款式')}<label>每行一个1688或淘宝商品链接，最多4个<textarea name="sourceUrls" required maxlength="8000" placeholder="https://detail.1688.com/offer/商品编号.html"></textarea></label><p>如商品页需要登录，可在下方提交价格截图。</p><button class="secondary">读取商品页价格</button></form></details>
    <details><summary>页面需要登录？上传价格截图识别</summary><form id="market-screenshot">${selectProduct('对应款式')}<label>1688 / 淘宝来源链接<input type="url" name="sourceURL" required maxlength="2000"></label><label>截图中的目标商品名称<input name="title" required maxlength="300"></label><label>包含商品名称、规格、价格与优惠条件的截图<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required></label><p>请截取一款商品，同时保留规格和对应标价。截图仅用于内部比价。</p><button class="secondary">识别截图中的商品价格</button></form></details>
    <details><summary>设置供应商基准报价</summary><form id="market-baseline" class="market-form">${input('product','评估产品',product,'text',true)}${input('price','供应商单价',b.price||'','number',true)}${currencies(b.currency)}${input('unit','计价单位',b.unit||'件','text',true)}${input('quantity','计划采购数量',b.quantity||'','number',true)}${check('taxShippingIncluded','确认供应商报价含税到货',b.taxShippingIncluded)}<button class="primary">保存基准报价</button></form></details>
    <details><summary>添加已核对的相似产品报价</summary><form id="market-offer" class="market-form">${input('product','评估产品（与基准一致才比价）',product,'text',true)}<label>来源平台<select name="platform">${PLATFORMS.map(p=>`<option>${p.name}</option>`).join('')}</select></label>${input('title','竞品名称','','text',true)}<label>商品来源链接<input type="url" name="url" required maxlength="2000" placeholder="https://对应平台商品页"></label>${input('seller','商家')}${input('model','型号 / 材质 / 尺寸 / 包装')}<label>价格类型<select name="kind"><option>批发</option><option>零售</option></select></label>${input('price','核对单价','','number',true)}${currencies()}${input('unit','计价单位',b.unit||'件','text',true)}${input('moq','最小起订量','','number',true)}${input('quantity','报价适用数量',b.quantity||'','number',true)}${input('delivery','交期 / 发货地')}${input('afterSales','质保 / 退换 / 售后')}${input('conditions','阶梯价格 / 优惠 / 其他条件')}${input('observedAt','价格核对日期','','date',true)}${check('sameSpecification','已人工确认规格满足同一需求')}${check('taxShippingIncluded','已确认该单价含税到货')}<button class="primary">加入内部对比表</button></form></details>
    ${m?.offers?.length?`<details><summary>管理已录入报价（${m.offers.length}）</summary>${m.offers.map((o,i)=>`<p>${e(o.title)} · ${e(o.platform)} <button class="text-button" data-remove-offer="${i}">移除</button></p>`).join('')}</details>`:''}</section>`;
}
