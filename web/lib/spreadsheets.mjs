import {read,utils} from 'xlsx';
import {unzipSync} from 'fflate';

// Preserve cell addresses, displayed identifiers, blank vs zero, and sheet names.
export function spreadsheetPages(bytes,extension,file=0,maxPages=80){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  let input=bytes,options={type:'array',cellFormula:true,cellText:true};
  if(extension==='csv'){
    try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('CSV 需要 UTF-8 编码，请在 Excel 中另存为 CSV UTF-8。');}
    options={type:'string',raw:true};
  }else if(extension==='xlsx'){
    let total=0,oversized=false;
    try{unzipSync(bytes,{filter:entry=>{total+=entry.originalSize;if(entry.originalSize>20*1048576||total>160*1048576)oversized=true;return false;}});}catch{throw new Error('Excel 无法读取，请检查文件是否损坏或加密。');}
    if(oversized)throw new Error('Excel 解压内容过大，请拆分工作簿。');
  }
  let workbook;try{workbook=read(input,options);}catch{throw new Error('表格无法读取，请检查文件是否损坏或加密。');}
  const pages=[];
  for(const [index,name] of workbook.SheetNames.entries()){
    const sheet=workbook.Sheets[name];if(!sheet?.['!ref'])continue;
    const range=utils.decode_range(sheet['!ref']);
    if(range.e.r>=10000||range.e.c>=100)throw new Error(`工作表「${name}」超过 10000 行或 100 列，请拆分后上传。`);
    const rows=new Map();let formulas=false;
    for(const address of Object.keys(sheet).filter(k=>/^[A-Z]+[1-9][0-9]*$/.test(k))){
      const cell=sheet[address];if(cell.v==null&&!cell.f)continue;
      formulas ||= Boolean(cell.f);
      const value=cell.f&&cell.v==null?'未知（公式未保存计算结果）':String(cell.w??cell.v??'');
      if(!value&&!cell.f)continue;
      const {r,c}=utils.decode_cell(address);if(!rows.has(r))rows.set(r,[]);
      rows.get(r).push({c,text:`${address}=${JSON.stringify(value)}`});
    }
    const ordered=[...rows.entries()].sort((a,b)=>a[0]-b[0]);if(!ordered.length)continue;
    const first=ordered[0][1].sort((a,b)=>a.c-b.c).map(x=>x.text).join(' | ');
    const prefix=`工作表：${name}\n首个非空行（核对表头）：${first}\n`;
    if(prefix.length>5000)throw new Error(`工作表「${name}」表头过长，请精简。`);
    const limitations=['提取单元格显示值与行列位置；不读取图表、图片、批注，不执行公式或宏。空白保持未知，不补零。'];
    if(formulas)limitations.push('公式使用文件中已保存的结果，可能过期；无缓存结果标为未知，请在 Excel 中重算并保存后上传。');
    if(workbook.Workbook?.Sheets?.[index]?.Hidden)limitations.push('此工作表在原文件中隐藏，已明确纳入解析，请核对内容。');
    if(sheet['!merges']?.length)limitations.push('合并单元格仅在左上角保留值，其他空白不自动填充。');
    let text=prefix,start=null,end=null;
    const flush=()=>{if(start===null)return;if(pages.length>=maxPages)throw new Error(`表格超过本次剩余 ${maxPages} 个内容片段，请拆分。`);pages.push({file,page:pages.length+1,label:`${name.slice(0,45)} · 行 ${start}–${end}`,text,images:[],limitations:[...limitations]});text=prefix;start=null;};
    for(const [row,cells] of ordered){
      const line=`行 ${row+1}：${cells.sort((a,b)=>a.c-b.c).map(x=>x.text).join(' | ')}\n`;
      if(prefix.length+line.length>12000)throw new Error(`工作表「${name}」第 ${row+1} 行内容过长，请拆分。`);
      if(text.length+line.length>12000)flush();
      start??=row+1;end=row+1;text+=line;
    }
    flush();
  }
  if(!pages.length)throw new Error('表格没有可读取的数据，请填写 SKU 等资料后上传。');
  return pages;
}
