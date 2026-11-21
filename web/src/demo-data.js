// Public price evidence is separate from explicitly fictional operating records.
const date='2026-11-11';
const cupSources=[
  {title:'1688 · 不锈钢保温杯500ml',url:'https://s.1688.com/kq/-B2BBD0E2B8D6B1A3CEC2B1AD3530306D6C.html?beginPage=40',price:'摘要列出 ¥19.95、¥18.00、¥7.60；多个商品混列，未确认规格、单位、MOQ及税运。'},
  {title:'1688 · 304保温杯',url:'https://s.1688.com/kq/-333034B1A3CEC2B1AD.html?beginPage=16',price:'摘要出现500ml 304不锈钢便携保温杯及 ¥23.00；原页跳转登录，未确认报价。'},
  {title:'1688 · 500ml保温瓶',url:'https://s.1688.com/kq/-3530306D6CB1A3CEC2C6BF.html?beginPage=2',price:'摘要列出 ¥12.35、¥14.00、¥12.50、¥10.45；聚合页价格线索，非同款可比报价。'}
];
const sockSources=[
  {title:'1688 · 冬季棉袜',url:'https://s.1688.com/kq/-B6ACBCBEC3DECDE0C5FAB7A2.html?beginPage=5',price:'摘要出现男士中筒袜及 ¥0.66；单位、成分、规格及采购条件尚未核实。'},
  {title:'1688 · 东北棉袜',url:'https://s.1688.com/kq/-B6ABB1B1C3DECDE0C5FAB7A2.html?beginPage=3',price:'摘要列出 ¥1.60、¥1.20、¥1.45；多个商品混列，原页跳转登录，未确认报价。'},
  {title:'1688 · 盐系清新中筒袜',url:'https://www.1688.com/chanpin/-D1CECFB5C7E5D0C2D6D0CDB2CDE0.html',price:'摘要出现灰色刺绣女袜及“¥1.621双起订”；价格与起订量粘连，保留原文，不拆为确认单价。'}
];
// sku, name, specification, cost, retail, stock, sales30d, inbound, cancellable, committed, leadDays, role
export const DEMOS=[
  {id:'cups',name:'保温杯',keyword:'304不锈钢保温杯 500ml',unit:'只',description:'办公主力款、便携款、慢销大容量款与礼品款，演示新品重叠和补货取舍。',sources:cupSources,
    rows:[
      ['DEMO-CUP-500','办公直身保温杯','500ml；304材质为模拟设定，未检测',20,49,180,120,60,60,20,10,'主力款，保持供货'],
      ['DEMO-CUP-350','便携小容量杯','350ml；独立规格',18,39,80,90,50,0,10,7,'轻便场景，需防断货'],
      ['DEMO-CUP-750','大容量保温杯','750ml；独立规格',26,69,300,20,120,120,0,14,'库存偏高，可讨论暂停可取消补货'],
      ['DEMO-CUP-GIFT','礼品保温杯套装','500ml单杯含礼盒；按套库存，本Demo折合1只/套',28,79,60,35,0,0,15,12,'礼赠场景，与普通款有差异']
    ],
    candidates:[['DEMO-NEW-CUP-500','轻量办公保温杯','500ml',18,100,'与DEMO-CUP-500用途接近，是否轻量须样品核实'],['DEMO-NEW-CUP-350','便携保温杯','350ml',16,100,'与DEMO-CUP-350重叠，是否新增需求待验证']]
  },
  {id:'socks',name:'袜子',keyword:'中筒 棉袜 批发',unit:'双',description:'日常中筒、运动、加厚与短袜，演示季节性、库存积压和组合差异。',sources:sockSources,
    rows:[
      ['DEMO-SOCK-CREW','日常中筒袜','成人均码；棉混纺比例未知',1.6,6.9,600,450,300,300,80,7,'日常主力款'],
      ['DEMO-SOCK-SPORT','运动毛圈袜','成人均码；厚度与成分为模拟设定',3.2,12.9,150,180,200,0,40,10,'运动场景，需防断货'],
      ['DEMO-SOCK-THICK','秋冬加厚中筒袜','成人均码；成分未知',2.5,9.9,900,90,600,600,20,12,'库存偏高；旺季假设不等于需求预测'],
      ['DEMO-SOCK-ANKLE','基础短袜','成人均码；薄款',1.2,4.9,300,60,0,0,0,7,'模拟淡季款，观察库存消化']
    ],
    candidates:[['DEMO-NEW-SOCK-CREW','日常棉混纺中筒袜','成人均码；成分比例待检',1.45,500,'与DEMO-SOCK-CREW重叠，需比较耐洗、掉色与起球'],['DEMO-NEW-SOCK-SPORT','运动毛圈中筒袜','成人均码；成分待检',2.9,300,'运动用途，需验证防滑、厚度和穿着舒适性']]
  }
];
export function demoCSV(d){
  const headers=['数据性质','SKU','产品名称','规格','单位','币种','统计周期','库存日期','模拟含税到货成本/单位','模拟销售单价/单位','可用库存','30天销量','在途数量','其中可取消补货数量','已承诺订单数量','补货交期天数','用途与场景','税运口径','其他变动成本/单位','市场来源标题','市场原文价格线索','来源URL','检索日期','来源限制'];
  const rows=d.rows.map((r,i)=>['全部经营数字为虚构Demo，不是真实企业数据',r[0],r[1],r[2],d.unit,'CNY','2026-10-12至2026-11-10（30天）','2026-11-11',...r.slice(3,11),r[11],'仅演示：采购成本假定含税运，零售价为模拟含税售价；税额未拆分，不能计算财务净利润','未知；不按0处理',d.sources[i%d.sources.length].title,d.sources[i%d.sources.length].price,d.sources[i%d.sources.length].url,date,'公开搜索摘要/聚合页；非真实SKU来源证明，未核实成交价；内部SKU为虚构编号']);
  return '\ufeff'+[headers,...rows].map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
export function demoSupplier(d){
  return `【${d.name} Demo · 模拟供应商候选资料】\n本文件所有候选SKU、采购报价、MOQ、用途、交期和成本假设均为演示设定，非真实供应商报价或采购承诺。公共来源仅提供品类和价格量级线索，不证明候选同款、同规格或同商家。\n\n`+
    d.candidates.map(c=>`${c[0]}｜${c[1]}｜${c[2]}\n模拟采购报价：CNY ${c[3]}/${d.unit}；模拟MOQ：${c[4]}${d.unit}；仅演示假定含税到货，不据此推断真实市场含税运价。\n场景：${c[5]}。\n模拟交期10天；实际材质、检测、售后、付款及授权均未提供。\n`).join('\n')+
    `\n市场价格线索（检索日期${date}，并非已核验报价）：\n`+d.sources.map(s=>`${s.title}\n${s.price}\n${s.url}`).join('\n\n')+
    '\n\n演示采购目标：结合单独提供的内部Demo库存、30天销量、订单与可取消补货数据，判断候选是否重复、哪些旧SKU可保留或暂停补货、样品和试单要验证什么。没有完整销量预测及变动成本，不补造利润。现有SKU与候选SKU严格区分。';
}
export function demoSelection(existing,item){return [...existing.filter(x=>x.id!==item.id).map(x=>({...x,selected:false})),item];}
