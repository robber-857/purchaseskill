// Browser-local reusable files. No shared global dataset in an invite-only app.
const database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('purchase-review-internal',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('files',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('无法打开浏览器资料存储，请允许网站保存数据。'));
});
async function transaction(mode,action){
  const db=await database;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files',mode);let result;
    const request=action(tx.objectStore('files'));if(request)request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new Error('资料保存失败，浏览器空间可能不足；原有资料未更改。'));
  });
}
export const listInternal=()=>transaction('readonly',store=>store.getAll());
export const saveInternal=items=>transaction('readwrite',store=>{for(const item of items)store.put(item);});
export const removeInternal=id=>transaction('readwrite',store=>store.delete(id));
