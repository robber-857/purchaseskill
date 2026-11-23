// Only public product identity and a bounded set of product attributes go to the search provider.
// Never submit free-form descriptions, procurement notes, costs, or the contents of a source file.
const categories = [
  ['茶叶', /乌龙|岩茶|红茶|绿茶|白茶|黑茶|普洱|铁观音|茉莉花茶|高山茶|茶叶|茶包|袋泡茶|抹茶|玄米茶|金萱|龙井|oolong|matcha|\btea\b/i],
  ['水杯', /钛杯|钛[^，。；]{0,4}杯|保温杯|水杯|水壶|茶杯|玻璃杯|马克杯|咖啡杯|随行杯|运动杯|直饮杯|饮水杯|杯子|tumbler|thermos|bottle/i],
  ['袜', /袜|\bsocks?\b/i],
  ['毛绒玩具', /毛绒|毛絨|玩偶|公仔|玩具|布偶|plush|stuffed|warmies/i],
];
const specifications = /\d+(?:\.\d+)?\s*(?:毫升|ml|升|千克|公斤|kg|克|g|毫米|mm|厘米|cm|英寸|寸|公分|盎司|oz)(?![a-z])|s31603|s30408|316l|304不锈钢|316不锈钢|不锈钢|钛杯|纯钛|保温杯|水杯|敞口|吸管口|吸管|茶水分离|一杯三饮|三饮|双饮|四种饮用方式|密封|丝巾|发圈|手绘|提手|双层|真空|玻璃|陶瓷|便携|防漏|中筒|短筒|长筒|船袜|运动|毛圈|纯棉|羊毛|混纺|毛绒|毛絨|加热|微波|企鹅|恐龙|蓝色龙|薰衣草|乌龙|岩茶|红茶|绿茶|白茶|黑茶|普洱|铁观音|抹茶|玄米|高山|冻顶|金萱|茉莉|蜜香|龙井|茶包|袋泡|散茶|礼盒/gi;
const featurePriority=['丝巾','发圈','茶水分离','三饮','一杯三饮','手绘','吸管口','双饮','四种饮用方式','钛杯','企鹅','蓝色龙','冻顶','高山','蜜香','中筒','短筒','毛圈','加热','薰衣草','316l','s31603','s30408'];
const generic = new Set('产品 商品 候选 型号 系列 品牌 造型 样品 按照 识别 初筛 资料 待定 供应商 款式 规格 未知 采购 原料 组合 装 市场 包装'.split(' '));
const identities = [
  /企鹅|恐龙|蓝色龙|小熊|兔子|独角兽|海豚|长颈鹿/g,
  /乌龙|岩茶|红茶|绿茶|白茶|黑茶|普洱|铁观音|抹茶|玄米|龙井/g,
  /高山|冻顶/g,
  /中筒|短筒|长筒|船袜/g,
];
const segmenter = new Intl.Segmenter('zh', {granularity:'word'});
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/毫升/g,'ml').replace(/厘米|公分/g,'cm').replace(/毫米/g,'mm').replace(/千克|公斤/g,'kg').replace(/克/g,'g').replace(/毛絨/g,'毛绒');
const unique = values => [...new Set(values.filter(Boolean))];
const withoutNotes = name => name.replace(/[（(][^()（）]*(?:识别|待确认|未确认|示意|推测)[^()（）]*[）)]/g,'').trim();

function attributesOf(text) {
  return unique((String(text || '').match(specifications) || []).map(normalize));
}
function termsOf(text) {
  return unique([...segmenter.segment(normalize(text))].filter(x => x.isWordLike && x.segment.length >= 2 && !generic.has(x.segment)).map(x=>x.segment));
}
const titleText = value => normalize(value)
  .replace(/三种饮用方式|一盖三饮/g,'三饮').replace(/一杯三饮/g,'三饮')
  .replace(/四种饮用方式|一盖四饮/g,'四饮').replace(/茶水分离式|茶水分离/g,'茶水分离')
  .replace(/束发圈|头绳|发绳/g,'发圈').replace(/大杯口/g,'宽口');
