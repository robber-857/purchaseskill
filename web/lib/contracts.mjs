import { z } from 'zod';
export const MB = 1024 * 1024;
export const EXTENSIONS = ['pdf','pptx','ppt','png','jpg','jpeg','webp','txt','docx'];
export const extension = name => name.toLowerCase().split('.').pop();
export const FileSchema = z.object({name:z.string().min(1).max(180),size:z.number().int().positive(),type:z.string().max(150)});
export const CreateSchema = z.object({invite:z.string().max(256).default(''),files:z.array(FileSchema).min(1).max(6),context:z.object({market:z.string().min(1).max(80),purpose:z.enum(['转售商品','自用设备 / 软件','原料 / 耗材']),focus:z.string().max(1000).default('')})});
const ImageSchema = z.string().max(550000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
export const PageSchema = z.object({file:z.number().int().nonnegative(),page:z.number().int().positive(),label:z.string().max(100),text:z.string().max(14000),images:z.array(ImageSchema).max(3),limitations:z.array(z.string().max(400)).max(12)});
export const ManifestSchema = z.object({version:z.literal(1),pages:z.array(PageSchema).min(1).max(80),warnings:z.array(z.string().max(400)).max(80)});
const str = z.string().min(1).max(2400);
const RefSchema=z.object({source:z.number().int().nonnegative(),page:z.number().int().positive()});
const RefsSchema=z.array(RefSchema).min(1).max(12);
const CriterionSchema=z.object({id:z.enum(['fit','quality','commercial','portfolio','economics']),status:z.enum(['missing','partial','supported']),basis:str,refs:z.array(RefSchema).max(12)})
  .refine(x=>x.status==='missing'||x.refs.length>0,'有分项必须有来源');
const money=z.number().finite().nonnegative().max(1e10);
const short=z.string().min(1).max(180);
export const BriefSchema=z.object({
  takeaway:z.string().min(1).max(120),
  price:z.object({quote:short,comparison:short,judgment:short,refs:z.array(RefSchema).max(8)}),
  facts:z.array(z.object({label:z.string().min(1).max(24),value:z.string().min(1).max(80),meaning:short,refs:RefsSchema})).max(3),
  priorities:z.array(z.object({title:z.string().min(1).max(36),why:short,action:short,refs:z.array(RefSchema).max(8)})).min(1).max(3),
  portfolio:short,nextAction:short
});
export const AssessmentSchema=z.object({
  brief:BriefSchema.optional(),
  criteria:z.array(CriterionSchema).length(5).refine(xs=>new Set(xs.map(x=>x.id)).size===5,'五个评分维度不可重复'),
  opportunities:z.array(z.object({title:z.string().min(1).max(160),detail:str,refs:RefsSchema})).max(4),
  skuImpact:z.object({summary:str,rows:z.array(z.object({sku:z.string().min(1).max(160),relationship:str,action:z.enum(['保留','并行试销','评估替换','待核验']),reason:str,exitCondition:str,refs:RefsSchema})).max(12)}),
  economics:z.object({currency:z.string().regex(/^[A-Z]{3}$/),period:z.string().min(1).max(100),basis:str,scenarios:z.array(z.object({name:z.enum(['保守','基准','乐观']),revenue:money,variableCost:money,displacedContribution:money,launchCost:money,exitCost:money,holdingCost:money,refs:RefsSchema})).length(3).refine(xs=>new Set(xs.map(x=>x.name)).size===3,'情景不可重复')}).nullable()
});
export const ReportSchema = z.object({
  title:z.string().min(1).max(160),summary:str,decision:z.enum(['待补资料','有条件进入样品评估','不满足已确认需求']),
  products:z.array(z.object({name:z.string().max(160),description:str,source:z.number().int().nonnegative(),page:z.number().int().positive()})).max(12),
  evidence:z.array(z.object({claim:str,status:z.enum(['observed','supplier_claim','inferred','unknown']),source:z.number().int().nonnegative(),page:z.number().int().positive(),limitation:z.string().max(1600)})).min(1).max(30),
  risks:z.array(z.object({title:z.string().max(160),detail:str})).max(12),
  missing:z.array(str).min(1).max(20),nextSteps:z.array(str).min(1).max(12),limitations:z.array(str).min(1).max(16),
  assessment:AssessmentSchema.optional()
});
export function validateFiles(files,maxFileMB,maxTotalMB){
  for(const f of files){if(!EXTENSIONS.includes(extension(f.name)))throw new Error('不支持此格式：'+f.name);if(f.size>maxFileMB*MB)throw new Error(`单个文件不能超过 ${maxFileMB} MB`);}
  if(files.reduce((s,f)=>s+f.size,0)>maxTotalMB*MB)throw new Error(`本次文件合计不能超过 ${maxTotalMB} MB`);
}
export function validateManifest(input,files,maxPages=80){
  const m=ManifestSchema.parse(input);if(m.pages.length>maxPages)throw new Error(`最多分析 ${maxPages} 页，请拆分文件`);
  const ids=new Set();for(const p of m.pages){if(!files[p.file])throw new Error('来源文件不匹配');const id=`${p.file}:${p.page}`;if(ids.has(id))throw new Error('来源页码重复');ids.add(id);}
  for(let i=0;i<files.length;i++)if(!m.pages.some(p=>p.file===i))throw new Error('部分文件没有解析结果');
  return m;
}
export function validateReport(input,manifest){
  const report=ReportSchema.parse(input);const refs=new Set(manifest.pages.map(p=>`${p.file}:${p.page}`));
  const assessmentRefs=report.assessment?[...report.assessment.criteria,...report.assessment.opportunities,...report.assessment.skuImpact.rows,...(report.assessment.economics?.scenarios||[])].flatMap(x=>x.refs):[];
  const brief=report.assessment?.brief;
  if(brief)assessmentRefs.push(...brief.price.refs,...brief.facts.flatMap(x=>x.refs),...brief.priorities.flatMap(x=>x.refs));
  for(const e of [...report.evidence,...report.products,...assessmentRefs])if(!refs.has(`${e.source}:${e.page}`))throw new Error('模型返回了不存在的来源页码，请人工检查或重试');
  return report;
}
export function supplierSnapshot(report){
  // Intentionally fixed request text. No model prose or internal context crosses this boundary.
  return {title:'供应商资料补充清单',summary:'请针对拟供产品补充以下资料，以便继续开展采购评估。此清单不构成采购承诺。',decision:'待补资料',products:[],evidence:[],risks:[],
    missing:['具体型号、尺寸、材质、包装及适用场景','正式报价、计价单位、MOQ、交期、付款与售后条款','品牌与渠道授权、本型号适用的检测报告及使用说明'],
    nextSteps:['请先确认供货型号，并提供可对应型号的完整资料。','样品数量、验收要求及商业条件另行书面确认。'],
    limitations:['供应商版为独立的通用补件模板，不包含内部评审、原始附件或经营数据。'],mode:'supplier',createdAt:report.createdAt};
}
