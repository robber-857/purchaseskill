import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVisualPrices,readMarketScreenshot} from '../lib/market-vision.mjs';
import {verifyMarketSources,marketRank,MarketInputSchema} from '../lib/market.mjs';
import {marketHTML} from '../src/market-report.js';
import {listingHeader,screenshotOffer,incompatibleMaterial} from '../lib/market-listing.mjs';
const offer={title:'保温杯500ml',priceText:'￥19.90',currency:'CNY',specification:'500ml',unit:'只',conditions:'100只起订，税运未知',evidenceText:'保温杯500ml ￥19.90 100只起订',matchesCandidate:true};
test('OCR keeps visible price evidence, drops capacity and refuses login screenshots',()=>{
  assert.equal(validateVisualPrices({blocked:false,offers:[offer]}).offers.length,1);
  assert.equal(validateVisualPrices({blocked:false,offers:[{...offer,priceText:'500ml'}]}).offers.length,0);
  assert.equal(validateVisualPrices({blocked:false,offers:[{...offer,priceText:'￥29.90'}]}).offers.length,0);
  assert.equal(validateVisualPrices({blocked:true,offers:[offer]}).offers.length,0);
  assert.throws(()=>validateVisualPrices({blocked:false,offers:[{...offer,currency:'USD'}]}));
});
test('unpriced single products attempt screenshot OCR; login pages do not',async()=>{
  let calls=0;const item={url:'https://detail.1688.com/offer/123.html',pageType:'product',title:'保温杯',product:'杯',priceMentions:[],platform:'1688'};
  for(const blocked of [false,true]){
    const result=await verifyMarketSources({items:[{...item}]},{key:'test',fetcher:async(_url,options)=>{
      assert.ok(JSON.parse(options.body).formats.some(x=>x.type==='screenshot'));
      return {ok:true,json:async()=>({success:true,data:{markdown:blocked?'密码登录短信登录':'保温杯',screenshot:'https://storage.googleapis.com/screen.png'}})};
    },visionReader:async()=>{calls++;return validateVisualPrices({blocked:false,offers:[offer]});}});
    assert.equal(result.items[0].ocr.status,blocked?'blocked':'read');
    const html=marketHTML(result);assert.match(html,blocked?/登录/:/￥19.90/);
    assert.equal(result.items[0].verification.amount,undefined);
  }
  assert.equal(calls,1);
});
test('pricing evidence outranks image-only hits and cannot promote OCR into verified offers',()=>{
  assert.ok(marketRank({priceMentions:['￥20']})>marketRank({imageUrl:'x',pageType:'product'}));
  const html=marketHTML({items:[{url:'https://s.1688.com/kq/cups.html',product:'杯',title:'杯',priceMentions:[],ocr:{status:'read',offers:[{...offer,matchesCandidate:false}],note:'待核验'}}]});
  assert.doesNotMatch(html,/market-card-price|￥19.90/);
  assert.doesNotMatch(html,/已读取商品页标价/);
});

test('an explicitly empty automatic product photo stays a lead and leaves proof slots for the next candidates',async()=>{
  const name=offer.title,platform='1688';
  const item=(id,sourceType)=>({url:'https://detail.1688.com/offer/'+id+'.html',product:name,platform,title:name,pageType:'product',
    sourceType,discoveryQuery:'site:m.1688.com/offer 保温杯',discoveryURL:'https://m.1688.com/offer/'+id+'.html',priceMentions:['¥19.90']});
  const states=['placeholder','visible',undefined,'unknown'];
  const inspect=async(items)=>{
    let reads=0;
    const saved=[];
    const result=await verifyMarketSources({items,products:[{name}],searches:[{product:name,platform,directCount:items.length}]},{
      key:'test',fetcher:async(_,opts)=>({ok:true,json:async()=>({success:true,data:{
        metadata:{url:JSON.parse(opts.body).url,title:name},markdown:'# '+name+'\n¥19.90',screenshot:'https://storage.googleapis.com/test'
      }})}),visionReader:async()=>validateVisualPrices({blocked:false,productImage:states[reads++],offers:[offer]}),
      saveEvidence:async({sourceURL,priceText})=>{saved.push(sourceURL);return {id:'proof',priceText};}
    });
    return {result,saved,reads};
  };
  const snapshot=await inspect([item(1,'linked_detail'),item(2,'marketplace'),item(3,'marketplace'),item(4,'marketplace')]);
  const empty=snapshot.result.items.find(i=>i.url.endsWith('/1.html'));
  assert.match(empty.match,/外观待核/);assert.equal(empty.priceEvidence,undefined);assert.equal(empty.verification.price,'¥19.90');
  assert.deepEqual(snapshot.saved,[item(2).url,item(3).url]);assert.equal(snapshot.reads,3);
  assert.equal(snapshot.result.searches[0].automaticProofCount,2);
  assert.equal(snapshot.result.items.find(i=>i.url.endsWith('/3.html')).ocr.productImage,'unknown');
  for(const sourceType of ['open_web','rechecked_source']){
    const manual=await inspect([item(1,sourceType)]);
    assert.deepEqual(manual.saved,[item(1).url]);
    assert.equal(manual.result.items[0].ocr.productImage,'placeholder');
  }
});
test('screenshot upload is bounded and source is restricted to allowed marketplaces',()=>{
  const screenshot={sourceURL:'https://detail.1688.com/offer/123.html',title:'杯',image:'data:image/png;base64,aGVsbG8='};
  assert.equal(MarketInputSchema.safeParse({screenshot}).success,true);
  assert.equal(MarketInputSchema.safeParse({screenshot:{...screenshot,sourceURL:'https://example.com'}}).success,false);
  assert.equal(MarketInputSchema.safeParse({screenshot:{...screenshot,image:'https://example.com/a.png'}}).success,false);
});
test('vision timeout or invalid output stays a failure without invented prices',async()=>{
  assert.equal((await readMarketScreenshot({screenshot:'https://example.com/a.png'},{key:''})).status,'not_configured');
  const r=await readMarketScreenshot({screenshot:'https://example.com/a.png'},{key:'test',model:'test',fetcher:async()=>({ok:false})});
  assert.equal(r.status,'failed');assert.deepEqual(r.offers,[]);
});

