// Only inspect the price block directly attached to the item's own heading.
// Recommendation tiles, login prompts, shipping charges and SKU option rows
// sit outside this block and cannot establish the page's headline price.
const amountPattern = /^(?:[¥￥]|CNY)\s*(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(起|起售|起批))?$/i;
const norm = value => String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const cleanTitle = value => String(value||'').replace(/\s*(?:[-|_]\s*(?:淘宝|Taobao|Tmall|阿里巴巴|1688).*)$/i,'').trim();
const simpleLine = value => value
  .replace(/!\[[^\]]*\]\([^\n)]*\)/g,'')
  .replace(/^#{1,6}\s+|\*\*/g,'').trim();

// A header price on a page selling both a bundle and a loose component cannot
// establish what the bundle costs. Only inspect options inside the buying panel.
const looseComponentPattern=/(?:单(?:本|杯|巾|伞|笔)装|仅(?:杯子|本子|笔记本|礼盒|包装盒)|不含(?:杯子|水杯|保温杯))/;
function buyingOptions(lines,prior) {
  // On 1688 the item's structured variant table often precedes its headline.
  let looseComponent='';
  for(const row of prior){
    const cell=/^\|\s*(?:封面颜色|颜色分类|颜色|款式|规格|套餐|型号)\s*\|\s*([^|]{1,3000})\|/.exec(row)?.[1];
    const option=cell?.split(/[、，,；;]/).find(label=>looseComponentPattern.test(label));
    if(option){looseComponent=option.trim().slice(0,80);break;}
  }
  let inOptions=false;
  const variants=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i].replace(/\\([*+#])/g,'$1');
    if(/^(?:登录查看全部规格|分销代发|商品详情|商品属性|店铺推荐|商家推荐|相关推荐|同店推荐|为你推荐|猜你喜欢|商品评价)/.test(line))break;
    if(/^(?:封面颜色|颜色分类|颜色|款式|规格|套餐|型号|尺寸|容量)(?:$|[：:|\s])/.test(line))inOptions=true;
    if(!inOptions||line.length>140)continue;
    if(!looseComponent&&looseComponentPattern.test(line))looseComponent=line;
    const price=amountPattern.exec(lines[i+1]||'');
    if(price&&!price[2]&&Number(price[1].replaceAll(',',''))>0&&/[+＋]|套装含|套装内含/.test(line))variants.push({label:line,priceText:'¥'+price[1]});
  }
  return {looseComponent,variants};
}

export function matchingBundleVariant(plan,header){
  if(!plan?.companion||!header?.variants?.length)return null;
  const companion=plan.companion==='丝巾'?/丝巾|围巾|方巾|领巾/:/发圈|头绳|发绳/;
  const insulated=plan.category?.[0]==='水杯'&&plan.attributes.some(s=>/保温杯|不锈钢|钛杯|s(?:30408|31603)|316l/.test(s));
  const main=insulated?/保温杯|随行杯|真空杯|钛杯|不锈钢杯/:plan.category?.[1];
  return header.variants.find(v=>companion.test(v.label)&&main?.test(v.label))||null;
}

// A quote for a selectable combination must appear beside that combination in
// both the actual seller page and its image. The overall headline is independent.
export function screenshotVariant(ocr,variant){
  if(ocr?.status!=='read'||!variant)return null;
  const expected=norm(variant.label);
  const amount=Number(variant.priceText.slice(1).replaceAll(',',''));
  const row=ocr.offers.find(offer=>{
    const price=amountPattern.exec(offer.priceText.trim());
    if(!offer.matchesCandidate||!price||price[2]||Number(price[1].replaceAll(',',''))!==amount)return false;
    const block=String(offer.evidenceText||'').normalize('NFKC');
    const at=block.search(/(?:[¥￥]|CNY)\s*\d/i);
    return at>=0&&norm(block.slice(0,at)).endsWith(expected)&&
      Number(block.slice(at).match(/(?:[¥￥]|CNY)\s*(\d[\d,]*(?:\.\d{1,2})?)/i)?.[1]?.replaceAll(',',''))===amount;
  });
  return row?{priceText:variant.priceText,priceIsFrom:false,conditions:'原页规格行「'+variant.label+'」的标价，采购数量和税运条件待核对。'}:null;
}

export function bundleMismatch(plan,similarity,header,priceIsFrom=header?.priceIsFrom){
  if(!plan?.companion)return '';
  if(priceIsFrom && header?.looseComponent)return '商品页同时出售「'+header.looseComponent+'」，页面起价未注明对应目标套装。';
  if(!similarity?.score)return '';
  const matched=similarity.matched;
  const companion=matched.includes(plan.companion)||matched.some(label=>label.includes('与目标'+plan.companion+'的材质待核'));
  const body=matched.some(label=>plan.attributes.includes(label)&&
    /^(?:\d+(?:\.\d+)?(?:ml|oz|cm|mm|g|kg)|s\d{5}|316l|(?:304|316)不锈钢|纯钛|钛杯|茶水分离|一杯三饮|三饮|四种饮用方式|手绘)$/.test(label));
  return companion||body?'':'原页仅匹配通用礼盒、品类或赠品，未确认目标配件或杯身的具体规格。';
}

export function incompatibleMaterial(plan,record=''){
  const intent=[plan?.name,...(plan?.attributes||[])].join(' ');
  if(!/钛杯|纯钛|钛合金(?:保温|随行|水)?杯/.test(intent))return '';
  const steel=/(?:内胆材质|杯身材质)\s*[:：|\s]*((?:SUS\s*)?(?:304|316)L?\s*(?:食品级)?\s*不锈钢|不锈钢(?:\s*(?:304|316)L?)?)/i.exec(record);
  if(!steel||/(?:内胆材质|杯身材质)\s*[:：|\s]*(?:纯钛|钛金属|钛合金|TA[123])/i.test(record))return '';
  return '原页规格标明'+steel[0].replace(/[|\s]+/g,'')+'，未确认钛材内胆或杯身。';
}

export function sameListingTitle(a,b) {
  const x=norm(a), y=norm(b);
  if(!x||!y)return false;
  if(x===y)return true;
  const short=x.length<=y.length?x:y, long=x.length<=y.length?y:x;
  // Some official Taobao pages render the name as an ellipsised prefix.
  if(short.length>=6&&long.startsWith(short))return true;
  if(short.length<9||short.length/long.length<0.8)return false;
  // Permit isolated OCR glyph errors, but never silently change a model or capacity.
  if(x.match(/\d+/g)?.join('/')!==y.match(/\d+/g)?.join('/'))return false;
  const pairs=new Set(Array.from({length:long.length-1},(_,i)=>long.slice(i,i+2)));
  let shared=0;
  for(let i=0;i<short.length-1;i++)if(pairs.has(short.slice(i,i+2)))shared++;
  return shared/(short.length-1)>=0.85;
}

export function listingHeader(data,indexTitle='') {
  const md=String(data.markdown||'');
  const metadata=data.metadata||{};
  const pageTitle=cleanTitle(metadata.ogTitle||metadata['og:title']||metadata.title);
  const lines=md.split('\n').map(simpleLine).filter(Boolean);
  for(let i=1;i<lines.length;i++){
    const price=amountPattern.exec(lines[i]);
    if(!price||Number(price[1].replaceAll(',',''))<=0)continue;
    let label=lines[i-1]==='价格'?lines[i-2]:lines[i-1];
    // A shop rating sometimes appears alone between the heading and the price label.
    if(lines[i-1]==='价格'&&/^[0-5]\.\d$/.test(label))label=lines[i-3];
    if(!label||!sameListingTitle(label,pageTitle||indexTitle))continue;
    const category=md.match(/^[^\n]{0,1400}\/list\/category\/[^\n]*$/m)?.[0];
    const categories=category?[...category.matchAll(/\[([^\]]+)\]\(https:\/\/www\.taobao\.com\/list\/category\//g)].slice(-2).map(m=>m[1]):[];
    // Read structured marketplace labels, never text from other listed products.
    const specs=[...md.matchAll(/^\|\s*(容量|材质|内胆材质|杯身材质|外壳材质|杯子种类|杯盖类型)\s*\|\s*([^|\r\n]{1,70})\s*\|/gm)].slice(0,8).map(m=>m[1]+' '+m[2].trim());
    for(const m of md.matchAll(/^(内胆材质|杯身材质|外壳材质)[:：\t ]*([\p{L}\d、,，/ -]{1,32})$/gmu))specs.push(m[1]+' '+m[2]);
    const priceIsFrom=Boolean(price[2]||/^起(?:售|批)?$/.test(lines[i+1]||''));
    const options=buyingOptions(lines.slice(i+1,i+181),lines.slice(Math.max(i-160,0),i));
    return {title:label,priceText:'¥'+price[1],priceIsFrom,...options,details:[...new Set([...categories,...specs])].join(' '),
      excerpt:[label,lines[i],...(priceIsFrom?['起']:[])].join('\n')};
  }
  return null;
}

export function screenshotOffer(ocr,header,title) {
  if(ocr?.status!=='read')return null;
  const offers=ocr.offers.flatMap(offer=>{
    const price=amountPattern.exec(offer.priceText.trim());
    if(!price)return [];
    const titleAgrees=sameListingTitle(offer.title,header?.title||title);
    if(!titleAgrees)return [];
    if(!offer.matchesCandidate&&!header)return [];
    const amount=Number(price[1].replaceAll(',',''));
    if(!Number.isFinite(amount)||amount<=0)return [];
    if(header&&Number(header.priceText.slice(1).replaceAll(',',''))!==amount)return [];
    return [{amount,priceText:'¥'+price[1],priceIsFrom:Boolean(price[2]||/起价|起售价|起批价|页面起价/.test(offer.conditions)),conditions:offer.conditions}];
  });
  if(!offers.length||new Set(offers.map(x=>x.amount)).size!==1)return null;
  if(!header&&offers.length>1)return null;
  const from=Boolean(header?.priceIsFrom||offers.some(x=>x.priceIsFrom));
  const conditions=from?'商品页展示起价；具体规格、采购数量及税运条件待核对。':
    (offers[0].conditions&&offers[0].conditions!=='未知'?offers[0].conditions+'；':'')+'截图所示页面标价，具体规格及成交条件待核对。';
  return {priceText:header?.priceText||offers[0].priceText,priceIsFrom:from,conditions};
}
