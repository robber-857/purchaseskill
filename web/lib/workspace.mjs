import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest();
export const workspaceReady=()=>Boolean(process.env.HISTORY_ACCESS_KEY&&process.env.HISTORY_WORKSPACE_ID);
export function validAccessKey(key){return workspaceReady()&&typeof key==='string'&&timingSafeEqual(digest(key),digest(process.env.HISTORY_ACCESS_KEY));}
const sign=value=>createHmac('sha256',process.env.HISTORY_ACCESS_KEY).update(value).digest('hex');
export function sessionCookie(logout=false){
 const expires=Date.now()+30*86400000;const value=logout?'':`${expires}.${sign(String(expires))}`;
 return `purchase_workspace=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${logout?0:30*86400}${process.env.VERCEL?'; Secure':''}`;
}
export function workspaceSession(req){
 if(!workspaceReady())return null;
 const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('purchase_workspace='))?.slice(19);
 if(!value)return null;const [expires,signature]=value.split('.');
 if(!/^\d{13}$/.test(expires||'')||!signature||Number(expires)<Date.now()||Number(expires)>Date.now()+31*86400000)return null;
 return timingSafeEqual(digest(signature),digest(sign(expires)))?process.env.HISTORY_WORKSPACE_ID:null;
}