function supplierRef(ref, files) {
  return Number.isInteger(ref?.source) && files[ref.source] && files[ref.source].role !== 'internal';
}
function wordsFromSpecs(...texts){
  // A carton measurement describes the outside box, even when the same paragraph names a cup capacity.
  const clauses=texts.flatMap(s=>String(s||'').split(/[，,；;。！？\n]/)).filter(s=>
    !/(?:未知|尚未|未提|未给|不详|待确认|需确认|箱规|外箱|装箱|包装尺寸|成本|采购价|零售价|库存|利润|底价)/.test(s));
  const text=clauses.join(' ');
  const attrs=attributesOf(text);
  if(/杯体|杯盖|杯口|杯身|水杯|保温杯|吸管盖/.test(text))attrs.push('水杯');
  if(text.includes('可拆卸'))attrs.push('可拆卸');
  if(/大杯口|宽口/.test(text))attrs.push('宽口');
  return unique(attrs);
}
export function marketProducts(report, files = report?.files || [], keyword = '') {
  const named = (report?.products || []).filter(p => p.name && supplierRef(p, files));
  const range = (report?.assessment?.rangeReview?.products || []).filter(p => p.name && p.refs?.length && p.refs.every(r => supplierRef(r, files)));
  const products = named.length ? named : range;
  const mapped = products.map(p => {
    const ranged=range.find(r=>r.name===p.name)||range.find(r=>r.name.startsWith(p.name+' ')||r.name.startsWith(p.name+'GM-'));
    const supplier=report?.supplierReview?.products?.find(r=>r.name===p.name && r.refs?.length && r.refs.every(ref=>supplierRef(ref,files)));
    const attributes = wordsFromSpecs(p.description,ranged?.specification,supplier?.specification,p.specification);
    return {name:p.name, keyword, attributes};
  });
  if (!mapped.length && keyword.trim()) mapped.push({name:keyword,keyword,attributes:[]});
  return [...new Map(mapped.map(p=>[p.name,p])).values()].slice(0,12);
}
export function productPlan(input) {
  const legacy = typeof input === 'string';
  const name = String(legacy ? input : input?.name || '').trim().slice(0,160);
  const label = withoutNotes(name);
  const keyword = legacy ? '' : String(input?.keyword || '').trim().slice(0,100);
  const supplied=(input?.attributes || []).filter(t=>['可拆卸','宽口'].includes(t));
  const attributes = unique([...attributesOf(label), ...attributesOf((input?.attributes || []).join(' ')),...supplied]).slice(0,24);
  const category = categories.find(([, pattern])=>pattern.test(label)) || categories.find(([, pattern])=>pattern.test(attributes.join(' ')));
  const terms = termsOf(label);
  const dimensional=attributes.find(t=>/^\d+(?:\.\d+)?(?:ml|oz|g|kg)$/.test(t));
  const specific=[...featurePriority,'可拆卸','宽口'].filter(t=>attributes.includes(t));
  const kind=attributes.find(t=>['钛杯','保温杯'].includes(t))||category?.[0];
  const other=attributes.filter(t=>t!==kind&&t!==category?.[0]&&t!==dimensional&&!specific.includes(t)&&!/^\d/.test(t));
  const identity=specific.find(t=>t!==kind)||other.find(t=>t!==category?.[0]&&t!=='礼盒');
  const gift=attributes.includes('礼盒')?'礼盒':'';
  const known=Boolean(kind&&(identity||dimensional));
  const features=specific.filter(t=>t!==kind&&!/^s\d+$/.test(t));
  const phrase=(...parts)=>unique(parts).join(' ');
  const accessory=attributes.find(t=>t==='丝巾'||t==='发圈');
  const use=attributes.find(t=>['吸管','茶水分离','毛圈','加热','袋泡','散茶'].includes(t));
  // Retail titles rarely contain all the supplier's dimensions, mechanisms and package contents.
  // Search one identifying axis at a time; other attributes still participate in ranking.
  const primary = legacy||!known ? label : gift&&accessory ? phrase(kind,gift,accessory)
    : phrase(kind,dimensional,kind==='钛杯'&&dimensional?'':use||features[0]||identity);
  const alternate=gift&&accessory ? phrase(kind,dimensional,use) : phrase(kind||label,features[0]||identity||dimensional,gift);
  const hasMetalCup=category?.[0]==='水杯'&&attributes.some(t=>/不锈钢|^s(?:30408|31603)$|^316l$|钛杯/.test(t));
  const giftBody=hasMetalCup&&kind==='水杯'?'保温杯':kind;
  // Distinct search angles for a set: its actual contents, a related accessory, the base item,
  // and packaged alternatives. Broader search words are never copied into the supplier spec.
  const giftQueries=gift&&accessory?unique([
    phrase(giftBody,gift,accessory),phrase(giftBody,gift,accessory==='丝巾'?'围巾':'头绳'),
    phrase(kind,dimensional,use),phrase(giftBody,dimensional&&'"'+dimensional+'"'),
    phrase(giftBody,gift,'套装'),primary
  ]):[];
  const variants=giftQueries.length?giftQueries:keyword ? [primary,phrase(kind||label,keyword),alternate] : [primary,alternate,phrase(kind||label,dimensional)];
  if(giftQueries.length&&keyword)variants.splice(1,0,phrase(kind,keyword));
  const queries=legacy?[label]:unique(variants).filter(query=>query===primary || query!==kind);
  const relatedAccessory=accessory==='丝巾'?'围巾':'头绳';
  const packageQueries=gift&&accessory?unique([
    phrase('"'+giftBody+'"','"'+accessory+'"'),
    phrase('"'+giftBody+'"','"'+relatedAccessory+'"'),
    phrase(relatedAccessory,giftBody,'伴手礼'),
    phrase('"'+relatedAccessory+'+'+giftBody+'"'),
    phrase(giftBody,accessory,'礼品套装')
  ]):[];
  // When a bundle cannot be confirmed, preserve the supplier's target but search its base
  // product by capacity and material/mechanism. This keeps a single cup labelled as such.
  const bodyQueries=[];
  if(gift&&accessory&&category?.[0]==='水杯'&&dimensional){
    const volume='"'+dimensional+'"';
    const grade=attributes.find(t=>/^(?:316l|316不锈钢|304不锈钢|纯钛)$/.test(t));
    const mechanisms=unique([...attributes.filter(t=>['双饮','三饮','茶水分离','可拆卸','宽口','防漏'].includes(t)),use]);
    if(grade)bodyQueries.push(phrase(giftBody,volume,grade),phrase(giftBody,volume,grade,mechanisms[0]));
    for(const mechanism of mechanisms.slice(0,2))bodyQueries.push(phrase(giftBody,volume,mechanism));
    if(dimensional.endsWith('ml'))bodyQueries.push(phrase(giftBody,dimensional.replace('ml','毫升'),mechanisms[0]||grade));
    bodyQueries.push(phrase(giftBody,volume));
  }
  return {name,keyword,attributes,category,terms,legacy,queries,packageQueries,bodyQueries:unique(bodyQueries),companion:gift?accessory:undefined};
}

