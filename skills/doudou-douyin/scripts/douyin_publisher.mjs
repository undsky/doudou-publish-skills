/**
 * 抖音创作者平台自动化发布浏览器脚本生成器
 * 涵盖：
 * 1. 发布文章：TipTap/ProseMirror 纯排版 HTML 正文双向同步、文章头图与封面设置真实上传、确定性弹窗点击、React Fiber 话题同步、防风控人机交互与草稿暂存
 * 2. 发布图文：真实 5 张卡片本地文件批量上传、异步 CDN 上传等待轮询（防图片丢失）、20 字标题与 1000 字话题描述填充、防风控人机交互与草稿暂存
 */

/**
 * 构建放弃未发布旧草稿的快速清理脚本
 * @returns {string}
 */
export function buildDiscardDraftScript() {
  return `(async () => {
  const giveUpBtn = Array.from(document.querySelectorAll('button, span, a, div')).find(el => el.innerText?.trim() === '放弃');
  if (giveUpBtn) {
    giveUpBtn.click();
    await new Promise(r => setTimeout(r, 800));
    return { discarded: true };
  }
  return { discarded: false };
})()`;
}

/**
 * 构建文章发布（长文草稿）浏览器注入脚本
 * @param {object} meta 解析后的完整元数据
 * @returns {string} 可在浏览器上下文运行的立即执行异步函数
 */
