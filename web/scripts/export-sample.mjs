import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {warmiesReport} from '../src/sample.js';
import {supplierSnapshot} from '../lib/contracts.mjs';
import {reportHTML,escape} from '../src/report.js';
const css=(await Promise.all(['src/style.css','src/report-workspace.css'].map(p=>readFile(p,'utf8')))).join('\n');
await mkdir('../output/reports',{recursive:true});
for(const [name,report] of [['warmies-review',warmiesReport],['warmies-supplier',supplierSnapshot(warmiesReport)]]){
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.title)}</title><style>${css}</style></head><body class="export-body">${reportHTML(report,{interactive:false})}</body></html>`;
  await writeFile(`../output/reports/${name}.html`,html);
}
console.log('Exported independent HTML reports to output/reports.');