test('product cards reject aggregation pages and never join unrelated prices',()=>{
 const base={product:'杯',title:'单品',url:'https://detail.1688.com/offer/123.html',pageType:'product',priceMentions:['￥6.5','￥59.0']};
 const html=marketHTML({items:[base,{...base,title:'聚合标题',url:'https://guangtao.taobao.com/product-abc.html'}]});
 assert.doesNotMatch(html,/聚合标题|￥6.5|￥59.0|taobao.com\/product-abc/);assert.match(html,/价格待确认/);
 assert.equal(MarketInputSchema.safeParse({sourceUrls:['https://s.1688.com/kq/cups.html']}).success,false);
});

test('a primary CNY headline can identify an actual starting price amongst multiple OCR entries',()=>{
 const title='双层真空保温茶杯 300ml';
 const header=listingHeader({metadata:{title:title+' - 阿里巴巴'},markdown:
   '# 商品属性\n# '+title+'\n4.9\n价格\n¥53.00\n起\n运费 ¥3\n### 容量\n300ml\n¥58'});
 assert.ok(header.priceIsFrom);
 const visual=(name,price,conditions)=>({...offer,title:name,priceText:price,conditions});
 const read={status:'read',offers:[visual(title,'￥53.00 起','起价'),visual(title,'¥58','300ml'),visual('其他推荐杯','¥53','未知')]};
 const accepted=screenshotOffer(read,header,title);
 assert.equal(accepted.priceText,'¥53.00');
 assert.equal(accepted.priceIsFrom,true);
 assert.equal(screenshotOffer({...read,offers:[read.offers[1]]},header,title),null);
 assert.equal(screenshotOffer({...read,offers:[read.offers[2]]},header,title),null);
 assert.equal(screenshotOffer({status:'no_price',offers:[]},header,title),null);
});

test('source text and search prices without visible screenshot evidence cannot produce a proof',async()=>{
 const url='https://detail.1688.com/offer/12345.html';
 const result=await verifyMarketSources({products:[{name:'保温杯'}],items:[
   {url,platform:'1688',product:'保温杯',pageType:'product',title:'真空保温杯',priceMentions:['￥24']}
 ]},{key:'test',fetcher:async()=>({ok:true,json:async()=>({success:true,data:{
   metadata:{url,title:'真空保温杯'},markdown:'# 真空保温杯\n￥24',screenshot:'https://storage.googleapis.com/sample'
 }})}),visionReader:async()=>({status:'no_price',offers:[]}),saveEvidence:()=>assert.fail('no visual proof')});
 assert.equal(result.items[0].priceEvidence,undefined);
 assert.equal(result.items[0].verification.price,'￥24');
});

test('a titanium headline with documented stainless inner material cannot pass as a titanium cup',()=>{
 const title='钛合金水杯280ml礼盒装';
 const header=listingHeader({metadata:{title},markdown:
   '内胆材质304不锈钢\n外壳材质316不锈钢\n# '+title+'\n4.0\n价格\n¥18.00\n登录查看更多优惠\n运费¥1起'});
 assert.equal(header.priceIsFrom,false);
 assert.match(incompatibleMaterial({name:'迷你钛杯'},header.details),/304不锈钢/);
 assert.equal(incompatibleMaterial({name:'普通水杯'},header.details),'');
 assert.equal(incompatibleMaterial({name:'迷你钛杯'},'外壳材质 304不锈钢 内胆材质 纯钛'),'');
});

