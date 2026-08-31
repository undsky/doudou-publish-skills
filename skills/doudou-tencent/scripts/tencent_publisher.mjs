import path from 'node:path';
import { parseArticle } from './parser.mjs';

/**
 * 生成可直接在目标页面 (https://cloud.tencent.com/developer/article/write-new) evaluate_script 执行的拟真发布 Payload 函数字符串
 * @param {string} markdownFilePath 
 * @returns {string} 可在目标页面执行的自包含异步 JS 代码
 */
export function buildBrowserPublishScript(markdownFilePath) {
  const articleData = parseArticle(markdownFilePath);
  const jsonPayload = JSON.stringify({
    title: articleData.title,
    summary: articleData.summary,
    tags: articleData.tags,
    bodyContent: articleData.bodyContent,
    cover: articleData.cover
  });

  return `(async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  // 1. 检查页面和编辑器容器
  const editorEl = document.querySelector('.cdc-article-editor');
  if (!editorEl) {
    return {
      success: false,
      error: '未找到腾讯云文章编辑器，请确保已登录并停留在 https://cloud.tencent.com/developer/article/write-new',
      logs
    };
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  // 辅助函数：通过 React Fiber 查找组件
  function findFiber(dom, matchFn) {
    if (!dom) return null;
    const fiberKey = Object.keys(dom).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    let fiber = dom[fiberKey];
    function search(f, depth = 0) {
      if (!f || depth > 25) return null;
      if (matchFn(f)) return f;
      return search(f.child, depth + 1) || search(f.sibling, depth + 1);
    }
    return search(fiber);
  }

  // 2. 模拟人工输入标题
  log('正在拟真人机设置文章标题: ' + data.title);
  const titleEl = document.querySelector('.cdc-article-editor__title-input');
  if (titleEl) {
    titleEl.focus();
    await randomDelay(300, 600);
    
    // 原生 setter + _valueTracker 重置
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(titleEl, data.title);
    } else {
      titleEl.value = data.title;
    }
    if (titleEl._valueTracker) {
      titleEl._valueTracker.setValue('');
    }

    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    titleEl.dispatchEvent(new Event('change', { bubbles: true }));
    
    // 同步 React Fiber onChange
    const titleFiberKey = Object.keys(titleEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    const tFiber = titleEl[titleFiberKey];
    if (tFiber && tFiber.memoizedProps && typeof tFiber.memoizedProps.onChange === 'function') {
      tFiber.memoizedProps.onChange({ target: { value: data.title }, currentTarget: { value: data.title } });
    }
    
    await randomDelay(200, 400);
    titleEl.blur();
  }
  await randomDelay(400, 800);

  // 3. 注入 Markdown 正文并触发 Cherry Markdown / CodeMirror 渲染
  log('正在注入 Markdown 正文并触发 Cherry 渲染 (字符数: ' + data.bodyContent.length + ')...');
  
  // 查找 Cherry API 实例
  const editorFiberKey = Object.keys(editorEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  let cur = editorEl[editorFiberKey];
  let cherryApi = null;
  while (cur) {
    let hook = cur.memoizedState;
    while (hook) {
      if (hook.memoizedState && typeof hook.memoizedState === 'object' && typeof hook.memoizedState.setMarkdown === 'function') {
        cherryApi = hook.memoizedState;
        break;
      }
      hook = hook.next;
    }
    if (cherryApi) break;
    cur = cur.return;
  }

  if (cherryApi && typeof cherryApi.setMarkdown === 'function') {
    cherryApi.setMarkdown(data.bodyContent);
    log('已调用 cherryApi.setMarkdown 成功注入正文');
  }

  // 查找并同步 Cherry 组件外层 onChange
  const cherryCompFiber = findFiber(editorEl, f => f.memoizedProps && typeof f.memoizedProps.onChange === 'function' && f.memoizedProps.onInit);
  if (cherryCompFiber && cherryCompFiber.memoizedProps && typeof cherryCompFiber.memoizedProps.onChange === 'function') {
    cherryCompFiber.memoizedProps.onChange(data.bodyContent);
  }

  await randomDelay(800, 1500);

  // 4. 模拟人类作者自然视口平滑滚动检查排版
  log('模拟平滑视口滚动检查文章排版...');
  window.scrollTo({ top: 350, behavior: 'smooth' });
  await randomDelay(400, 700);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await randomDelay(300, 600);

  // 5. 点击「去发布」打开发布设置抽屉
  log('模拟点击「去发布」打开发布设置抽屉...');
  const publishBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('去发布'));
  if (publishBtn) {
    publishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    publishBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    publishBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await randomDelay(300, 600);
    publishBtn.click();
  }
  await randomDelay(800, 1400);

  // 检查抽屉是否已展开
  const drawer = document.querySelector('.editor-publish-drawer');
  if (!drawer) {
    log('警告: 未找到展开的发布抽屉，尝试直接在顶栏保存草稿');
  }

  let drawerFiber = null;
  if (drawer) {
    const dFiberKey = Object.keys(drawer).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    let df = drawer[dFiberKey];
    while (df && !(df.memoizedProps && df.memoizedProps.onSaveDraftArticle)) {
      df = df.return;
    }
    drawerFiber = df;
  }

  // 6. 设置文章来源 (原创)、标签与自定义关键词
  if (drawer) {
    log('正在配置文章来源与技术标签...');
    if (drawerFiber && drawerFiber.memoizedProps && typeof drawerFiber.memoizedProps.onFieldChange === 'function') {
      drawerFiber.memoizedProps.onFieldChange('sourceType', 0); // 0 为原创
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        drawerFiber.memoizedProps.onFieldChange('longtailTag', data.tags);
      }
    }

    // 模拟在自定义关键词输入框中逐个输入标签
    const tagInputs = Array.from(drawer.querySelectorAll('.cdc-tags-input__input'));
    if (tagInputs.length >= 2 && Array.isArray(data.tags)) {
      const customTagInput = tagInputs[1]; // 第二个为自定义关键词
      const customFiberKey = Object.keys(customTagInput).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      const cFiber = customTagInput[customFiberKey];

      for (const tag of data.tags.slice(0, 5)) {
        customTagInput.focus();
        await randomDelay(150, 300);
        if (cFiber && cFiber.memoizedProps) {
          if (typeof cFiber.memoizedProps.onChange === 'function') {
            cFiber.memoizedProps.onChange({ target: { value: tag }, currentTarget: { value: tag } });
          }
          if (typeof cFiber.memoizedProps.onKeyDown === 'function') {
            cFiber.memoizedProps.onKeyDown({
              key: 'Enter',
              keyCode: 13,
              which: 13,
              code: 'Enter',
              target: customTagInput,
              currentTarget: customTagInput,
              preventDefault: () => {},
              stopPropagation: () => {}
            });
          }
        }
        await randomDelay(200, 400);
      }
    }
    await randomDelay(400, 700);

    // 7. 填写文章摘要
    log('正在填写文章摘要 (字符数: ' + data.summary.length + ')...');
    const summaryEl = drawer.querySelector('.editor-publish-drawer__textarea-main') || drawer.querySelector('textarea[placeholder*="摘要"]');
    if (summaryEl) {
      summaryEl.focus();
      await randomDelay(200, 400);

      const nativeTextareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeTextareaSetter) {
        nativeTextareaSetter.call(summaryEl, data.summary);
      } else {
        summaryEl.value = data.summary;
      }
      if (summaryEl._valueTracker) {
        summaryEl._valueTracker.setValue('');
      }
      summaryEl.dispatchEvent(new Event('input', { bubbles: true }));
      summaryEl.dispatchEvent(new Event('change', { bubbles: true }));

      // 同步 Fiber
      const sFiberKey = Object.keys(summaryEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      const sFiber = summaryEl[sFiberKey];
      if (sFiber && sFiber.memoizedProps && typeof sFiber.memoizedProps.onChange === 'function') {
        sFiber.memoizedProps.onChange({ target: { value: data.summary }, currentTarget: { value: data.summary } });
      }
      summaryEl.blur();
    }
    if (drawerFiber && drawerFiber.memoizedProps && typeof drawerFiber.memoizedProps.onFieldChange === 'function') {
      drawerFiber.memoizedProps.onFieldChange('userSummary', data.summary);
    }
    await randomDelay(400, 800);

    // 8. 封面图注入与 Cropper 初始化
    let coverLoaded = false;
    if (data.cover && data.cover.type !== 'none') {
      log('正在处理文章封面图 (' + (data.cover.type === 'cdn' ? data.cover.url : '本地Base64') + ')...');
      try {
        let file = null;
        if (data.cover.type === 'cdn' && data.cover.url) {
          const resp = await fetch(data.cover.url);
          const blob = await resp.blob();
          file = new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' });
        } else if (data.cover.base64) {
          const byteCharacters = atob(data.cover.base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: data.cover.mimeType || 'image/png' });
          file = new File([blob], 'cover.png', { type: blob.type });
        }

        if (file) {
          const coverInput = drawer.querySelector('.img-cover-input');
          if (coverInput) {
            const cInputFiberKey = Object.keys(coverInput).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
            const cInputFiber = coverInput[cInputFiberKey];
            if (cInputFiber && cInputFiber.memoizedProps && typeof cInputFiber.memoizedProps.onChange === 'function') {
              cInputFiber.memoizedProps.onChange({
                target: { files: [file] },
                currentTarget: { files: [file] }
              });
              coverLoaded = true;
              log('已触发封面图加载与 Cropper 初始化');
            }
          }
        }
      } catch (e) {
        log('封面图加载异常: ' + e.message);
      }
      
      // 等待封面上传和裁剪器渲染完毕（检测上传中提示消失）
      log('等待封面上传与 Cropper 准备就绪...');
      for (let i = 0; i < 15; i++) {
        await delay(500);
        const toasts = Array.from(document.querySelectorAll('.t-message, [class*="toast"], [class*="message"]')).map(t => t.innerText);
        const isUploading = toasts.some(t => t.includes('上传封面中') || t.includes('请稍候'));
        if (!isUploading && i >= 4) {
          break;
        }
      }
      await randomDelay(500, 1000);
    }
  }

  // 9. 拟真悬停并点击「存草稿」按钮（优先抽屉内存草稿，降级顶栏存草稿）
  log('模拟鼠标悬停并点击「存草稿」...');
  let draftBtn = null;
  if (drawer) {
    draftBtn = Array.from(drawer.querySelectorAll('button')).find(b => b.innerText.trim() === '存草稿');
  }
  if (!draftBtn) {
    draftBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '存草稿');
  }

  if (!draftBtn) {
    return { success: false, error: '未找到「存草稿」按钮', logs };
  }

  draftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  draftBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  draftBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await randomDelay(400, 700);

  draftBtn.click();
  log('已触发「存草稿」点击');

  // 10. 轮询等待网络请求与状态保存反馈（最高等待 8 秒）
  let isSuccess = false;
  let draftId = null;
  let currentUrl = window.location.href;
  let statusTexts = [];
  let toasts = [];

  for (let attempt = 0; attempt < 8; attempt++) {
    await delay(1000);
    currentUrl = window.location.href;
    const draftIdMatch = currentUrl.match(/[?&]draftId=([^&]+)/);
    draftId = draftIdMatch ? draftIdMatch[1] : null;

    toasts = Array.from(document.querySelectorAll('[class*="toast"], [class*="message"], [class*="notify"], [class*="alert"], .t-message'))
      .map(t => t.innerText.trim())
      .filter(Boolean);

    statusTexts = Array.from(document.querySelectorAll('span, p, div'))
      .map(el => el.innerText.trim())
      .filter(t => t.includes('保存到草稿') || t.includes('保存了草稿'));

    if (draftId || statusTexts.length > 0 || toasts.some(t => t.includes('成功') || t.includes('草稿'))) {
      isSuccess = true;
      break;
    }
  }

  log(isSuccess ? '草稿保存成功! (draftId: ' + draftId + ')' : '保存完成，请查看页面状态');

  return {
    success: isSuccess,
    draftId,
    url: currentUrl,
    title: data.title,
    summary: data.summary,
    tags: data.tags,
    coverType: data.cover ? data.cover.type : 'none',
    coverUrl: data.cover ? data.cover.url : null,
    toasts,
    statusTexts: statusTexts.slice(0, 5),
    logs
  };
})()`;
}

// 命令行直接运行测试与生成
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const targetFile = process.argv[2] || '/Users/jyx/project/undsky/mds/AICoding/ddagent.md';
  const script = buildBrowserPublishScript(targetFile);
  console.log(`已成功生成发布脚本，字符数: ${script.length}`);
}

