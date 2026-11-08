import { cp, mkdir } from 'node:fs/promises';
await mkdir('skill', {recursive:true});
await cp('../skills/purchase-review/SKILL.md','skill/SKILL.md');
await cp('../skills/purchase-review/references','skill/references',{recursive:true});
console.log('Synced canonical purchase-review skill.');
