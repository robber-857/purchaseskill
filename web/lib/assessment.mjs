// One deterministic rubric shared by the report UI and model contract.
export const CRITERIA = [
  {id:'fit',label:'产品与需求',weight:20,need:'准确型号、规格、使用场景与买方需求'},
  {id:'quality',label:'质量与使用条件',weight:25,need:'对应型号的材料、检测资料与验收条件'},
  {id:'commercial',label:'商务与交付',weight:20,need:'正式报价、MOQ、交期、税运与售后条款'},
  {id:'portfolio',label:'现有组合适配',weight:15,need:'现有 SKU / 方案、库存与真实替代关系'},
  {id:'economics',label:'收益与成本',weight:20,need:'同周期完整成本、收益基线与替代损失'},
];
export const LEVELS = {missing:{label:'待补依据',factor:0},partial:{label:'部分依据',factor:.5},supported:{label:'依据较完整',factor:1}};
export function scoreAssessment(report){
  if(report.mode==='basic'||!report.assessment)return null;
  const rows=CRITERIA.map(c=>{
    const found=report.assessment.criteria.find(x=>x.id===c.id);
    const item=found||{status:'missing',basis:'此维度尚未评估。',refs:[]};
    const level=LEVELS[item.status]||LEVELS.missing;
    return {...c,...item,points:c.weight*level.factor,label:c.label,statusLabel:level.label};
  });
  return {total:Math.round(rows.reduce((n,x)=>n+x.points,0)),complete:rows.filter(x=>x.status==='supported').length,rows};
}
export function netContribution(s){
  // Use integer cents; all amounts are totals for the stated period.
  return ['revenue','variableCost','displacedContribution','launchCost','exitCost','holdingCost'].reduce((sum,key,i)=>sum+(i===0?1:-1)*Math.round(s[key]*100),0)/100;
}
export function economicsSummary(report){
  const e=report.purpose==='转售商品'?report.assessment?.economics:null;
  if(!e)return null;
  return {...e,scenarios:e.scenarios.map(s=>({...s,net:netContribution(s)}))};
}