export function buildArticleBrowserScript(meta) {
  return `(async () => {
  const meta = {
    title: ${JSON.stringify(meta.articleTitle)},
    author: ${JSON.stringify(meta.author)},
    summary: ${JSON.stringify(meta.articleSummary)},
    tags: ${JSON.stringify(meta.tags)},
    htmlContent: ${JSON.stringify(meta.articleHtml.htmlContent)},
    coverBase64: ${JSON.stringify(meta.cover?.base64 || '')}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  console.log('[doudou-douyin] 开始注入文章数据...');

  const setInputValue = (input, value) => {
    if (!input) return;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // 1. 填写文章标题（严格限制 <= 30 字）
  const cleanTitle = meta.title.length > 30 ? meta.title.substring(0, 27) + '...' : meta.title;
  const titleInput = document.querySelector('input[placeholder*="请输入文章标题"]');
  if (titleInput) {
    titleInput.focus();
    await sleep(250);
    setInputValue(titleInput, cleanTitle);
    titleInput.blur();
  }
  await sleep(350);

  // 2. 填写文章内容摘要（严格限制 <= 30 字）
  const cleanSummary = meta.summary.length > 30 ? meta.summary.substring(0, 27) + '...' : meta.summary;
  const summaryInput = document.querySelector('input[placeholder*="添加内容摘要"]');
  if (summaryInput) {
    summaryInput.focus();
    await sleep(250);
    setInputValue(summaryInput, cleanSummary);
    summaryInput.blur();
  }
  await sleep(350);

  // 3. 注入富文本正文并同步 ProseMirror & TipTap 状态
  const pm = document.querySelector('.tiptap.ProseMirror') || document.querySelector('[contenteditable="true"]');
  if (pm) {
    pm.focus();
    await sleep(300);
    const editor = pm.editor;
    if (editor) {
      if (editor.commands && editor.commands.setContent) {
        editor.commands.setContent(meta.htmlContent, true);
      }
      if (editor.options && typeof editor.options.onUpdate === 'function') {
        editor.options.onUpdate({ editor });
      }
      if (typeof editor.emit === 'function') {
        editor.emit('update', { editor });
      }
    }
  }
  await sleep(600);

  // 4. 辅助函数：构造真实的 File 对象
  const makeFile = (base64Str, name = 'cover.png') => {
    const raw = atob(base64Str.replace(/^data:[^;]+;base64,/, ''));
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    return new File([blob], name, { type: 'image/png' });
  };

  // 5. 真实上传文章头图 (Head Cover) 并自动同步主封面
  if (meta.coverBase64) {
    try {
      let headInput = null;
      const origCreate = document.createElement;
      document.createElement = function(tag, opt) {
        const el = origCreate.call(document, tag, opt);
        if (tag && tag.toLowerCase() === 'input') {
          el.click = function() {}; // 阻止唤起操作系统原生文件选择器
          headInput = el;
        }
        return el;
      };

      const headBtn = document.querySelector('.addIcon-Whrj6F') || document.querySelector('.mycard-info-Wx40e4') || document.querySelector('.content-upload-go676U');
      if (headBtn) {
        headBtn.click();
        await sleep(300);
        document.createElement = origCreate;

        if (headInput) {
          const file = makeFile(meta.coverBase64, 'head-cover-2.35x1.png');
          const dt = new DataTransfer();
          dt.items.add(file);
          headInput.files = dt.files;
          headInput.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(2000);

          const completeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '确定' || b.innerText.trim() === '完成');
          if (completeBtn && !completeBtn.disabled) {
            completeBtn.click();
            await sleep(1000);
          }
        }
      }
    } catch (e) {
      console.warn('[doudou-douyin] 头图上传异常:', e);
    }
  }
  await sleep(400);

  // 6. 话题标签设置（基于 React Fiber 状态双向同步）
  try {
    const topicSelector = document.querySelector('[class*="topicSelector"]');
    if (topicSelector) {
      const fiberKey = Object.keys(topicSelector).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (fiberKey) {
        let curr = topicSelector[fiberKey];
        while (curr) {
          if (curr.memoizedProps?.item && typeof curr.memoizedProps?.setItem === 'function') {
            const setItem = curr.memoizedProps.setItem;
            const topicList = (meta.tags || []).slice(0, 5).map(t => ({ hashtag_name: t }));
            setItem(prev => ({ ...prev, long_article_topic: topicList }));
            break;
          }
          curr = curr.return;
        }
      }
    }
  } catch (e) {
    console.warn('[doudou-douyin] 话题标签设置异常:', e);
  }
  await sleep(400);

  // 7. 视口平滑滚动模拟真实阅读检查
  window.scrollTo({ top: 500, behavior: 'smooth' });
  await sleep(600);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 8. 点击「暂存离开」保存草稿
  const draftBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '暂存离开');
  if (!draftBtn) {
    return { success: false, error: '未找到「暂存离开」按钮' };
  }

  draftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  draftBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  draftBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(400);
  draftBtn.click();
  await sleep(2500);

  return {
    success: true,
    title: cleanTitle,
    summary: cleanSummary,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}

/**
 * 构建图文发布（编辑表单）浏览器注入脚本
 * 包含异步 CDN 上传等待轮询逻辑，防止图片上传被提前截断
 * @param {object} meta 
 * @returns {string}
 */
export function buildImagePostEditorScript(meta) {
  return `(async () => {
  const meta = {
    title: ${JSON.stringify(meta.imagePostTitle)},
    author: ${JSON.stringify(meta.author)},
    description: ${JSON.stringify(meta.imagePostDesc)}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  console.log('[doudou-douyin] 开始轮询等待图片 CDN 切片上传完成...');

  // 1. 异步等待图片上传完成（轮询最多 35 秒）
  let uploadFinished = false;
  for (let i = 0; i < 35; i++) {
    const cancelUpload = Array.from(document.querySelectorAll('*')).find(el => el.innerText?.trim() === '取消上传');
    const addedEl = Array.from(document.querySelectorAll('*')).find(el => el.innerText && el.innerText.includes('已添加') && el.innerText.includes('图片'));
    const phoneImgs = document.querySelectorAll('.phone-screen-emLY2d img, [class*="phone-screen"] img');

    if ((!cancelUpload && phoneImgs.length > 0) || addedEl) {
      uploadFinished = true;
      console.log(\`[doudou-douyin] 图片上传完成，耗时 \${i + 1} 秒\`);
      break;
    }
    await sleep(1000);
  }

  if (!uploadFinished) {
    console.warn('[doudou-douyin] 图片上传可能仍在进行中，继续执行填充...');
  }
  await sleep(600);

  // 2. 填写标题（严格限制 <= 20 字）
  const cleanTitle = meta.title.length > 20 ? meta.title.substring(0, 17) + '...' : meta.title;
  const titleInput = document.querySelector('input[placeholder*="添加作品标题"]') || document.querySelector('input[placeholder*="标题"]');
  if (titleInput) {
    titleInput.focus();
    await sleep(250);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (setter) {
      setter.call(titleInput, cleanTitle);
    } else {
      titleInput.value = cleanTitle;
    }
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    titleInput.blur();
  }
  await sleep(400);

  // 3. 填写描述正文与话题（严格限制 <= 1000 字）
  const cleanDesc = meta.description.length > 1000 ? meta.description.substring(0, 990) + '...' : meta.description;
  const descEl = document.querySelector('.zone-container.editor-kit-container, [contenteditable="true"]');
  if (descEl) {
    descEl.focus();
    await sleep(300);

    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(descEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    let docExecOk = false;
    try {
      docExecOk = document.execCommand('insertText', false, cleanDesc);
    } catch (e) {
      console.warn('[doudou-douyin] execCommand error:', e);
    }

    if (!docExecOk || descEl.innerText.trim().length < 10) {
      const fiberKey = Object.keys(descEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      let curr = descEl[fiberKey];
      while (curr) {
        if (curr.memoizedProps?.editor && typeof curr.memoizedProps?.editor?.setContent === 'function') {
          curr.memoizedProps.editor.setContent(cleanDesc);
          break;
        }
        curr = curr.return;
      }
    }
  }
  await sleep(600);

  // 4. 视口平滑滚动模拟真实检查
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await sleep(400);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(300);

  // 5. 点击「暂存离开」保存草稿
  const draftBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '暂存离开');
  if (!draftBtn) {
    return { success: false, error: '未找到「暂存离开」按钮' };
  }

  draftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  draftBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  draftBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(400);
  draftBtn.click();
  await sleep(2500);

  return {
    success: true,
    title: cleanTitle,
    uploadFinished,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}
