import test from 'node:test';
import assert from 'node:assert/strict';
import {read,utils} from 'xlsx';
import {DEMOS,demoCSV,demoSupplier,demoSelection} from '../src/demo-data.js';
import {spreadsheetPages} from '../lib/spreadsheets.mjs';
test('both demos preserve price provenance, simulate operations and parse as internal spreadsheets',()=>{
  assert.deepEqual(DEMOS.map(d=>d.id),['cups','socks']);
  for(const d of DEMOS){
    const csv=demoCSV(d),book=read(csv,{type:'string',raw:true}),rows=utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});
    assert.equal(rows.length,5);assert.ok(rows.every(r=>r.length===rows[0].length));
    assert.equal(rows[1][8],String(d.rows[0][3]));assert.equal(rows[1][15],String(d.rows[0][10]));
    assert.ok(rows.slice(1).every(r=>r[0].includes('虚构')&&r[17].includes('假定')&&r[18].includes('未知')));
    const pages=spreadsheetPages(new TextEncoder().encode(csv),'csv');assert.ok(pages.length>0);
    assert.match(pages.map(p=>p.text).join(''),/可取消补货/);
    for(const s of d.sources){assert.match(s.url,/^https:\/\/(s|www)\.1688\.com\//);assert.ok(csv.includes(s.url));}
    assert.match(demoSupplier(d),/模拟供应商/);assert.match(demoSupplier(d),/非真实供应商报价/);
    assert.ok(d.candidates.every(c=>!d.rows.some(r=>r[0]===c[0])));
  }
});
test('switching demos retains real files, exclusively selects chosen demo and does not duplicate it',()=>{
  const real={id:'real',selected:true,file:{name:'真实数据.csv'}};
  let entries=demoSelection([real],{id:'demo-cups',selected:true});
  entries=demoSelection(entries,{id:'demo-socks',selected:true});
  entries=demoSelection(entries,{id:'demo-socks',selected:true});
  assert.equal(entries.length,3);assert.deepEqual(entries.filter(x=>x.selected).map(x=>x.id),['demo-socks']);
  assert.equal(entries.find(x=>x.id==='real').file,real.file);assert.equal(real.selected,true);
});
