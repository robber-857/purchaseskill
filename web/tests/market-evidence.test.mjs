import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import http from 'node:http';

const testRoot=fileURLToPath(new URL('../../output/api-tests/',import.meta.url));
await mkdir(testRoot,{recursive:true});
const directory=await mkdtemp(join(testRoot,'price-evidence-'));
process.env.LOCAL_DATA_DIR=directory;
process.env.SUPABASE_URL='';
process.env.SUPABASE_SERVICE_ROLE_KEY='';
const {savePriceEvidence,readPriceEvidence,priceEvidencePath,saveReviewedCapture}=await import('../lib/market-evidence.mjs');
const {reserve,getJob,mutateReport,maxMarketImageBytes}=await import('../lib/store.mjs');
after(()=>rm(directory,{recursive:true,force:true}));
// Tiny PNG fixture; mocked captures below never contact a marketplace or OCR service.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6t8AAAAASUVORK5CYII=','base64');
const product='https://item.taobao.com/item.htm?id=1234&skuId=71';
const signed='https://storage.googleapis.com/firecrawl-scrape-media/example.png?temporary=test';
const capture={sourceURL:product+'&spm=tracking',finalURL:product,screenshot:signed,origin:'source_page',capturedAt:'2026-11-21T00:00:00Z',priceText:'¥13.90'};
const successfulFetch=async (url,options)=>{
  assert.equal(url,signed);
  assert.equal(options.redirect,'error');
  return new Response(png,{headers:{'content-type':'image/png'}});
};

test('price capture remains readable in the owning job and in archives after the external URL disappears',async()=>{
  const id=randomUUID();
  const ref=await savePriceEvidence(id,capture,{fetcher:successfulFetch});
  assert.match(ref.id,/^[0-9a-f]{64}$/);
  assert.equal(ref.sourceURL,product);
  assert.equal(ref.priceText,'¥13.90');
  assert.ok(!JSON.stringify(ref).includes('temporary'));
  assert.equal(priceEvidencePath(id,ref.id),'/api/index?action=market-evidence&id='+id+'&evidence='+ref.id);
  const row={url:capture.sourceURL,priceEvidence:ref};
  for(const key of ['items','historyItems']){
    const job={id,report:{marketComparison:{[key]:[row]}}};
    const file=await readPriceEvidence(job,ref.id);
    assert.deepEqual(file,{bytes:png,contentType:'image/png'});
    assert.equal(await readPriceEvidence({...job,id:randomUUID()},ref.id),null);
    assert.equal(await readPriceEvidence({...job,report:{...job.report,mode:'supplier'}},ref.id),null);
  }
  assert.equal(await readPriceEvidence({id,report:{}},ref.id),null);
  assert.equal(await readPriceEvidence({id,report:{marketComparison:{items:[{...row,url:product+'5'}]}}},ref.id),null);
  assert.equal(await readPriceEvidence({id,report:{marketComparison:{items:[{url:product,ocr:{screenshotURL:signed}}]}}},ref.id),null);
  await writeFile(join(directory,id,'market-evidence',ref.id),'broken');
  assert.equal(await readPriceEvidence({id,report:{marketComparison:{items:[row]}}},ref.id),null);
});

test('only a provider screenshot for the same product and variant can be fetched',async()=>{
  const id=randomUUID();
  const never=()=>{throw new Error('Unexpected fetch');};
  for(const change of [
    {screenshot:'https://storage.googleapis.com/some-other-bucket/example.png'},
    {screenshot:'https://storage.googleapis.com.attacker.invalid/firecrawl-scrape-media/a'},
    {screenshot:'https://127.0.0.1/image.png'},
    {sourceURL:'https://item.taobao.com/products/anything'},
    {sourceURL:'https://s.taobao.com/search?q=1234'},
    {finalURL:'https://login.taobao.com/member/login.jhtml'},
    {finalURL:'https://item.taobao.com/item.htm?id=1234'},
    {finalURL:product.replace('71','72')},
    {finalURL:product+'&skuId=999'},
    {sourceURL:'https://item.taobao.com/item.htm?id=1234&id=4321'},
    {priceText:'优惠券 20 元'},{priceText:'¥0'},{priceText:'$16.99'},{capturedAt:'unknown'}
  ])assert.equal(await savePriceEvidence(id,{...capture,...change},{fetcher:never}),null);
  const expired=async()=>new Response('gone',{status:403});
  assert.equal(await savePriceEvidence(id,capture,{fetcher:expired}),null);
  const failed=async()=>new Response('<html>login</html>',{headers:{'content-type':'image/png'}});
  assert.equal(await savePriceEvidence(id,capture,{fetcher:failed}),null);
  const mismatched=async()=>new Response(png,{headers:{'content-type':'image/webp'}});
  assert.equal(await savePriceEvidence(id,capture,{fetcher:mismatched}),null);
  const oversized=async()=>new Response(new Uint8Array(maxMarketImageBytes+1),{headers:{'content-type':'image/png'}});
  assert.equal(await savePriceEvidence(id,capture,{fetcher:oversized}),null);
});

test('buyer data images stay distinct and never cause a server-side network fetch',async()=>{
  const id=randomUUID();
  const saved=await savePriceEvidence(id,{...capture,origin:'buyer_upload',screenshot:'data:image/png;base64,'+png.toString('base64')});
  assert.equal(saved.origin,'buyer_upload');
  for(const screenshot of [signed,'data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,'+png.toString('base64')]){
    assert.equal(await savePriceEvidence(id,{...capture,origin:'buyer_upload',screenshot}),null);
  }
});

