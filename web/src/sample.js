// Authored from the actual 47-page supplied PDF on 2026-11-08; no simulated economics.
// Contact sheet reviewed across 47 pages; pages 4, 22 and 30 inspected at full size.
export const warmiesReport={
  title:'Warmies · 中国市场采购初筛',mode:'reviewed_sample',createdAt:'2026-11-08T00:00:00.000Z',market:'中国（演示评估场景，待买方确认）',purpose:'转售商品',ruleVersion:'purchase-review / 2026-11-08',
  files:[{name:'WARMIES BRAND BOOK 2024–2025.pdf',size:12219934}],coverage:{pages:47,images:47,textPages:4},decision:'待补资料',
  summary:'品牌册能支持产品系列与造型识别，但不能代替型号规格书、采购报价或本型号的检测材料。建议先确认长毛绒企鹅与小型蓝色龙的正式 SKU，并澄清填充物表述，再决定是否进入样品评估。现有资料不足以给出采购利润、销量或采购数量。',
  products:[
    {name:'长毛绒企鹅（按造型识别）',description:'第 22 页长毛绒系列展示企鹅造型，位于上排第二个。页面未给出可直接下单的 SKU、尺寸、条码与价格；造型名称不能作为正式采购型号。',source:0,page:22},
    {name:'小型蓝色龙（按造型识别）',description:'第 30 页小型系列展示蓝色龙造型，位于上排第二个。需要供应商确认型号、尺寸、适用年龄及具体使用说明。',source:0,page:30}
  ],
  assessment:{
    brief:{
      takeaway:'先不要下单。这两款可以继续看，但目前没有正式报价，型号和加热使用要求也没确认。先拿到这些信息，再决定是否值得试卖。',
      price:{quote:'未提供正式采购报价',comparison:'没有同规格报价，暂时无法比价',judgment:'目前不能判断买贵了没有，也算不出赚钱空间。先让供应商按型号报价，写清含不含税运、最低订多少。',refs:[]},
      facts:[{label:'候选产品',value:'长毛绒企鹅 / 小型蓝色龙',meaning:'先确认两款各自的型号、尺寸和材质；不同款式不能共用一套采购条件。',refs:[{source:0,page:22},{source:0,page:30}]}],
      priorities:[
        {title:'先看价格和起订量是否划算',why:'没有到货价和最低订货量，无法判断收益空间，也不知道首单要压多少资金。',action:'索取两款分别的含税到货报价、起订量和交期。',refs:[]},
        {title:'加热使用要求必须先确认',why:'品牌册称可加热，但具体型号的说明和检测资料未取得；售后责任暂时无法判断。',action:'先核对型号对应的说明和检测资料，再决定是否安排样品评估。',refs:[{source:0,page:4}]},
        {title:'不能只凭新造型判断好不好卖',why:'两款外观不同，但没有现有商品的销量和库存数据，无法判断是带来新需求，还是抢走旧品销量。',action:'与同类在售商品对照，再决定是否少量试卖；暂不安排旧品退出。',refs:[{source:0,page:22},{source:0,page:30}]}
      ],
      portfolio:'先不增加正式采购，也不退出旧品。补充同类商品的销量、库存和售价后，再判断这两款是否值得占用货架和资金。',
      nextAction:'先请供应商提供两款的准确型号、含税到货报价、起订量和加热说明；收到后再判断是否进入样品评估。'
    },
    criteria:[
      {id:'fit',status:'partial',basis:'可以识别两个目标造型，但正式型号、规格及买方需求尚未确认。',refs:[{source:0,page:22},{source:0,page:30}]},
      {id:'quality',status:'partial',basis:'品牌册提供使用与材料声明；具体型号的使用条件、检测材料与填充物差异仍需核验。',refs:[{source:0,page:4}]},
      {id:'commercial',status:'missing',basis:'当前评审未取得正式报价、MOQ、交期及售后条款。',refs:[]},
      {id:'portfolio',status:'missing',basis:'未提供买方现有 SKU、库存与销售数据，不能确定重叠品或退出名单。',refs:[]},
      {id:'economics',status:'missing',basis:'采购到货成本、销量基线及替代损失未知，不能测算增量贡献。',refs:[]}
    ],
    opportunities:[{title:'验证两种造型的客群差异',detail:'长毛绒企鹅与小型蓝色龙可作为不同造型候选；能否带来新增需求，需要样品反馈与买方渠道数据验证。',refs:[{source:0,page:22},{source:0,page:30}]}],
    skuImpact:{summary:'尚未提供现有 SKU 清单与经营数据。无法确定这两个候选产品是补充品、替代品，或是否应退出旧品。',rows:[]},
    economics:null
  },
  evidence:[
    {claim:'封面标示 2024–2025 collection。',status:'observed',source:0,page:1,limitation:'这是资料所标示的系列年份，不证明当前仍可供货或条款有效。'},
    {claim:'第 22 页为长毛绒系列，包含企鹅造型。',status:'observed',source:0,page:22,limitation:'只能确认页面可见造型与系列，不能确认型号、尺寸或库存。'},
    {claim:'第 30 页为小型系列，包含蓝色龙造型。',status:'observed',source:0,page:30,limitation:'产品名称为外观描述，正式名称和 SKU 待补。'},
    {claim:'品牌册宣称产品可微波加热，并描述薰衣草香气与填充物。',status:'supplier_claim',source:0,page:4,limitation:'未取得这两款具体型号的操作说明、加热限制或测试材料；不从宣传页推断安全性。'},
    {claim:'同一页出现“天然羊毛”“天然谷物”“小米”等填充物表述，存在需要解释的差异。',status:'observed',source:0,page:4,limitation:'可能涉及不同部位、不同产品或翻译差异；不能自行认定配方或判定质量不合格。'},
    {claim:'品牌册列出英国、欧洲、美国相关标准声明。',status:'supplier_claim',source:0,page:4,limitation:'本次未核验标准现行版本、报告真伪、适用型号或中国市场要求；出现标准名称不等于取得认证。'},
    {claim:'本次重点产品页没有正式采购报价、MOQ、交期和售后约定。',status:'unknown',source:0,page:22,limitation:'这是当前资料范围的缺口，不代表供应商无法提供；须索取正式商务文件。'}
  ],
  risks:[
    {title:'型号与材料尚未对应',detail:'产品图和品牌通用声明没有建立明确的型号映射。填充物的多种表述应通过型号规格表、成分说明和包装信息澄清。'},
    {title:'加热使用条件缺失',detail:'在取得具体型号的中文说明、适用人群、加热限制及相关测试材料前，不能把“可加热”宣传直接变成对消费者的安全承诺。'},
    {title:'商业可行性未知',detail:'没有正式到货成本、数量阶梯、交期与真实销售基线，无法计算利润、盈亏平衡或提出库存替代名单。'}
  ],
  missing:['两款产品的正式名称、SKU、条码、尺寸、重量和包装规格。','逐型号的表面材料、填充成分与薰衣草信息，并解释第 4 页表述差异。','具体型号的使用说明、适用人群、警示语、保养方式和相关检测资料。','中国市场供货与授权链路、正式报价、MOQ、数量阶梯、税运口径和交期。','样品提供方式、验收约定、质量问题处理及售后责任。'],
  nextSteps:['把第 22、30 页的目标造型发给供应商，请其回填准确 SKU；先避免按图片直接订货。','收齐规格、使用说明及商务条款后，由买方确认硬性需求与适用要求。','资料与样品达到已确认要求后，再讨论有限规模试销；数量、预算和停止条件由买方确定。'],
  limitations:['这是基于真实附件制作并预先审阅的示例报告，不是点击页面时即时调用模型生成。','47 页做了缩略图通览；第 4、22、30 页重点放大审阅。不是对每页小字的完整核验。','未联网核实宣传、标准、授权或供货状态；品牌册声明保留为供应商声明。','目标市场与转售用途为演示场景，未获得真实买方经营数据；未使用旧演示的模拟采购价、销量、库存及利润。']
};
