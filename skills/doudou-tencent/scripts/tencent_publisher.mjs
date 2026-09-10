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

  await randomDelay(600, 1000);

  // 4. 若有封面图，打开发布设置抽屉仅上传封面并收起
  let coverLoaded = false;
  if (data.cover && data.cover.type !== 'none') {
    log('检测到封面图资产，打开发布设置抽屉上传封面...');
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
      for (let i = 0; i < 20; i++) {
        await delay(300);
        drawer = document.querySelector('.editor-publish-drawer');
        if (drawer) break;
      }
    }

    if (drawer) {
      log('正在处理文章封面图 (' + (data.cover.type === 'cdn' ? data.cover.url : '本地Base64') + ')...');
      try {
        let file = null;
        if (data.cover.url) {
          try {
            const resp = await fetch(data.cover.url);
            const blob = await resp.blob();
            file = new File([blob], 'cover.png', { type: blob.type || 'image/png' });
          } catch (fetchErr) {
            log('拉取网络封面图异常: ' + fetchErr.message);
          }
        }
        
        if (!file && data.cover.base64) {
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
            try {
              const dt = new DataTransfer();
              dt.items.add(file);
              coverInput.files = dt.files;
              coverInput.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (dtErr) {
              log('DataTransfer 设置异常: ' + dtErr.message);
            }
            const cInputFiberKey = Object.keys(coverInput).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
            const cInputFiber = coverInput[cInputFiberKey];
            if (cInputFiber && cInputFiber.memoizedProps && typeof cInputFiber.memoizedProps.onChange === 'function') {
              cInputFiber.memoizedProps.onChange({
                target: coverInput,
                currentTarget: coverInput
              });
              coverLoaded = true;
              log('已触发封面图加载与 Cropper 初始化');
            }
          }
        }
      } catch (e) {
        log('封面图加载异常: ' + e.message);
      }
      
      // 等待封面上传和裁剪器渲染完毕并确认
      log('等待封面上传与 Cropper 准备就绪...');
      for (let i = 0; i < 20; i++) {
        await delay(500);
        const cropConfirmBtns = Array.from(document.querySelectorAll('.t-dialog button, .cdc-modal button, .t-popup button, button')).filter(b => {
          const text = b.innerText.trim();
          return text === '确定' || text === '确认' || text === '完成' || text === '裁剪并使用';
        });
        if (cropConfirmBtns.length > 0) {
          log('检测到裁剪确认按钮，模拟点击确认...');
          const targetCropBtn = cropConfirmBtns[cropConfirmBtns.length - 1];
          targetCropBtn.click();
          window.__doudou_cover_status = 'uploaded';
          await randomDelay(500, 800);
          break;
        }
      }

      await randomDelay(400, 700);

      // 保持发布抽屉打开，原样保留现场供人工核对并最终发布，绝不收起抽屉
      log('封面图绑定完成，原样保留发布设置抽屉现场（保持抽屉打开），供人工核验与提交发布...');
      await randomDelay(300, 500);
    }
  }

  // 5. 显式保存草稿
  log('正在尝试保存草稿...');
  const saveDraftBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '存草稿' && !b.classList.contains('is-disabled'));
  if (saveDraftBtn) {
    saveDraftBtn.click();
    log('已点击「存草稿」按钮');
    await randomDelay(800, 1500);
  }

  const currentUrl = window.location.href;
  const draftIdMatch = currentUrl.match(/articleId=(\\d+)/) || currentUrl.match(/draftId=(\\d+)/) || currentUrl.match(/\\/(\\d+)/);
  const draftId = draftIdMatch ? draftIdMatch[1] : null;

  // 6. 完成发布就绪（直接判定完成，原样保留页面现场供人工发布，严禁调用 close_page）
  log('🎉 腾讯云开发者社区文章内容填入完毕，直接判定发布就绪！');

  return {
    success: true,
    isReady: true,
    status: 'ready',
    draftId,
    url: currentUrl,
    title: data.title,
    coverState: data.cover ? '已配置' : '无',
    logs
  };
}`;
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
