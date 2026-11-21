const serviceFallbacks = {
  generate: '报告暂时无法生成。请稍后恢复上次任务，或减少资料后重新评审。',
  supplier: '供应商反馈暂时无法生成，请稍后重试。',
  create: '暂时无法开始评审，请稍后重新提交资料。',
  market: '比价资料暂时无法更新，请稍后重试。',
  job: '暂时无法打开这份评审，请返回历史报告重试。',
  shared: '暂时无法打开报告，请稍后重试或向分享人索取新链接。',
  share: '分享链接暂时无法生成，请稍后重试。',
  revoke: '暂时无法撤销分享链接，请稍后重试。',
  history: '暂时无法读取历史报告，请稍后刷新。',
  'workspace-login': '暂时无法登录采购工作区，请稍后重试。',
  'workspace-logout': '暂时无法退出采购工作区，请稍后重试。'
};

// Only known, actionable server messages are surfaced. Old saved jobs can
// contain entire provider diagnostics, so treat their errors the same way.
export function serviceMessage(action, detail) {
  const message = typeof detail === 'string' ? detail.trim() : '';
  if (message === '邀请码不正确') return '邀请码不正确，请向邀请方核对后重新输入。';
  if (message === '工作区访问密钥不正确') return '工作区访问密钥不正确，请向工作区负责人核对。';
  if (message === '链接无效或已失效') return '分享链接已失效或不完整，请向分享人索取新链接。';
  if (/^(无权访问此任务|任务属于其他工作区|请先登录采购工作区)$/.test(message)) return '请用创建这份报告的采购工作区登录后重试。';
  if (message === '任务正在分析、已完成或已达到重试上限') return '请先在历史报告中查看进度。如多次生成失败，可减少资料后新建评审。';
  if (/^(原文件未上传完整|原文件大小与提交信息不一致|来源文件不匹配|来源页码重复|部分文件没有解析结果)/.test(message)) return '文件未能完整读取，请重新选择原文件并生成报告。';
  if (/^(请求过大|解析结果超过|最多分析)/.test(message)) return '本次资料较多，请拆分文件或减少图片后重试。';
  if (message === '提交内容不符合格式或长度要求') return '请检查所填内容是否完整、格式是否正确，再提交一次。';
  if (action === 'market') {
    if (/^截图未能确认/.test(message)) return '请截取单款商品的名称、规格和对应价格，再上传截图。';
    if (/截图价格识别失败|未配置视觉模型/.test(message)) return '暂时无法读取截图价格，可在「添加已核对的相似产品报价」中手动填写。';
    if (message === '仅支持1688或淘宝的公开商品链接') return '请填写 1688 或淘宝的公开商品详情页链接。';
  }
  return serviceFallbacks[action] || '暂时无法完成操作，请稍后重试。';
}

export async function responseData(response, action) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(serviceMessage(action));
  }
  if (!response.ok) throw new Error(serviceMessage(action, result?.error));
  return result;
}

export function fileMessage(error) {
  const message = error?.message || '';
  if (error?.name === 'PasswordException') return '此 PDF 受密码保护，请上传一份可直接打开的文件。';
  if (/invalid pdf|invalid zip|end of central directory|InvalidPDFException/i.test(message + ' ' + error?.name)) return '文件内容不完整，请重新导出后上传。';
  if (error?.name === 'QuotaExceededError') return '浏览器存储空间不足，请清理空间后重试。';
  if (!/[\u3400-\u9fff]/.test(message) || /https?:\/\/|\n\s*at |\b(tus:|TypeError|DOMException|stack trace)\b/i.test(message)) return '无法读取或保存资料，请重新选择文件后重试。';
  return message;
}
