(function(root){
  function calculate(v) {
    const unit=v.price-v.cost-v.freight-v.fee;
    const effective=unit-v.sub/100*v.oldMargin;
    const cash=v.qty*(v.cost+v.freight)+v.fixed;
    const scenarios=[['保守',.65,Math.min(100,v.sub+15)],['基准',1,v.sub],['乐观',1.25,Math.max(0,v.sub-10)]].map(([name,mult,sub])=>{
      const sold=Math.min(v.qty,Math.round(v.sales*mult));
      return {name,sold,sub,profit:sold*(unit-sub/100*v.oldMargin)-v.fixed};
    });
    return {unit,effective,cash,profit:scenarios[1].profit,remaining:v.qty-scenarios[1].sold,breakEven:effective>0?Math.ceil(v.fixed/effective):null,scenarios};
  }
  function decision(v,gate){const m=calculate(v);if(!gate)return {label:'待补充资料',tone:'amber',detail:'必要资料尚未核验。经营测算仅用于讨论，当前不形成正式采购结论。'};
    if(m.profit<=0)return {label:'建议议价 / 暂缓',tone:'red',detail:'在资料通过的演示假设下，基准情景仍未覆盖增量成本，建议调整报价或暂缓。'};
    if(m.scenarios[0].profit<0)return {label:'缩量试销，控制风险',tone:'amber',detail:'在资料通过的演示假设下，基准盈利但保守情景亏损，应先验证需求与替代比例。'};
    return {label:'可进入小批量试销',tone:'green',detail:'在资料通过的演示假设下，三个情景均有正贡献；仍需试销验证需求并由采购负责人审批。'};
  }
  const api={calculate,decision}; if(typeof module!=='undefined')module.exports=api;else root.PurchaseModel=api;
})(typeof window!=='undefined'?window:globalThis);
