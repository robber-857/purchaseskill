# 数据与计算合同

## 最少资料

- context：采购用途、市场/交付地、销售或使用渠道、周期、币种、税口径、采购单位、审批人。
- product：名称、型号/版本/批次、规格、供应商、报价、计价单位、数量阶梯、MOQ、交期、付款、售后、报价有效期、附件。
- buyer：现有方案、需求/销量历史、库存/资产、成本、预算、验收指标、硬门槛。没有则保留为空。
- evidence：claim、source（URL或文件名）、location（页码/章节）、retrieved_at、scope（型号/地区）、status、limitation。
- assumptions：变量、数值、单位、来源、情景及确认状态。模拟数据明确标记，不作为真实输入。

## `scripts/calculate.py`：resale

每个场景的数量与参数由调用方依据证据或明确假设提供。脚本不内置90天、人民币、默认替代率或商品品类。

```json
{
  "mode": "resale",
  "currency": "CNY",
  "period": "90 days",
  "tax_basis": "consistent demo basis",
  "unit": "piece",
  "purchase_qty": 100,
  "unit_purchase_cost": 50,
  "unit_inbound_cost": 5,
  "fixed_cost": 400,
  "exit_cost": 0,
  "holding_cost": 0,
  "scenarios": [
    {"name": "base", "sold_qty": 80, "net_unit_revenue": 100,
     "unit_sales_cost": 10, "substitution_rate": 0.25,
     "old_unit_contribution": 20}
  ]
}
```

单件贡献 = 净收入 − 采购成本 − 入仓成本 − 销售/售后成本。
增量单位贡献 = 单件贡献 − 替代率 × 旧品单位贡献。
组合增量 = 售量 × 增量单位贡献 − 固定成本 − 清退成本 − 本周期持有成本。
采购阶段现金需求 = 采购量 × 到仓单位成本 + 固定/清退/持有成本（简化，不含回款时序或销售阶段流动资金）。
剩余库存仅列到仓价值，未重复扣为当期损失；若需跌价/清仓损失，需明确增量损失口径。净收入已扣退款时不重复计退款损失。
数量允许小数以支持重量等单位；盈亏平衡返回未取整值，由调用方依据采购单位取整。

## `scripts/calculate.py`：tco

```json
{
  "mode": "tco", "currency": "CNY", "period": "36 months",
  "tax_basis": "consistent demo basis",
  "options": [
    {"name": "candidate", "acquisition": 20000, "implementation": 3000,
     "operating_total": 9000, "maintenance_total": 2000,
     "exit_cost": 1000, "residual_value": 3000},
    {"name": "baseline", "acquisition": 0, "implementation": 0,
     "operating_total": 18000, "maintenance_total": 6000,
     "exit_cost": 0, "residual_value": 0}
  ]
}
```

所有费用必须是同一周期合计值；TCO = 购置 + 实施 + 运营 + 维护 + 退出 − 残值。脚本不折现、不估算税务、不给收益和采购结论。比较基线应由调用方明确，不能把选项的排序当成已满足需求。

所有数值必须有限且非负（收入/费用未知应先补齐，不允许用null、NaN或零伪装未知）；替代率位于0—1，售量不得超过已建模可供量。明确为0的费用应有“不适用/无此费用”的依据。支持以字符串输入小数，避免二进制浮点误差。
