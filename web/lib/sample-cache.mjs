import {warmiesReport} from '../src/sample.js';
export const WARMIES_SHA256='17adbfdda350c7e71b1d60c74fdb055276d55a96354b3711f017cfa24d0083ce';
export function cachedReview(digest,context){
  if(digest!==WARMIES_SHA256||context.market!=='中国'||context.purpose!=='转售商品'||context.focus?.trim())return null;
  return {report:{...structuredClone(warmiesReport),limitations:['原文件 SHA-256 与已审阅的 Warmies 原册完全一致，评估场景一致；复用 2026-11-08 的已审阅报告，未进行本次实时 AI 分析。',...warmiesReport.limitations]},mode:'cached_review',model:null,ruleVersion:warmiesReport.ruleVersion};
}
