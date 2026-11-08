export const ASSESSMENT_RULES=`
报告增加必填 assessment 对象（在前述字段之外），用于内部决策总览。不要输出自行计算的总分。
assessment 的结构为：
{
  "criteria":[{"id":"fit|quality|commercial|portfolio|economics","status":"missing|partial|supported","basis":"本维度的资料依据、缺项和局限","refs":[{"source":0,"page":1}]}],
  "opportunities":[{"title":"潜在收益方向","detail":"依据与必须验证的前提，不能把宣传当收益","refs":[{"source":0,"page":1}]}],
  "skuImpact":{"summary":"现有组合影响及未知项","rows":[{"sku":"用户提供的真实现有型号","relationship":"新品与旧品的替代、互补或冲突依据","action":"保留|并行试销|评估替换|待核验","reason":"建议原因","exitCondition":"评估退出前必须满足的条件","refs":[{"source":0,"page":1}]}]},
  "economics":null
}
criteria 必须恰好五项，不重复：fit 产品与需求20%；quality 质量与使用条件25%；commercial 商务与交付20%；portfolio 现有组合适配15%；economics 收益与成本20%。评分衡量采购决策的资料支持度，不是质量好坏。missing 无可用依据，partial 只有部分可用依据，supported 具有本维度较完整且可追溯的评估资料。分数由程序按0%、50%、100%加权计算。supported 不等于合格，发现不符合需求也要在decision和risks保留，分数不能覆盖硬门槛。供应商宣传最多支持partial，不能成为检测合格或完整经济依据。每项basis需解释缺口；partial/supported必须引用页码。没有买方需求只能partial；没有内部经营数据时portfolio和economics为missing。无法判断为missing，不猜测。opportunities最多4项，无依据用空数组。
skuImpact.rows只允许上传文件中实际存在的现有SKU、物料或资产，不得把待采购产品伪装为现有库存。没有现有方案数据时rows为空并在summary说明不能确定替代或退出名单。不能自动清退；每行exitCondition明确剩余库存、售后与试销验证等条件。非转售用途改为现有方案/资产适配，不套用零售SKU。
economics仅用于转售：只有资料明确给出同一币种、同一周期的保守/基准/乐观三种情景及每个输入时才输出对象，否则必须null。严禁从品牌册补造销量、转化率、成本或以0代替未知。对象结构：{currency:"CNY等3位大写币种",period:"确切测算周期",basis:"输入来源、税务口径和假设局限",scenarios:[{name:"保守|基准|乐观",revenue:期间新品销售收入,variableCost:期间新品销售对应变动成本,displacedContribution:被替代旧品贡献损失,launchCost:上新成本,exitCost:退出成本,holdingCost:仓储资金成本,refs:[{source:0,page:1}]}]}。三种情景各一项，所有金额非负且最多1e10，单位为整期金额而非单价，明确为0才能填0。模型只提取输入，程序计算组合增量贡献；不能以销售额增长当净收益或净利润。缺经济数据时summary明确收益风险尚无法量化比较。
summary先回答此刻是否推进采购，然后说明最关键原因及重新评审条件。decision仍限定原枚举，只允许初筛或样品评估，不自动批准正式采购。

客户阅读规则：抓大放小，用日常中文帮助买方做决定。不要把分析过程当成报告正文。summary最多100字；先说建议，再说影响采购的最重要原因。禁止反复堆叠“证据完整度、语义评估、硬门槛、组合增量贡献”等术语；用“价格是否划算、扣除成本后能多赚多少、会不会抢走现有商品的销量、先解决什么”表达。不要把所有资料缺项都当成同等重要风险。
assessment必须另含brief对象，作为客户默认看到的简报：
{takeaway:"一句话结论，最多120字",price:{quote:"报价及币种、单位、数量条件；未提供就明确写未提供",comparison:"同规格/同数量/同税运口径的可比价格；无可比依据写无法比较",judgment:"价格意味着什么、对决策有什么影响、应该怎么谈；最多100字",refs:[{source:0,page:1}]},facts:[{label:"关键产品指标，最多24字",value:"资料中的数值及单位，最多80字",meaning:"该数据为什么影响采购，最多100字",refs:[{source:0,page:1}]}],priorities:[{title:"最值得关注的问题，最多36字",why:"数据或事实 + 对生意的影响，最多100字",action:"针对该问题该做什么，最多100字",refs:[{source:0,page:1}]}],portfolio:"是否补充现有商品、存在何种替代风险，最多100字",nextAction:"现在先做的一件事及重新评审的条件，最多100字"}
brief正文目标350至500字，facts最多3个，priorities最多3个，按影响采购决策的重要程度排序。优先价格与到货成本、真实差异、起订量/压货风险、收益空间；影响安全或已确认采购要求的重大问题不能为了简洁而省略。多款商品报价分别写清，不能把不同单位或不同SKU价格混成一个价格。只引用确实提供的数据：无价格不能断言贵或便宜；无可比报价不能说有市场优势；无成本和需求不能编利润；无库存不编退出名单。未知只解释最关键影响，不重复大段免责声明。价格/产品数值有来源才可展示；缺资料的判断refs可以为空。价格差、利润、降价目标必须基于明确可比输入或买方批准目标，不能编数字。情景收益由程序计算，brief不另算一套。
完整证据、次要风险、全部补件、评分规则和计算输入保留在原有字段，供展开附录查询。brief不能与decision、原始风险或数据矛盾；不能借“客户语言”把供应商宣传变成确定事实。客户简报仍是买方内部报告，不能直接转发给供应商。
`;