// Search indexes often quote one selectable combination while the heading only names a gift.
// Such navigation hints must be confirmed on the linked official page before publication.
export function indexedPackageMatch(plan,title,snippet){
  if(!plan.companion||plan.category?.[0]!=='水杯')return null;
  const parts=String(snippet||'').split(/[，,；;。|]|\.{2,}/);
  const accessory=plan.companion==='丝巾'?/丝巾|围巾|方巾|领巾/:/发圈|发绳|头绳/;
  for(const part of parts){
    if(part.length>140||!accessory.test(part)||!/[+＋]|套装含|套装内含/.test(part)||!plan.category[1].test(part))continue;
    const match=productSimilarity(plan,title+' '+part);
    if(match.score)return match;
  }
  return null;
}

export function indexedBodyMatch(plan,title,snippet){
  if(!plan.bodyQueries.length||!plan.category[1].test(title))return null;
  // A query token or an unrelated number in the description is not a product
  // specification. Accept only the platform's labelled capacity field.
  const field=String(snippet||'').match(/容量\s*[:：]\s*((?:\d+(?:\.\d+)?\s*(?:ml|毫升|oz)\s*[、，,/]*\s*){1,8})/i)?.[1];
  if(!field)return null;
  const match=productSimilarity(plan,title+' '+field);
  return match.score&&plan.attributes.some(t=>/^\d+(?:\.\d+)?(?:ml|oz)$/.test(t)&&match.matched.includes(t))?match:null;
}

