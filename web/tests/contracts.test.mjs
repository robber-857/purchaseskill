import test from 'node:test';
import assert from 'node:assert/strict';
import {MB,validateFiles,validateManifest,validateReport,supplierSnapshot} from '../lib/contracts.mjs';
import {basicReport} from '../lib/analyze.mjs';
import {reportHTML} from '../src/report.js';
import {cachedReview,WARMIES_SHA256} from '../lib/sample-cache.mjs';
const files=[{name:'supplier.pdf',size:12*MB,type:'application/pdf'}];
const manifest={version:1,pages:[{file:0,page:1,label:'第 1 页',text:'供应商宣传，尚未核验',images:[],limitations:[]}],warnings:[]};
test('Free tier rejects >50MB, configured 100MB accepts <=100MB',()=>{
  assert.throws(()=>validateFiles([{...files[0],size:51*MB}],50,100));
  assert.doesNotThrow(()=>validateFiles([{...files[0],size:100*MB}],100,100));
  assert.throws(()=>validateFiles([{...files[0],size:100*MB+1}],100,100));
  assert.throws(()=>validateFiles([{...files[0],name:'payload.exe'}],50,100));
});
test('Manifest rejects invented file references, duplicate pages, and missing files',()=>{
  assert.throws(()=>validateManifest({...manifest,pages:[{...manifest.pages[0],file:1}]},files));
  assert.throws(()=>validateManifest({...manifest,pages:[...manifest.pages,...manifest.pages]},files));
  assert.throws(()=>validateManifest(manifest,[...files,...files]));
  assert.equal(validateManifest(manifest,files).pages.length,1);
});
test('Basic mode identifies itself and does not fabricate product analysis',()=>{
  const report=basicReport(manifest,files,{market:'中国',purpose:'转售商品'});
  assert.match(report.summary,/未调用 AI/);assert.equal(report.products.length,0);assert.equal(report.decision,'待补资料');
  assert.equal(validateReport(report,manifest).evidence[0].status,'observed');
  assert.throws(()=>validateReport({...report,evidence:[{...report.evidence[0],status:'verified'}]},manifest));
  assert.throws(()=>validateReport({...report,evidence:[{...report.evidence[0],page:99}]},manifest));
});
test('Supplier snapshot excludes model prose, file metadata and internal markers',()=>{
  const report=basicReport(manifest,files,{market:'中国',purpose:'转售商品'});report.summary='PRIVATE_MARGIN_123';report.products=[{name:'PRIVATE_SKU_456'}];report.missing=['PRIVATE_COST_789'];report.files=[{name:'PRIVATE_SOURCE'}];report.createdAt='2026-11-08T00:00:00Z';
  const shared=supplierSnapshot(report);assert.doesNotMatch(JSON.stringify(shared),/PRIVATE_/);assert.equal(shared.files,undefined);
});
test('HTML export escapes untrusted content and carries no source images or scripts',()=>{
  const report={...basicReport(manifest,files,{market:'中国',purpose:'转售商品'}),createdAt:'2026-11-08',title:'<script>alert(1)</script>',files,mode:'basic'};
  const html=reportHTML(report,{interactive:false});assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/data:image|<iframe|onclick=/);
});
test('Cached review requires identical original bytes and exact assessment context',()=>{
  const context={market:'中国',purpose:'转售商品',focus:''};
  assert.equal(cachedReview(WARMIES_SHA256,context).mode,'cached_review');
  assert.equal(cachedReview('not-the-same-file',context),null);
  assert.equal(cachedReview(WARMIES_SHA256,{...context,market:'澳大利亚'}),null);
  assert.equal(cachedReview(WARMIES_SHA256,{...context,focus:'只看围巾'}),null);
});
