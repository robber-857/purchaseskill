import test from 'node:test';
import assert from 'node:assert/strict';
import {remember,readHistory} from '../src/history.js';
import {durableFile} from '../src/file-copy.js';
test('legacy task survives new failed task and metadata updates preserve credentials',()=>{
 const map=new Map([['purchase-review-job',JSON.stringify({id:'old',token:'secret'})]]);const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 remember({id:'new',status:'failed'},storage);remember({id:'old',status:'completed'},storage);
 assert.equal(readHistory(storage).length,2);assert.equal(readHistory(storage).find(x=>x.id==='old').token,'secret');
});
test('durable copy detaches bytes; stale file names produce actionable error',async()=>{
 const file=new File(['SKU,库存\nA,10'],'库存.csv',{type:'text/csv'});const copy=await durableFile(file);
 assert.notEqual(copy,file);assert.equal(await copy.text(),await file.text());
 await assert.rejects(durableFile({name:'失效.csv',arrayBuffer:async()=>{throw new DOMException('not found','NotFoundError')}}),/失效.csv.*重新选择/);
});
