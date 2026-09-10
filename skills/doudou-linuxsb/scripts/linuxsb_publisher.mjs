import path from 'node:path';
import { parseArticle, FORUM_BOARDS } from './parser.mjs';

/**
 * 生成可直接在目标页面 (https://linux.sb/topic_edit?fid=4) evaluate_script 执行的拟真表单填充 Payload 函数字符串
 * 【核心铁律】本流程仅负责自动填入标题、版块、Markdown正文及实时预览校验，严禁自动触发保存提交！
 * @param {string} markdownFilePath 
 * @param {{ defaultFid?: string, fid?: string, preferCdn?: boolean }} options 
 * @returns {string} 可在目标页面执行的自包含异步 JS 代码
 */
export function buildBrowserPublishScript(markdownFilePath, options = {}) {
  const articleData = parseArticle(markdownFilePath, options);
  const targetFid = '4';
  const targetForumName = '技术交流';

  const jsonPayload = JSON.stringify({
    title: articleData.title,
    fid: targetFid,
    forumName: targetForumName,
    bodyContent: articleData.bodyContent,
    cover: articleData.cover
  });

  return `async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  log('开始执行 Linux.sb (烧饼社区) 文章拟真填充流程（不触发自动保存）...');

  // 1. 检查页面和登录状态
  const formEl = document.querySelector('form[action*="topic_edit"]') || document.querySelector('form[method="post"]');
  const textarea = document.querySelector('textarea[name="body"]');
  const titleInput = document.querySelector('input[name="title"]');

  if (!formEl || !textarea || !titleInput) {
    return {
      success: false,
      error: '未能定位发帖表单或输入组件，请确认当前已登录并停留在 https://linux.sb/topic_edit 页面',
      needsLogin: !document.querySelector('a[href*="/user/"], a[href*="logout"], .avatar'),
      logs
    };
  }

  // 2. 检查并自动确认/关闭社区发帖规范弹窗
  const noticeBackdrop = document.querySelector('.posting-notice-backdrop, .posting-notice-dialog');
  const noticeConfirmBtn = document.querySelector('.posting-notice-confirm');
  if (noticeConfirmBtn && (noticeBackdrop || noticeConfirmBtn.offsetParent !== null)) {
    log('检测到社区发帖规范提示弹窗，正在拟真点击「我已阅读并确认」...');
    noticeConfirmBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomDelay(300, 500);
    noticeConfirmBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    noticeConfirmBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await randomDelay(200, 400);
    noticeConfirmBtn.click();
    await randomDelay(400, 700);
    log('社区规范弹窗已确认并关闭。');
  }

  // 3. 选择发帖版块 (forum_id)
  const forumSelect = document.querySelector('select[name="forum_id"]');
  if (forumSelect && data.fid) {
    log('正在选择发帖版块: ' + data.forumName + ' (fid=' + data.fid + ')...');
    forumSelect.focus();
    await randomDelay(200, 400);
    forumSelect.value = data.fid;
    forumSelect.dispatchEvent(new Event('input', { bubbles: true }));
    forumSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await randomDelay(300, 500);
    forumSelect.blur();
  }

  // 4. 拟真输入文章标题
  log('正在拟真输入文章标题: ' + data.title);
  titleInput.focus();
  await randomDelay(300, 600);

  const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeInputSetter) {
    nativeInputSetter.call(titleInput, data.title);
  } else {
    titleInput.value = data.title;
  }
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  titleInput.dispatchEvent(new Event('change', { bubbles: true }));
  titleInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
  await randomDelay(300, 500);
  titleInput.blur();

  // 5. 拟真注入 Markdown 正文并同步 NB-Editor
  log('正在注入 Markdown 正文 (' + data.bodyContent.length + ' 字符)...');
  textarea.focus();
  await randomDelay(400, 700);

  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (nativeTextareaSetter) {
    nativeTextareaSetter.call(textarea, data.bodyContent);
  } else {
    textarea.value = data.bodyContent;
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

  // 同步本地草稿存储键 (如有)
  const nbEditor = document.querySelector('.nb-editor');
  const draftKey = nbEditor?.getAttribute('data-nb-editor-draft');
  if (draftKey) {
    try {
      localStorage.setItem('nb_editor_draft_' + draftKey, data.bodyContent);
    } catch (e) {
      // ignore
    }
  }
  await randomDelay(300, 500);

  // 6. 单次轻度视口微调触发渲染与懒加载
  window.scrollTo({ top: 150, behavior: 'smooth' });
  await delay(200);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await delay(600);

  window.__doudou_allow_missing_cover = true;
  log('Linux.sb 文章内容与版块填充完毕，已就绪，保持编辑态供用户人工审查与手动保存。');

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: data.title,
    fid: data.fid,
    forumName: data.forumName,
    contentLength: data.bodyContent.length,
    cover: data.cover,
    readyToPublishManually: true,
    logs
  };
};`;
}

// 命令行运行支持
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('Usage: node linuxsb_publisher.mjs <MarkdownFilePath> [fid]');
    process.exit(1);
  }
  const fid = process.argv[3];
  const scriptCode = buildBrowserPublishScript(filePath, { fid });
  console.log('=== 生成的浏览器注入代码 (前 600 字符) ===');
  console.log(scriptCode.slice(0, 600) + '...\n');
  console.log('=== 代码生成成功，长度:', scriptCode.length, '字符 ===');
}
