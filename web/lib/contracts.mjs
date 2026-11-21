import { z } from 'zod';
export const MB = 1024 * 1024;
export const EXTENSIONS = ['pdf','pptx','ppt','png','jpg','jpeg','webp','txt','docx','xlsx','xls','csv'];
export const extension = name => name.toLowerCase().split('.').pop();
export const FileSchema = z.object({name:z.string().min(1).max(180),size:z.number().int().positive(),type:z.string().max(150),role:z.enum(['supplier','internal']).default('supplier')});
export const CreateSchema = z.object({invite:z.string().max(256).default(''),files:z.array(FileSchema).min(1).max(6),context:z.object({market:z.string().min(1).max(80),purpose:z.enum(['转售商品','自用设备 / 软件','原料 / 耗材']),focus:z.string().max(1000).default(''),searchKeyword:z.string().trim().max(100).default('')})});
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
  rangeReview:z.object({
    products:z.array(z.object({name:short,specification:short,quote:short,retailPrice:short,
      recommendation:z.enum(['优先评估','第二阶段','暂缓','待确认']),role:short,reason:str,conditions:str,refs:RefsSchema})).max(12),
    requirements:z.array(z.object({category:short,items:z.array(short).min(1).max(10)})).max(20)
      .transform(groups=>Object.entries(Object.groupBy(groups,g=>g.category)).map(([category,xs])=>({category,items:[...new Set(xs.flatMap(x=>x.items))]}))),
    steps:z.array(z.object({title:short,detail:str})).min(1).max(4)
  }).optional(),
  criteria:z.array(CriterionSchema).length(5).refine(xs=>new Set(xs.map(x=>x.id)).size===5,'五个评分维度不可重复'),
  opportunities:z.array(z.object({title:z.string().min(1).max(160),detail:str,refs:RefsSchema})).max(4),
  skuImpact:z.object({summary:str,rows:z.array(z.object({sku:z.string().min(1).max(160),relationship:str,action:z.enum(['保留','暂停补货','减少补货','并行试销','评估替换','待核验']),reason:str,exitCondition:str,refs:RefsSchema})).max(12)}),
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
  if(report.assessment?.rangeReview)assessmentRefs.push(...report.assessment.rangeReview.products.flatMap(x=>x.refs));
  for(const e of [...report.evidence,...report.products,...assessmentRefs])if(!refs.has(`${e.source}:${e.page}`))throw new Error('模型返回了不存在的来源页码，请人工检查或重试');
  return report;
}
export function supplierSnapshot(report){
  // Only supplier-attributed product names cross this boundary. Never copy internal model recommendations.
  const review=report.supplierReview?.version===3?report.supplierReview:null;
  const names=review?review.products.map(p=>p.name):[...new Set((report.products||[]).filter(p=>Number.isInteger(p.source)&&report.files?.[p.source]&&report.files[p.source].role!=='internal'&&Number.isInteger(p.page)).map(p=>String(p.name).slice(0,160)))].slice(0,12);
  const supplierProducts=names.map(name=>{
    let specifications=['正式型号、材质/成分、尺寸或容量、包装及条码','适用场景、使用说明与本型号合规资料'];
    let samples=['提供与拟供型号一致的样品，并标明型号、批次及规格','共同确认功能、外观、包装及运输保护的验收方式'];
    if(/杯|保温|钛|水壶/.test(name)){specifications=['确认容量、杯身/内胆/杯盖材质及食品接触部件','确认保温条件、重量、尺寸、密封结构和礼盒配置','提供对应型号的食品接触检测、使用与清洁说明'];samples=['提供拟供容量、材质和杯盖版本的样品，标注实测容量与重量','双方约定保温、密封防漏、异味及清洗检查方法','检查杯口、涂层、配件及包装运输保护；礼盒款另核对包装配置'];}
    else if(/袜|sock/i.test(name)){specifications=['确认纤维成分比例、尺码、筒高、厚度与每包双数','确认颜色、织法、洗护标签、包装条码及对应型号检测','说明批次色差、尺码公差及质量问题处理方式'];samples=['按拟供尺码和颜色提供样品，注明对应批次','双方约定缩水、色牢度、起球、缝头与弹性检查方法','确认穿着舒适性、左右一致性及包装标签；试穿和洗涤条件需书面约定'];}
    else if(/warmies|毛绒|企鹅|龙|玩偶/i.test(name)){specifications=['确认款式型号、尺寸、重量、面料、填充物及适用年龄','如支持加热，请确认功率/时间限制、填充物、香味及禁用情形','提供适用销售市场的标签、检测、授权与使用说明'];samples=['提供与拟供款式、尺寸及填充版本一致的样品','检查缝合、掉毛、填充均匀度、异味与标签完整性','仅按已确认说明书检查加热/保温表现；先确认安全方法，不擅自设定加热参数'];}
    return {name,specificationStatus:'待供应商逐项书面确认',specifications,samples};
  });
  return {supplierReview:review,title:review?'供应商产品评估与商务沟通报告':'供应商资料补充清单',summary:review?review.summary:supplierProducts.length?`本轮围绕 ${supplierProducts.length} 款候选产品确认规格、样品与供货条件。请按产品逐项回复；确认完整资料及样品方案后，再讨论后续采购安排。`:'请先确认拟供产品的具体名称与型号，再逐款补充规格、样品及供货资料。',decision:'待补资料',products:[],evidence:[],risks:[],supplierProducts,supplierVersion:review?3:2,
    missing:['请提供逐SKU的正式报价、计价单位、含税与运费口径、MOQ及报价有效期','请确认混箱政策、外箱装数、箱规、供货周期、付款与退换/售后条款','请提供品牌供货授权、产品溯源及目标市场适用的合规资料；按型号对应','请确认样品数量、样品费用、寄送时间及费用承担方式；具体数量另行约定'],
    nextSteps:['资料与规格确认：按上方候选产品逐项回复，提供对应型号的资料，注明尚待确认事项。','样品方案确认：双方书面约定样品版本、数量、费用、测试条件及验收标准。','样品评估：记录问题与整改措施；本清单中的检查项目不代表产品已通过测试。','后续商务讨论：资料和样品结果确认后，再共同确定试销产品、数量、交付与售后安排。'],
    limitations:['本清单为按供应商候选产品整理的商务沟通稿，不构成采购承诺。','规格与样品检查均为待确认事项，不代表已完成检验或满足法规。','本版不含内部库存、成本、采购底价、评分与竞品分析。'],mode:'supplier',createdAt:report.createdAt};
}
