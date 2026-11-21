export async function durableFile(file){
  try{return new File([await file.arrayBuffer()],file.name,{type:file.type,lastModified:file.lastModified});}
  catch{throw new Error(`无法读取「${file.name}」：原文件可能已移动、被清理或浏览器中的文件引用已失效。请重新选择该文件；若是内部资料，请在「内部经营数据」重新上传或重新选择 Demo。历史报告不受影响。`);}
}