export function productSimilarity(plan, title) {
  const visible = titleText(title);
  const words = unique([...plan.attributes, ...plan.terms]);
  const matched = words.filter(term=>{
    const value=titleText(term);
    if(/^\d+(?:\.\d+)?(?:ml|oz|g|kg|mm|cm)$/.test(value)){
      return new RegExp('(?<![\\d.])'+value.replace('.','\\.')+'(?![a-z])').test(visible);
    }
    return visible.includes(value);
  });
  // “钛杯” is also written as e.g. “纯钛双层保温杯”. Do not infer a pure titanium body.
  if(plan.attributes.includes('钛杯')&&!matched.includes('钛杯')&&/(?:纯钛|钛合金|钛金属).{0,16}(?:杯|壶)/.test(visible))matched.push('钛杯');
  const missing = plan.attributes.filter(t=>!matched.includes(t));
  const relatedScarf=missing.includes('丝巾')&&visible.match(/围巾|领巾|方巾/)?.[0];
  if(relatedScarf)matched.push(relatedScarf+'配件（与目标丝巾的材质待核）');
  const categoryMatch = Boolean(plan.category?.[1].test(visible));
  const accessory = /(?:配件|替换盖|杯套|杯盖|杯刷|杯托|茶具|空礼盒|包装盒|空盒|标签贴纸|裁剪纸样|衣服配饰|钩织图解)/;
  // Official specifications for complete cups label the lid's material/type.
  // A literal "杯盖" in that field name does not describe the item being sold.
  const listingIdentity=visible.replace(/杯盖(?:类型|材质|结构|款式|形状|颜色)/g,'');
  const unrelatedAccessory = accessory.test(listingIdentity) && !accessory.test(plan.name) && !/(?:附赠|含|带|配|含有)(?:杯套|杯盖|杯刷)/.test(visible);
  const exact = Boolean(visible && visible.includes(normalize(withoutNotes(plan.name))));
  const identityConflict=identities.some(pattern=>{
    const wanted=normalize(plan.name).match(pattern)||[];
    if(!wanted.length)return false;
    // A different animal, type of tea or sock length is a substantive conflict.
    const offered=visible.match(pattern)||[];
    return offered.length ? !wanted.some(term=>offered.includes(term)) :
      (pattern===identities[0] && !wanted.some(term=>visible.includes(term.replace(/^蓝色/,''))));
  });
  const model=plan.name.match(/\b[a-z]{1,8}[-_]\d{2,}[a-z0-9-]*\b/i)?.[0];
  const categoryOnly=new Set(['水杯','礼盒','保温杯','杯子','茶叶','不锈钢']);
  const required=plan.attributes.filter(t=>!categoryOnly.has(t));
  const namedDetail=matched.some(t=>required.includes(t)||(!categoryOnly.has(t)&&plan.terms.includes(t)));
  const enoughDetail=!required.length || namedDetail || Boolean(relatedScarf);
  const titaniumMismatch=plan.attributes.includes('钛杯')&&!/钛|titanium/i.test(visible);
  const substance=plan.category?categoryMatch:matched.some(t=>!/^\d+(?:\.\d+)?(?:ml|cm|mm|kg|g|oz)?$/.test(t))&&(!model||visible.includes(normalize(model)));
  const substantiveMatch=matched.length>0 && enoughDetail && !titaniumMismatch && substance;
  const sizes=plan.attributes.filter(t=>/^\d+(?:\.\d+)?(?:ml|oz|g|kg)$/.test(t));
  const sizeHit=sizes.some(t=>matched.includes(t));
  const targetAccessory=plan.companion;
  const isCupSet=plan.category?.[0]==='水杯'&&Boolean(targetAccessory);
  const metalBody=plan.attributes.some(t=>/不锈钢|^s(?:30408|31603)$|^316l$|钛杯/.test(t));
  const plasticCup=/塑料(?:吸管|随手|保温|随行|运动|水)?杯|tritan|太空杯|冷水壶/.test(visible)&&!/不锈钢|(?:316|304)(?:l|钢)|纯钛|钛合金/.test(visible);
  const box=/(?:礼盒|礼品套装|伴手礼套装)/.test(visible);
  const contents=visible.match(/(?:雨伞|折叠伞|晴雨伞|围巾|手套|丝巾|发圈|方巾|眼罩|毛巾|笔记本|钢笔|签字笔)/)?.[0];
  const companion=targetAccessory&&matched.includes(targetAccessory);
  if(isCupSet&&box&&!matched.includes('礼盒'))matched.push('礼品套装');
  if(isCupSet&&box&&contents&&!companion&&!relatedScarf)matched.push('礼盒标题列有'+contents+'（与目标配件不同）');
  const comparableSet=!isCupSet||Boolean(companion||relatedScarf||sizeHit||(box&&contents));
  const assortment=/周边集合|商品合集|差价专拍|链接集合|补差价|多款任选/.test(visible);
  const related=!assortment&&!unrelatedAccessory&&!identityConflict&&!(isCupSet&&metalBody&&plasticCup)&&comparableSet&&
    (exact||substantiveMatch||(categoryMatch&&isCupSet&&box&&contents));
  // Price and thumbnails cannot promote an unrelated category into a similar product.
  const specificHits=matched.filter(t=>featurePriority.includes(t)||t==='纯钛').length;
  const setBonus=isCupSet?(companion?35:relatedScarf?27:box&&contents?15:0):0;
  const score = related ? Math.min(100, 22 + matched.length*5 + (categoryMatch?10:0) + Math.min(18,specificHits*8)
    + (sizeHit?20:0) + (box&&plan.attributes.includes('礼盒')?6:0) + setBonus + (exact?25:0)) : 0;
  return {score,matched,missing};
}
