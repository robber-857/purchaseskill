const KEY='purchase-review-history';
export function readHistory(storage=localStorage){
  let items=[];try{items=JSON.parse(storage.getItem(KEY)||'[]');}catch{}
  if(!Array.isArray(items))items=[];
  try{const old=JSON.parse(storage.getItem('purchase-review-job'));if(old?.id&&old?.token&&!items.some(x=>x.id===old.id))items.push({...old,title:'旧版任务',status:'unknown'});}catch{}
  return items;
}
export function remember(item,storage=localStorage){
  const items=readHistory(storage),previous=items.find(x=>x.id===item.id);
  const next=[{...previous,...item},...items.filter(x=>x.id!==item.id)].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  storage.setItem(KEY,JSON.stringify(next));return next;
}
let database;
async function snapshots(mode,action){
  database ||= new Promise((resolve,reject)=>{const r=indexedDB.open('purchase-review-history',1);r.onupgradeneeded=()=>r.result.createObjectStore('reports',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('reports',mode),r=action(tx.objectStore('reports'));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('历史报告保存失败'));});
}
export const saveSnapshot=item=>snapshots('readwrite',s=>s.put(item));
export const getSnapshot=id=>snapshots('readonly',s=>s.get(id));
