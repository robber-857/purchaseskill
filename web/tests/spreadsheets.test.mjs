import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {utils,write} from 'xlsx';
import {spreadsheetPages} from '../lib/spreadsheets.mjs';
import {CreateSchema,validateManifest} from '../lib/contracts.mjs';
const bytes=text=>new TextEncoder().encode(text);
test('CSV preserves Unicode, leading-zero SKUs, quotes, newlines, zero and missing cells',()=>{
  const pages=spreadsheetPages(bytes('\uFEFFSKU,名称,库存,成本\r\n000123,"暖包,大号",0,\r\n000456,"多行\n说明",12,25.50'),'csv');
  const text=pages.map(p=>p.text).join('\n');
  assert.match(text,/A2="000123"/);assert.match(text,/B2="暖包,大号"/);assert.match(text,/C2="0"/);assert.doesNotMatch(text,/D2=/);assert.match(text,/多行\\n说明/);
  validateManifest({version:1,pages,warnings:[]},[{name:'sku.csv'}]);
});
for(const bookType of ['xlsx','xls'])test(`${bookType} preserves sheets, formatted IDs, formulas and row sources`,()=>{
  const wb=utils.book_new();const sheet=utils.aoa_to_sheet([['SKU','库存','成本'],[123,0,null]]);
  sheet.A2.z='000000';sheet.C2={t:'n',f:'1+2',v:3};sheet.D2={t:'n',f:'2+3'};sheet['!ref']='A1:D2';
  utils.book_append_sheet(wb,sheet,'现有SKU');utils.book_append_sheet(wb,utils.aoa_to_sheet([['SKU','销量'],['OLD-1',4]]),'销量');
  const pages=spreadsheetPages(write(wb,{type:'array',bookType}),bookType);
  assert.equal(pages.length,2);assert.match(pages[0].text,/000123/);assert.match(pages[0].text,/C2="3"/);assert.match(pages[1].label,/销量/);
  assert.ok(pages[0].limitations.some(x=>x.includes('公式')));assert.equal(pages[1].page,2);
});
test('Large tables repeat header context and fail rather than silently truncate',()=>{
  const csv='SKU,描述\n'+Array.from({length:500},(_,i)=>`SKU-${i},${'描述'.repeat(40)}`).join('\n');
  const pages=spreadsheetPages(bytes(csv),'csv');assert.ok(pages.length>1);
  for(const p of pages){assert.match(p.text,/首个非空行.*SKU/);assert.ok(p.text.length<=14000);}
  assert.match(pages.at(-1).text,/SKU-499/);assert.throws(()=>spreadsheetPages(bytes(csv),'csv',0,1),/拆分/);
  assert.throws(()=>spreadsheetPages(new Uint8Array([0xff,0xff]),'csv'),/UTF-8/);
});
test('File roles persist in creation and old clients default to supplier',()=>{
  const input={files:[{name:'quote.xlsx',size:10,type:''},{name:'sku.csv',size:10,type:'',role:'internal'}],context:{market:'中国',purpose:'转售商品'}};
  assert.deepEqual(CreateSchema.parse(input).files.map(f=>f.role),['supplier','internal']);
  assert.equal(CreateSchema.safeParse({...input,files:[{...input.files[0],role:'public'}]}).success,false);
});
test('Downloadable templates contain matching SKU headers and no sample inventory',async()=>{
  const csv=await readFile(new URL('../public/templates/sku-template.csv',import.meta.url));
  const xlsx=await readFile(new URL('../public/templates/sku-template.xlsx',import.meta.url));
  const csvPages=spreadsheetPages(csv,'csv');const xlsxPages=spreadsheetPages(xlsx,'xlsx');
  assert.match(csvPages[0].text,/SKU编码/);assert.match(xlsxPages[0].text,/SKU编码/);assert.equal(csvPages[0].label.includes('行 1–1'),true);
  assert.doesNotMatch(xlsxPages[0].text,/行 2：/);
});
