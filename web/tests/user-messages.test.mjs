import assert from 'node:assert/strict';
import test from 'node:test';
import {fileMessage,responseData,serviceMessage} from '../src/user-messages.js';

test('invite and source issues give users a specific action',()=>{
  assert.match(serviceMessage('create','邀请码不正确'),/邀请方/);
  assert.match(serviceMessage('market','未配置视觉模型，无法进行截图价格识别'),/手动填写/);
  assert.match(serviceMessage('shared','链接无效或已失效'),/分享人/);
});

test('stored and live service failures never surface raw provider details',async()=>{
  const raw='模型服务返回 403。请检查余额、视觉能力、JSON 模式及 API 配置。';
  const message=serviceMessage('generate',raw);
  assert.match(message,/恢复上次任务/);
  assert.doesNotMatch(message,/JSON|API|403|配置/);
  await assert.rejects(responseData(Response.json({error:raw},{status:400}),'generate'),{message});
  await assert.rejects(responseData(new Response('Internal Server Error',{status:500}),'market'),{message:serviceMessage('market')});
  assert.deepEqual(await responseData(Response.json({ok:true}),'market'),{ok:true});
});

test('source errors preserve useful file guidance and hide parser diagnostics',()=>{
  assert.match(fileMessage(new DOMException('no space','QuotaExceededError')),/存储空间/);
  assert.match(fileMessage(new Error('invalid pdf structure')),/重新导出/);
  assert.match(fileMessage(new TypeError('Cannot read properties of undefined')),/重新选择文件/);
  assert.equal(fileMessage(new Error('单个文件不能超过 50 MB')),'单个文件不能超过 50 MB');
});
