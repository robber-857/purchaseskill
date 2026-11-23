import {escape as e} from './report.js';

import {workspaceIcon as libraryIcon} from './workspace-icons.js';

export function libraryHeader(title,description,action=''){
  return `<header class="library-header"><div><h1>${title}</h1><p>${description}</p></div>${action}</header>`;
}

export function internalLibrary(config,demos){
  const scenarios=demos.map(d=>`<article class="library-demo">
    <h3>${e(d.name)}示例</h3><p>${e(d.description)}</p>
    <button type="button" class="library-link" data-use-demo="${d.id}">使用${e(d.name)}示例 ${libraryIcon('arrow')}</button>
    <div class="demo-downloads"><button type="button" data-download-demo="${d.id}" data-kind="internal">下载内部 CSV</button><button type="button" data-download-demo="${d.id}" data-kind="supplier">下载候选资料</button></div>
    <details><summary>公开价格线索</summary>${d.sources.map(s=>`<p><a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(s.title)} ↗</a><br>${e(s.price)}</p>`).join('')}<small>2026-11-11 采集的搜索摘要，部分原页需要登录。</small></details>
  </article>`).join('');
  return `<main class="workspace library-workspace">
    ${libraryHeader('内部经营数据','管理库存、销量和成本资料，勾选本次采购评审要使用的文件。','<a class="library-btn library-btn-main" href="/">返回采购评审 '+libraryIcon('arrow')+'</a>')}
    <div class="library-columns"><section class="library-maincol">
      <section class="library-surface" aria-labelledby="internal-files-title">
        <header class="library-surface-head"><h2 id="internal-files-title">经营资料库</h2><span id="internal-count" class="library-meta" aria-live="polite"></span></header>
        <div class="library-upload" id="internal-dropzone" role="button" tabindex="0" aria-label="选择内部经营数据">
          <span class="library-pictogram">${libraryIcon('upload')}</span>
          <div><h3>上传内部经营数据</h3><p>拖入文件，或点击选择</p></div>
          <input id="internal-input" type="file" multiple hidden accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.ppt,.pptx">
        </div>
        <p class="library-help">支持 Excel、CSV、PDF、演示文稿、文档及图片。单个文件最多 ${config.maxFileMB} MB，与供应商资料合计最多 6 份、${config.maxTotalMB} MB。</p>
        <div id="error" class="error" role="alert" hidden></div><div id="progress" class="progress" hidden><div class="progress-track"><span id="progress-fill"></span></div><p id="progress-text" aria-live="polite"></p></div>
        <div id="internal-list"></div>
        <p class="library-footnote">文件保存在当前浏览器，仅勾选的资料会随本次评审提交。</p>
      </section>
      <div id="page-preview"></div>
      <section class="library-surface library-scenarios">
        <header class="library-surface-head"><h2>示例资料</h2><span class="library-meta">模拟数据</span></header>
        <p class="library-section-intro">每套含 4 个现有 SKU 与 2 款候选新品。选用示例会替换当前待评审的文件。已保存的资料可重新勾选。</p>
        <div class="library-demo-grid">${scenarios}</div>
      </section>
    </section>
    <aside class="library-surface library-template" aria-labelledby="sku-template">
      <span class="library-pictogram">${libraryIcon('library')}</span>
      <h2 id="sku-template">SKU 数据模板</h2><p>按 SKU 填写一行数据，未知值留空。</p>
      <div class="library-template-download"><a class="library-btn library-btn-outline" href="/templates/sku-template.xlsx" download>${libraryIcon('download')} Excel 模板</a><a class="library-link" href="/templates/sku-template.csv" download>CSV 模板</a></div>
      <dl><dt>商品与定位</dt><dd>SKU、名称、品类、规格、用途</dd><dt>库存与销量</dt><dd>统计周期、库存、在途、销量</dd><dt>价格与成本</dt><dd>币种、税费口径、售价、到货成本</dd><dt>补货与履约</dt><dd>交期、订单承诺、可取消补货</dd></dl>
      <p class="library-template-note">CSV 请保存为 UTF-8。Excel 请先重算并保存公式，上传后可按工作表和行号预览。</p>
    </aside></div></main>`;
}

export function historyLogin(){
  return `<section class="library-surface library-auth"><div class="library-pictogram">${libraryIcon('key')}</div>
    <h2>登录采购工作区</h2><p>使用负责人提供的工作区密钥，查看团队保存的评审报告。</p>
    <form id="workspace-login"><label for="history-key">工作区访问密钥</label><input id="history-key" name="key" type="password" placeholder="输入工作区密钥" required maxlength="256" autocomplete="current-password">
    <button class="library-btn library-btn-main" type="submit">登录工作区 ${libraryIcon('arrow')}</button></form>
    <p class="library-footnote">体验邀请码仅用于新建评审。</p></section>`;
}

export function historyPanel(){
  return `<section class="library-surface library-reports">
    <header class="library-surface-head"><h2>评审记录</h2><div class="library-toolbar"><button class="library-link" type="button" id="refresh-history">${libraryIcon('refresh')} 刷新列表</button><button class="library-link" type="button" id="workspace-logout">退出工作区</button></div></header>
    <div class="library-filters"><label class="library-search">${libraryIcon('search')}<input type="search" id="history-query" aria-label="按报告名称搜索" placeholder="搜索报告名称" autocomplete="off"></label>
    <select aria-label="按报告状态筛选" id="history-filter"><option value="">全部状态</option><option value="completed">已完成</option><option value="analyzing">分析中</option><option value="uploading">待上传</option><option value="failed">未完成</option></select></div>
    <div id="history-list"></div></section>`;
}

const statuses={completed:'已完成',failed:'未完成',uploading:'待上传',analyzing:'分析中'};
const dateFormat=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
export function historyRows(items,errorText){
  return `<div class="library-report-head" aria-hidden="true"><span>报告名称</span><span>创建时间</span><span>状态</span><span></span></div>`+
    items.map(x=>{
      const date=new Date(x.createdAt);
      const validDate=Number.isFinite(date.getTime());
      const status=Object.hasOwn(statuses,x.status)?x.status:'unknown';
      const title=e(x.title||'采购报告'),action=status==='completed'?'打开报告':'查看任务';
      return `<article class="library-report-row">
        <div class="library-report-name"><span class="library-file-icon">${libraryIcon('file')}</span><div><h3>${title}</h3>${x.error?`<p class="library-row-error">${e(errorText(x.error))}</p>`:''}</div></div>
        <time class="library-date" ${validDate?`datetime="${date.toISOString()}"`:''}>${validDate?`${dateFormat.format(date)} <small>${timeFormat.format(date)}</small>`:'—'}</time>
        <span class="library-state" data-state="${status}">${statuses[status]||'状态待确认'}</span>
        <button class="library-open" type="button" data-history-id="${e(x.id)}" aria-label="${action} · ${title}">${action} ${libraryIcon('arrow')}</button></article>`;
    }).join('');
}
