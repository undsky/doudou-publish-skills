import { parseArticle } from './parser.mjs';

/**
 * 生成可直接在目标页面 (https://developer.aliyun.com/article/new) evaluate_script 执行的表单填充与拟真发布函数字符串
 * @param {string} markdownFilePath 
 * @returns {string} 可在目标页面执行的自包含异步 JS 代码
 */
export function buildBrowserPublishScript(markdownFilePath) {
  const articleData = parseArticle(markdownFilePath);
  const jsonPayload = JSON.stringify({
    title: articleData.title,
    summary: articleData.summary,
    bodyContent: articleData.bodyContent,
    cover: articleData.cover
  });

  return `(async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  // 1. 检查页面和表单实例
  const formEl = document.querySelector('form.public-article-form');
  if (!formEl) {
    return { success: false, error: '未找到发布表单，请确保已登录并停留在 https://developer.aliyun.com/article/new' };
  }

  const fiberKey = Object.keys(formEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  let fFiber = formEl ? formEl[fiberKey] : null;
  let instance = null;
  while (fFiber) {
    if (fFiber.stateNode && typeof fFiber.stateNode === 'object' && fFiber.stateNode.handleSubmit) {
      instance = fFiber.stateNode;
      break;
    }
    fFiber = fFiber.return;
  }

  if (!instance) {
    return { success: false, error: '未能获取表单组件 React 实例' };
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  // 2. 模拟人工输入标题（使用 React 原生 Setter 与校验消除红字错误）
  log('正在设置文章标题...');
  const titleInput = document.querySelector('input[placeholder*="标题"]');
  if (titleInput) {
    titleInput.focus();
    await randomDelay(300, 600);
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (nativeSetter) {
      nativeSetter.call(titleInput, data.title);
    } else {
      titleInput.value = data.title;
    }
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    titleInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    titleInput.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  if (instance.field) {
    instance.field.setValue('title', data.title);
    if (typeof instance.field.validate === 'function') {
      instance.field.validate(['title']);
    }
  }
  await randomDelay(400, 800);

  // 3. 注入 Markdown 正文并触发 mditor 预览渲染
  log('正在注入 Markdown 正文并渲染预览...');
  const textarea = document.querySelector('.left-content textarea.textarea');
  if (textarea) {
    textarea.focus();
    textarea.value = data.bodyContent;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
  }

  if (instance.editor) {
    instance.editor.value = data.bodyContent;
    if (instance.editor.$emit) {
      instance.editor.$emit('change', data.bodyContent);
      instance.editor.$emit('input', data.bodyContent);
    }
    if (instance.editor.viewer && instance.editor.viewer.render) {
      instance.editor.viewer.render();
    }
  }
  await randomDelay(800, 1500);

  // 4. 模拟平滑滚动到页面下方
  log('模拟平滑视口滚动...');
  window.scrollTo({ top: 600, behavior: 'smooth' });
  await randomDelay(500, 800);
  window.scrollTo({ top: 900, behavior: 'smooth' });
  await randomDelay(400, 700);

  // 5. 填写文章摘要
  log('正在设置文章摘要...');
  const summaryEl = document.querySelector('textarea[placeholder*="摘要"]');
  if (summaryEl) {
    summaryEl.focus();
    await randomDelay(200, 400);
    const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    if (nativeTextareaSetter) {
      nativeTextareaSetter.call(summaryEl, data.summary);
    } else {
      summaryEl.value = data.summary;
    }
    summaryEl.dispatchEvent(new Event('input', { bubbles: true }));
    summaryEl.dispatchEvent(new Event('change', { bubbles: true }));
    summaryEl.blur();
  }
  if (instance.field) {
    instance.field.setValue('abstractContent', data.summary);
  }
  await randomDelay(500, 800);

  // 6. 检查封面图状态
  const uploadItem = document.querySelector('.upload-item, [class*="upload-item"]');
  const coverUploaded = !!(uploadItem || (instance.state?.fileList && instance.state.fileList.length > 0));
  const coverUrl = instance.state?.fileList?.[0]?.imgURL || (uploadItem ? uploadItem.querySelector('img')?.src : null);

  return {
    success: true,
    title: data.title,
    summary: data.summary,
    bodyLength: data.bodyContent.length,
    cover: data.cover,
    coverUploaded,
    coverUrl,
    logs
  };
})()`;
}

/**
 * 生成等待平台原生自动保存与就绪状态检查的异步 JS 代码
 */
export function buildSaveDraftScript() {
  return `(async () => {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  console.log('[doudou-aliyun] 内容已全部注入，正在模拟视口滚动审阅并等待平台原生自动保存...');
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  await randomDelay(500, 800);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await randomDelay(400, 700);

  // 等待平台原生自动保存机制生效（绝不主动点击「存为草稿」或「发布」按钮）
  await delay(2500);
  const statusTexts = Array.from(document.querySelectorAll('p, span, div')).map(el => el.innerText.trim()).filter(t => t.includes('保存了草稿') || t.includes('成功'));

  const formEl = document.querySelector('form.public-article-form');
  let fFiber = formEl ? formEl[Object.keys(formEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'))] : null;
  let instance = null;
  while (fFiber) {
    if (fFiber.stateNode && typeof fFiber.stateNode === 'object' && fFiber.stateNode.handleSubmit) {
      instance = fFiber.stateNode;
      break;
    }
    fFiber = fFiber.return;
  }

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    draftTime: instance?.state?.draftTime || new Date().toLocaleTimeString(),
    editAid: instance?.state?.editAid,
    statusTexts
  };
})()`;
}
