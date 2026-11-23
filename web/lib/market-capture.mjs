import {MB} from './contracts.mjs';

export const maxMarketImageBytes=3*MB;
export async function boundedMarketImageBody(response){
  const sizeHint=Number(response.headers.get('content-range')?.split('/')[1]||response.headers.get('content-length'));
  if(!response.body||sizeHint>maxMarketImageBytes){
    await response.body?.cancel();
    return null;
  }
  const chunks=[];
  let size=0;
  for await(const chunk of response.body){
    size+=chunk.length;
    if(size>maxMarketImageBytes)return null;
    chunks.push(chunk);
  }
  return size?Buffer.concat(chunks,size):null;
}

// Only accept screenshot objects from the capture provider's own bucket. Never
// fetch an arbitrary client-supplied URL or follow a redirect with a signed query.
export function isCaptureImageURL(value){
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(
      (url.hostname==='storage.googleapis.com'&&url.pathname.startsWith('/firecrawl-scrape-media/'))||
      (url.hostname==='firecrawl-scrape-media.storage.googleapis.com'&&url.pathname.length>1)
    );
  }catch{return false;}
}

function dimensionsOK(width,height){
  return width>0&&height>0&&width<=32000&&height<=32000&&width*height<=48000000;
}
export function imageType(bytes){
  if(!bytes||bytes.length<16||bytes.length>maxMarketImageBytes)return null;
  if(bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND'){
    return dimensionsOK(bytes.readUInt32BE(16),bytes.readUInt32BE(20))?'image/png':null;
  }
  if(bytes.readUInt16BE(0)===0xffd8&&bytes.readUInt16BE(bytes.length-2)===0xffd9){
    for(let i=2;i+8<bytes.length&&bytes[i]===0xff;){
      while(bytes[i]===0xff)i++;
      if(i+7>=bytes.length)break;
      const marker=bytes[i++];
      const length=bytes.readUInt16BE(i);
      if(length<2||i+length>bytes.length||marker===0xda)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8){
        return dimensionsOK(bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3))?'image/jpeg':null;
      }
      i+=length;
    }
  }
  if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.readUInt32LE(4)===bytes.length-8&&bytes.toString('ascii',8,12)==='WEBP'){
    const kind=bytes.toString('ascii',12,16);
    if(kind==='VP8X'&&dimensionsOK(1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)))return 'image/webp';
    if(kind==='VP8 '&&bytes.subarray(23,26).equals(Buffer.from('9d012a','hex'))&&dimensionsOK(bytes.readUInt16LE(26)&0x3fff,bytes.readUInt16LE(28)&0x3fff))return 'image/webp';
    if(kind==='VP8L'&&bytes[20]===0x2f){
      const bits=bytes.readUInt32LE(21);
      if(dimensionsOK(1+(bits&0x3fff),1+((bits>>>14)&0x3fff)))return 'image/webp';
    }
  }
  return null;
}

export async function captureImage(url,fetcher=fetch,deadline){
  if(!isCaptureImageURL(url))return null;
  const timeout=AbortSignal.timeout(10000);
  const signal=deadline?AbortSignal.any([timeout,deadline]):timeout;
  const response=await fetcher(url,{redirect:'error',credentials:'omit',signal});
  const contentType=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(!response.ok||!['image/png','image/jpeg','image/webp','application/octet-stream'].includes(contentType)){
    await response.body?.cancel();
    return null;
  }
  const bytes=await boundedMarketImageBody(response);
  const actual=imageType(bytes);
  return actual&&(actual===contentType||contentType==='application/octet-stream')?{bytes,contentType:actual}:null;
}
