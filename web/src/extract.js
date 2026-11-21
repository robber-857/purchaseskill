import {durableFile} from './file-copy.js';
import {unzipSync,strFromU8} from 'fflate';
import * as CFB from 'cfb';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=worker;
const MAX_TEXT=14000;
const xml=s=>{const doc=new DOMParser().parseFromString(s,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('文件内容不完整，请在 Office 中重新保存后上传。');return doc;};
const byLocal=(doc,name)=>Array.from(doc.getElementsByTagNameNS('*',name));
const textOf=doc=>byLocal(doc,'t').map(t=>t.textContent).join(' ');
const attrRel=node=>node.getAttribute('r:id')||node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
function safeZip(bytes){let sum=0,tooLarge=false;const entries=unzipSync(bytes,{filter:entry=>{sum+=entry.originalSize;if(entry.originalSize>20*1024*1024||sum>160*1024*1024){tooLarge=true;return false;}return true;}});if(tooLarge)throw new Error('解压后的内容过大，请拆分或压缩图片后上传');return entries;}
function canvasImage(canvas){let quality=.8;let data=canvas.toDataURL('image/jpeg',quality);while(data.length>500000&&quality>.3){quality-=.12;data=canvas.toDataURL('image/jpeg',quality);}if(data.length>550000)throw new Error('页面图像过于复杂，请拆分或降低分辨率');return data;}
async function resizedImage(blob){const bitmap=await createImageBitmap(blob);if(bitmap.width*bitmap.height>50000000){bitmap.close();throw new Error('图片超过 5000 万像素，请先缩小');}const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0,c.width,c.height);bitmap.close();const data=canvasImage(c);c.width=c.height=1;return data;}
function page(file,n,text='',images=[],limitations=[],label=`第 ${n} 页`){if(text.length>MAX_TEXT){text=text.slice(0,MAX_TEXT);limitations=[...limitations,'本页仅显示前 14000 个字符，请对照原件查看其余内容。'];}return {file,page:n,label,text,images,limitations};}
function resolvePart(base,target){const parts=(base+'/'+target).split('/');const stack=[];for(const s of parts){if(s==='..')stack.pop();else if(s&&s!=='.')stack.push(s);}return stack.join('/');}
async function pptx(bytes,file,maxPages,onProgress){
  const z=safeZip(bytes);if(!z['ppt/presentation.xml'])throw new Error('这不是有效的 PPTX');
  const relations=xml(strFromU8(z['ppt/_rels/presentation.xml.rels']));const map=new Map(byLocal(relations,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  const ids=byLocal(xml(strFromU8(z['ppt/presentation.xml'])),'sldId');if(ids.length>maxPages)throw new Error(`幻灯片超过本次剩余 ${maxPages} 页额度`);const result=[];
  for(let i=0;i<ids.length;i++){
    const target=map.get(attrRel(ids[i]));if(!target)throw new Error('幻灯片目录损坏');const part=resolvePart('ppt',target);if(!z[part])throw new Error('缺少幻灯片内容');const doc=xml(strFromU8(z[part]));const base=part.slice(0,part.lastIndexOf('/'));const relpath=base+'/_rels/'+part.split('/').pop()+'.rels';const images=[];const warnings=['此预览展示文字和图片。如需核对原始排版、图表或备注，请查看演示文稿。'];
    if(z[relpath]){
      const rels=byLocal(xml(strFromU8(z[relpath])),'Relationship');const used=new Set(byLocal(doc,'blip').map(b=>b.getAttribute('r:embed')||b.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed')));
      const imageRels=rels.filter(r=>r.getAttribute('Type')?.endsWith('/image')&&used.has(r.getAttribute('Id')));
      for(const r of imageRels.slice(0,3)){
        if(r.getAttribute('TargetMode')==='External'){warnings.push('外部链接图片未读取。');continue;}
        const imagePath=resolvePart(base,r.getAttribute('Target'));const data=z[imagePath];if(!data)continue;
        try{images.push(await resizedImage(new Blob([data])));}catch{warnings.push('部分图片无法预览，请另存为 PDF 后上传。');}
      }
      if(imageRels.length>3)warnings.push(`本页有 ${imageRels.length} 张嵌入图片，仅提取前 3 张；完整视觉评审请另存 PDF。`);
    }
    result.push(page(file,i+1,textOf(doc),images,warnings,`幻灯片 ${i+1}`));onProgress(`正在解析幻灯片 ${i+1} / ${ids.length}`);
  }return result;
}
function legacyPpt(bytes,file,maxPages){
  const compound=CFB.read(bytes,{type:'array'});const stream=CFB.find(compound,'PowerPoint Document');if(!stream?.content)throw new Error('旧版 PPT 无法读取，请另存为 PPTX 或 PDF');
  const data=new Uint8Array(stream.content);const view=new DataView(data.buffer,data.byteOffset,data.byteLength);const texts=[];
  function walk(start,end,depth=0){if(depth>30)return;for(let p=start;p+8<=end;){const v=view.getUint16(p,true)&15;const type=view.getUint16(p+2,true);const len=view.getUint32(p+4,true);const next=p+8+len;if(next>end||next<=p)break;if(type===4000&&len%2===0)texts.push(new TextDecoder('utf-16le').decode(data.subarray(p+8,next)));else if(type===4008)texts.push(new TextDecoder('windows-1252').decode(data.subarray(p+8,next)));else if(v===15)walk(p+8,next,depth+1);p=next;}}
  walk(0,data.length);const text=[...new Set(texts.map(t=>t.trim()).filter(Boolean))].join('\n');if(!text)throw new Error('此 PPT 无法提取文字，请另存为 PDF 或 PPTX 后上传。');
  const chunks=text.match(/[\s\S]{1,12000}/g)||[];if(chunks.length>maxPages)throw new Error('PPT 文字过多，请拆分');return chunks.map((t,i)=>page(file,i+1,t,[],['旧版 PPT 仅显示文字，顺序可能与原稿不同，也可能含旧稿内容。请另存为 PDF 或 PPTX，以核对原始页面和图片。'],`PPT 文本片段 ${i+1}（非页码）`));
}
export async function extractFiles(files,maxPages,onProgress=()=>{}){
  const pages=[];const warnings=[];
  for(let index=0;index<files.length;index++){
    const file=files[index];const ext=file.name.split('.').pop().toLowerCase();onProgress(`读取 ${file.name}`);const bytes=new Uint8Array(await (await durableFile(file)).arrayBuffer());const remaining=maxPages-pages.length;let extracted=[];
    if(ext==='pdf'){
      const task=getDocument({data:bytes,isEvalSupported:false,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});let doc;
      try{doc=await task.promise;if(doc.numPages>remaining)throw new Error(`本次合计超过 ${maxPages} 页，请拆分文件`);
        for(let n=1;n<=doc.numPages;n++){
          onProgress(`${file.name} · 正在解析 ${n} / ${doc.numPages} 页`);const p=await doc.getPage(n);const text=(await p.getTextContent()).items.map(x=>x.str||'').join(' ');const vp=p.getViewport({scale:Math.min(2,1400/Math.max(p.view[2]-p.view[0],p.view[3]-p.view[1]))});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await p.render({canvas,viewport:vp}).promise;const img=canvasImage(canvas);canvas.width=canvas.height=1;
          extracted.push(page(index,n,text,[img],text.trim()?[]:['请查看页面图片核对内容，此页未提取到文字。']));p.cleanup();
        }
      }finally{await task.destroy();}
    }else if(['xlsx','xls','csv'].includes(ext)){const {spreadsheetPages}=await import('../lib/spreadsheets.mjs');extracted=spreadsheetPages(bytes,ext,index,remaining);}
    else if(ext==='pptx')extracted=await pptx(bytes,index,remaining,onProgress);
    else if(ext==='ppt')extracted=legacyPpt(bytes,index,remaining);
    else if(['png','jpg','jpeg','webp'].includes(ext))extracted=[page(index,1,'',[await resizedImage(file)],['预览图已缩小，小字请以原图为准。'],'图片 1')];
    else {
      let text;
      if(ext==='docx'){const z=safeZip(bytes);if(!z['word/document.xml'])throw new Error('DOCX 内容不完整');text=textOf(xml(strFromU8(z['word/document.xml'])));warnings.push(`${file.name}：只提取正文文字，不含图片、页眉页脚、修订和真实分页。`);}
      else {try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('TXT 无法按 UTF-8 读取，请另存为 UTF-8 文本后上传。');}}
      const chunks=text.match(/[\s\S]{1,12000}/g)||[];if(!chunks.length)throw new Error('文件没有可读取的内容');if(chunks.length>remaining)throw new Error(`本次超过 ${maxPages} 个内容片段`);extracted=chunks.map((t,i)=>page(index,i+1,t,[],['编号按文字片段排列，引用时请核对原文。'],`文本片段 ${i+1}`));
    }
    if(!extracted.length)throw new Error(`${file.name} 未提取到任何页面`);pages.push(...extracted);if(pages.length>maxPages)throw new Error(`本次最多 ${maxPages} 页/内容片段`);
    for(const p of extracted)for(const w of p.limitations)if(!warnings.includes(`${file.name}：${w}`))warnings.push(`${file.name}：${w}`);
  }
  const manifest={version:1,pages,warnings:warnings.slice(0,80)};if(new Blob([JSON.stringify(manifest)]).size>16*1024*1024)throw new Error('页面和图片内容较多，请拆分文件或减少页数后上传。');return manifest;
}