test('office notebooks and the minimum of mixed loose-item and bundle options do not qualify for a buyer gift set',async()=>{
 const url='https://detail.1688.com/offer/12345.html';
 const target={name:'随行水杯礼盒',attributes:['发圈','630ml','s31603','吸管','礼盒','水杯']};
 const verify=(title,markdown)=>verifyMarketSources({products:[target],items:[{url,title,product:target.name,platform:'1688',pageType:'product'}]},{
   key:'test',fetcher:async()=>({ok:true,json:async()=>({success:true,data:{markdown,metadata:{url,title},screenshot:'https://storage.googleapis.com/test'}})}),
   visionReader:()=>assert.fail('weak gifts must be rejected before OCR'),saveEvidence:()=>assert.fail('unattributed gift price')
 });
 const title='国潮笔记本保温杯礼盒套装定制充电宝雨伞会议办公礼品';
 const office=(await verify(title,'# '+title+'\n价格\n¥65.80')).items[0];
 assert.equal(office.verification.status,'mismatch');assert.match(office.verification.note,/赠品/);
 const set='发圈保温杯礼盒套装630ml';
 const markdown='| 封面颜色 | 软皮本随机发、单本装-蓝色、保温杯三件套 |\n# '+set+'\n价格\n¥4.50\n起';
 const mixed=(await verify(set,markdown)).items[0];
 assert.equal(mixed.verification.status,'mismatch');assert.match(mixed.verification.note,/单本装-蓝色/);
 assert.equal(listingHeader({markdown:'# '+set+'\n价格\n¥32\n### 店铺推荐\n### 款式\n单本装-红色',metadata:{title:set}}).looseComponent,'');
});

test('a selectable gift combination needs the same component row and amount in the stored screenshot',async()=>{
 const url='https://detail.1688.com/offer/1234.html';
 const target={name:'小苍兰礼盒',attributes:['丝巾','630ml','s31603','水杯']};
 const title='暖冬围巾礼盒',label='双面格围巾+保温杯+咖啡*2+公仔+礼盒';
 const markdown='# '+title+'\n价格\n¥36.00\n起\n### 颜色\n双面格围巾+礼盒\n¥36\n库存470套\n双面格围巾+咖啡杯+礼盒\n¥52\n库存482套\n'+label.replace('*','\\*')+'\n¥67\n库存497套\n# 分销代发';
 const run=async(ocrTitle,ocrPrice,text)=>{
   const requested=[];
   const r=await verifyMarketSources({products:[target],items:[{url,product:target.name,platform:'1688',title,pageType:'product',discoveryOnly:true,priceMentions:['¥36']}]},{
     key:'test',fetcher:async()=>({ok:true,json:async()=>({success:true,data:{markdown,metadata:{title,url},screenshot:'https://storage.googleapis.com/test'}})}),
     visionReader:async({title})=>{assert.equal(title,label);return {status:'read',offers:[{...offer,title:ocrTitle,priceText:ocrPrice,evidenceText:text}]};},
     saveEvidence:async({priceText})=>{requested.push(priceText);return {priceText,id:'proof'};}
   });
   return {item:r.items[0],requested};
 };
 for(const [name,price,text] of [[title,'¥36',title+' ¥36'],[label,'¥67',label+' ¥36 后一行 ¥67'],[label,'¥67','另一种配件 ¥67']]){
   const no=await run(name,price,text);assert.deepEqual(no.requested,[]);
   assert.equal(no.item.ocr.status,'no_price');assert.equal(no.item.verification.price,undefined);assert.equal(no.item.priceEvidence,undefined);
 }
 const good=await run(label,'¥67.00',label+' ¥67.00');
 assert.deepEqual(good.requested,['¥67']);assert.equal(good.item.priceIsFrom,false);
 assert.equal(good.item.variantTextEvidence,label+' ¥67');assert.match(good.item.priceConditions,/原页规格行/);
 assert.ok(good.item.similarity.matched.some(t=>t.includes('围巾配件')));
});

test('rate-limited product capture retries the same URL before moving to the next candidate',async()=>{
 const item={product:'杯子',platform:'1688',url:'https://detail.1688.com/offer/12345.html',title:'迷你水杯',pageType:'product'};
 const calls=[];
 const verified=await verifyMarketSources({items:[item]},{
   key:'test',fetcher:async(_,opts)=>{
     const body=JSON.parse(opts.body);calls.push(body.url);
     assert.equal(body.proxy,'basic');
     assert.equal(body.formats.find(x=>x.type==='screenshot').fullPage,false);
     if(calls.length===1)return {ok:false,status:429,headers:new Headers({'Retry-After':'0'})};
     return {ok:true,json:async()=>({success:true,data:{metadata:{url:body.url,title:item.title},markdown:'# 迷你水杯\n价格\n¥25'}})};
   }
 });
 assert.deepEqual(calls,[item.url,item.url]);
 assert.equal(verified.items[0].verification.readable,true);
});