test('reviewed official opaque items retain case-sensitive identities and must be the same item as the capture',async()=>{
  const id=randomUUID();
  const first='https://www.taobao.com/list/item/ZDZENFUyQ0JaanRLeWQ2S1hhaWw4dz09.htm';
  const second='https://www.taobao.com/list/item/Q3NYUjdOWUx3aUFWelZnZzlMdHgwdz09.htm';
  const input={sourceURL:first,finalURL:first+'?tracking=remove',capturedAt:capture.capturedAt,priceText:'人民币 13.90',bytes:png};
  const valid={...input,priceText:'13.90 元'};
  for(const url of [first,second]){
    const proof=await saveReviewedCapture(id,{...valid,sourceURL:url,finalURL:url+'?spm=tracking'});
    assert.equal(proof.sourceURL,url);
    assert.equal(proof.origin,'source_page');
    assert.equal(proof.method,'reviewed_capture');
  }
  for(const finalURL of [second,first.replace('Z','z'),product,first+'?skuId=99']){
    assert.equal(await saveReviewedCapture(id,{...valid,finalURL}),null);
  }
  assert.equal(await saveReviewedCapture(id,{...valid,bytes:Buffer.from('document')}),null);
});

test('official mobile captures can resolve to their exact desktop product and variant',async()=>{
  const jobId=randomUUID();
  const pairs=[
    ['https://m.1688.com/offer/123.html?sku_id=55','https://detail.1688.com/offer/123.html?skuId=55'],
    ['https://h5.m.taobao.com/awp/core/detail.htm?id=1234&skuId=71',product]
  ];
  for(const [sourceURL,finalURL] of pairs){
    const input={...capture,sourceURL,finalURL};
    const proof=await savePriceEvidence(jobId,input,{fetcher:successfulFetch});
    assert.equal(proof.sourceURL,finalURL);
    const job={id:jobId,report:{marketComparison:{items:[{url:sourceURL,priceEvidence:proof}]}}};
    assert.equal((await readPriceEvidence(job,proof.id)).contentType,'image/png');
    assert.equal(await savePriceEvidence(jobId,{...input,finalURL:finalURL+'3'},{fetcher:successfulFetch}),null);
  }
  assert.equal(await saveReviewedCapture(jobId,{...capture,sourceURL:'https://h5.m.taobao.com/item.htm?id=1234&skuId=71',bytes:png}),null);
});

test('local simultaneous report edits preserve every edit',async()=>{
  const id=randomUUID();
  await reserve({id,report:{title:'original',marketComparison:{items:[]}}});
  await Promise.all(['A','B','C'].map(name=>mutateReport(id,report=>({...report,marketComparison:{items:[...report.marketComparison.items,name]}}))));
  const {report}=await getJob(id);
  assert.deepEqual(report.marketComparison.items.sort(),['A','B','C']);
  assert.equal(report.title,'original');
  assert.ok(report.editRevision);
});

test('cloud mutation of an unversioned report retries a conflicting edit with the new revision',async()=>{
  const id=randomUUID(), concurrent=randomUUID();
  let report={title:'original',items:[]};
  const conditions=[];
  const objects=new Map();
  const stub=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://local');
    res.setHeader('content-type','application/json');
    if(url.pathname.startsWith('/storage/v1/object/')){
      const path=url.pathname.replace('/authenticated/','/');
      if(req.method==='POST'){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        objects.set(path,Buffer.concat(chunks));
        return res.end(JSON.stringify({Key:path}));
      }
      if(!req.headers.apikey||!req.headers.range||!objects.has(path)){res.statusCode=404;return res.end();}
      res.setHeader('content-type','image/png');
      return res.end(objects.get(path));
    }
    if(req.method==='GET')return res.end(JSON.stringify([{report}]));
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const next=JSON.parse(Buffer.concat(chunks).toString()).report;
    const guard=url.searchParams.get('report->>editRevision');
    conditions.push(guard);
    if(guard==='is.null'){
      report={...report,items:['another edit'],editRevision:concurrent};
      return res.end('[]'); // Our first compare-and-swap lost the race.
    }
    if(guard!=='eq.'+concurrent){res.statusCode=400;return res.end('{}');}
    report=next;
    return res.end(JSON.stringify([{id}]));
  });
  await new Promise(resolve=>stub.listen(0,'127.0.0.1',resolve));
  process.env.SUPABASE_URL='http://127.0.0.1:'+stub.address().port;
  process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-key';
  try{
    const saved=await mutateReport(id,latest=>({...latest,items:[...latest.items,'my edit']}));
    assert.deepEqual(conditions,['is.null','eq.'+concurrent]);
    assert.deepEqual(saved.items,['another edit','my edit']);
    assert.notEqual(saved.editRevision,concurrent);
    const ref=await saveReviewedCapture(id,{...capture,bytes:png});
    const job={id,report:{marketComparison:{items:[{url:product,priceEvidence:ref}]}}};
    assert.deepEqual(await readPriceEvidence(job,ref.id),{bytes:png,contentType:'image/png'});
    assert.deepEqual([...objects.keys()],['/storage/v1/object/review-private/'+id+'/market-evidence/'+ref.id]);
  }finally{
    process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';
    await new Promise(resolve=>stub.close(resolve));
  }
});
