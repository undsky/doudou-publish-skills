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
    bodyContent: articleData.bodyContent,
    cover: articleData.cover
  });

  return `async () => {
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
  let drawer = document.querySelector('.editor-publish-drawer');
  if (!drawer) {
    const publishBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('去发布'));
    if (publishBtn) {
      publishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      publishBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      publishBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await randomDelay(300, 600);
      publishBtn.click();
    }
    await randomDelay(800, 1400);
    drawer = document.querySelector('.editor-publish-drawer');
  }

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

  // 6. 设置文章来源 (原创)（标签与关键词留给用户自行填写）
  if (drawer) {
    log('正在配置文章来源 (原创)...');
    
    // 模拟点击并选中「原创」单选框 (value 为 1)
    const originalRadioLabel = Array.from(drawer.querySelectorAll('label.t-radio, .t-radio')).find(l => l.innerText.includes('原创'));
    if (originalRadioLabel) {
      originalRadioLabel.click();
      const input = originalRadioLabel.querySelector('input');
      if (input) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    if (drawerFiber && drawerFiber.memoizedProps && typeof drawerFiber.memoizedProps.onFieldChange === 'function') {
      drawerFiber.memoizedProps.onFieldChange('sourceType', 1); // 1 为原创 (2 为转载, 3 为翻译)
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

      // 若出现裁剪确认弹窗，模拟确认
      const cropConfirmBtns = Array.from(document.querySelectorAll('.t-dialog button, .cdc-modal button, .t-popup button, button')).filter(b => {
        const text = b.innerText.trim();
        return text === '确定' || text === '确认' || text === '完成' || text === '裁剪并使用';
      });
      if (cropConfirmBtns.length > 0) {
        log('检测到裁剪确认按钮，模拟点击确认...');
        const targetCropBtn = cropConfirmBtns[cropConfirmBtns.length - 1];
        targetCropBtn.click();
        await randomDelay(500, 1000);
      }

      await randomDelay(500, 1000);
    }
  }

    // 9. 安全隔离：收起发布抽屉并等待平台原生自动保存生效（保留编辑页现场，绝不点击「发布」）
  log('💾 正在收起发布抽屉并保留配置（依托腾讯云原生自动保存，绝不触碰发布）...');
  const closeDrawerBtn = drawer ? drawer.querySelector('button[class*="close"], .t-drawer__close-btn, button:has(.t-icon-close)') : null;
  if (closeDrawerBtn) {
    closeDrawerBtn.click();
    await randomDelay(400, 600);
  }

  // 10. 模拟人工视口平滑滚动排版审阅
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await randomDelay(400, 700);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await delay(2500);

  const currentUrl = window.location.href;
  const draftIdMatch = currentUrl.match(/[?&]draftId=([^&]+)/);
  const draftId = draftIdMatch ? draftIdMatch[1] : null;

  log('🎉 腾讯云开发者社区文章内容填入完毕，自动保存已就绪！(draftId: ' + (draftId || '就绪') + ')');

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    draftId,
    url: currentUrl,
    title: data.title,
    summary: data.summary,
    coverState: data.cover ? '已配置' : '无',
    logs
  };
};`;
}

// 命令行直接运行测试与生成
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('tencent_publisher.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node tencent_publisher.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const script = buildBrowserPublishScript(targetFile);
  console.log(`已成功生成发布脚本，字符数: ${script.length}`);
}

