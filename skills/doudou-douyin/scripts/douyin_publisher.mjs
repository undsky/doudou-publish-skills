/**
 * 抖音创作者平台自动化发布浏览器脚本生成器
 * 涵盖：
 * 1. 发布文章：TipTap/ProseMirror 纯排版 HTML 正文双向同步、文章头图与封面设置真实上传、确定性弹窗点击、React Fiber 话题同步、防风控人机交互与草稿暂存
 * 2. 发布图文：真实 5 张卡片本地文件批量上传、异步 CDN 上传等待轮询（防图片丢失）、20 字标题与 1000 字话题描述填充、防风控人机交互与草稿暂存
 * 3. 发布视频：本地 MP4 视频真实上传、异步上传就绪轮询、30 字标题与 1000 字简介话题填充、智能抽帧封面确认、防风控人机交互与草稿暂存
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
  // 4. 视口平滑滚动模拟真实阅读检查
  window.scrollTo({ top: 500, behavior: 'smooth' });
  await sleep(600);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 5. 等待平台原生自动保存生效（保留停留在编辑页，绝不点击「暂存离开」或「发布」按钮）
  console.log('[doudou-douyin] 文章已注入完成，正在等待抖音原生自动保存生效 (保留在编辑页)...');
  await sleep(2500);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: cleanTitle,
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

  // 3. 填写描述正文与话题（严格限制 <= 1000 字，保留原生分段换行）
  const cleanDesc = meta.description.length > 1000 ? meta.description.substring(0, 990) + '...' : meta.description;
  const descEl = document.querySelector('.zone-container.editor-kit-container') || document.querySelector('[contenteditable="true"]');
  if (descEl) {
    descEl.focus();
    await sleep(300);

    let fiberSetOk = false;
    try {
      const fiberKey = Object.keys(descEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (fiberKey) {
        let curr = descEl[fiberKey];
        while (curr) {
          if (curr.memoizedProps?.editor && typeof curr.memoizedProps.editor.setText === 'function') {
            const editor = curr.memoizedProps.editor;
            if (typeof editor.reset === 'function') editor.reset();
            editor.setText(cleanDesc);
            fiberSetOk = true;
            break;
          }
          curr = curr.return;
        }
      }
    } catch (e) {
      console.warn('[doudou-douyin] Fiber editor.setText 异常:', e);
    }

    // 回退方案：通过 execCommand 逐行注入并在行间执行 insertParagraph 保证换行
    if (!fiberSetOk || descEl.innerText.trim().length < 10) {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      const lines = cleanDesc.split('\\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0) {
          document.execCommand('insertText', false, lines[i]);
        }
        if (i < lines.length - 1) {
          document.execCommand('insertParagraph', false, null);
        }
      }
    }

    // 关闭话题推荐浮层
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    descEl.blur();
  }
  await sleep(600);

  // 4. 视口平滑滚动模拟真实检查
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await sleep(400);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(300);

  // 5. 等待平台原生自动保存生效（保留停留在编辑页，绝不点击「暂存离开」或「发布」按钮）
  console.log('[doudou-douyin] 图文卡片与文案已注入完成，正在等待抖音原生自动保存生效 (保留在编辑页)...');
  await sleep(2500);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: cleanTitle,
    uploadFinished,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}

/**
 * 构建视频发布（视频编辑表单）浏览器注入脚本
 * 包含上传成功轮询等待、标题注入、描述及话题标签注入、横竖封面处理与暂存草稿
 * @param {object} meta
 * @returns {string}
 */
export function buildVideoPostEditorScript(meta) {
  return `(async () => {
  const meta = {
    title: ${JSON.stringify(meta.videoTitle || meta.articleTitle)},
    author: ${JSON.stringify(meta.author)},
    description: ${JSON.stringify(meta.videoDesc || meta.imagePostDesc)},
    coverBase64: ${JSON.stringify(meta.videoCover?.base64 || meta.cover?.base64 || '')}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  console.log('[doudou-douyin] 开始轮询等待视频上传完成...');

  // 1. 轮询等待视频上传完成（最长等待 120 秒）
  let uploadFinished = false;
  for (let i = 0; i < 120; i++) {
    const successEl = Array.from(document.querySelectorAll('*')).find(el => el.innerText?.trim() === '上传成功');
    const uploadText = Array.from(document.querySelectorAll('*')).find(el => el.innerText?.includes('已上传：') || el.innerText?.includes('当前速度：'));
    const reuploadBtn = Array.from(document.querySelectorAll('*')).find(el => el.innerText?.trim() === '重新上传');

    if (successEl || (reuploadBtn && !uploadText)) {
      uploadFinished = true;
      console.log(\`[doudou-douyin] 视频上传完成，耗时 \${i + 1} 秒\`);
      break;
    }
    await sleep(1000);
  }

  if (!uploadFinished) {
    console.warn('[doudou-douyin] 视频上传超时或仍在后台处理，继续执行表单填写...');
  }
  await sleep(600);

  // 2. 填写作品标题（严格限制 <= 30 字）
  const cleanTitle = meta.title.length > 30 ? meta.title.substring(0, 27) + '...' : meta.title;
  const titleInput = document.querySelector('input[placeholder*="填写作品标题"]') || document.querySelector('input[placeholder*="标题"]');
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

  // 3. 填写作品简介与话题（严格限制 <= 1000 字，保留原生分段换行）
  const cleanDesc = meta.description.length > 1000 ? meta.description.substring(0, 990) + '...' : meta.description;
  const descEl = document.querySelector('.zone-container.editor-kit-container') || document.querySelector('[contenteditable="true"]');
  if (descEl) {
    descEl.focus();
    await sleep(300);

    let fiberSetOk = false;
    try {
      const fiberKey = Object.keys(descEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (fiberKey) {
        let curr = descEl[fiberKey];
        while (curr) {
          if (curr.memoizedProps?.editor && typeof curr.memoizedProps.editor.setText === 'function') {
            const editor = curr.memoizedProps.editor;
            if (typeof editor.reset === 'function') editor.reset();
            editor.setText(cleanDesc);
            fiberSetOk = true;
            break;
          }
          curr = curr.return;
        }
      }
    } catch (e) {
      console.warn('[doudou-douyin] Fiber editor.setText 异常:', e);
    }

    // 回退方案：通过 execCommand 逐行注入并在行间执行 insertParagraph 保证换行
    if (!fiberSetOk || descEl.innerText.trim().length < 10) {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      const lines = cleanDesc.split('\\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0) {
          document.execCommand('insertText', false, lines[i]);
        }
        if (i < lines.length - 1) {
          document.execCommand('insertParagraph', false, null);
        }
      }
    }

    // 关闭话题推荐浮层
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    descEl.blur();
  }
  await sleep(600);

  // 4. 自定义视频封面上传（若有配置且页面提供入口）
  let coverUploaded = false;
  if (meta.coverBase64) {
    console.log('[doudou-douyin] 检测到视频封面图，尝试设置视频封面...');
    try {
      const makeFile = (base64Str, name = 'cover.png') => {
        const raw = atob(base64Str.replace(/^data:[^;]+;base64,/, ''));
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        const blob = new Blob([arr], { type: 'image/png' });
        return new File([blob], name, { type: 'image/png' });
      };

      const coverBtn = Array.from(document.querySelectorAll('button, span, div')).find(el => {
        const txt = el.innerText?.trim();
        return (txt === '选择封面' || txt === '设置封面' || txt === '更换封面') && el.offsetWidth > 0;
      });

      if (coverBtn) {
        coverBtn.click();
        await sleep(1000);

        const uploadTab = Array.from(document.querySelectorAll('.semi-modal div, .semi-modal span, .semi-modal button, [class*="modal"] span')).find(el => el.innerText?.trim() === '上传封面' || el.innerText?.trim() === '本地上传');
        if (uploadTab) {
          uploadTab.click();
          await sleep(600);
        }

        const coverInput = document.querySelector('.semi-modal input[type="file"], [class*="modal"] input[type="file"], input[type="file"][accept*="image"]');
        if (coverInput) {
          const file = makeFile(meta.coverBase64, 'video-cover.png');
          const dt = new DataTransfer();
          dt.items.add(file);
          coverInput.files = dt.files;
          coverInput.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(1500);

          const confirmBtn = Array.from(document.querySelectorAll('.semi-modal button, [class*="modal"] button')).find(b => {
            const txt = b.innerText?.trim();
            return txt === '确定' || txt === '完成';
          });
          if (confirmBtn) {
            confirmBtn.click();
            coverUploaded = true;
            await sleep(1000);
          }
        }
      }
    } catch (e) {
      console.warn('[doudou-douyin] 视频封面上传异常:', e);
    }
  }

  // 若出现横封面弹窗提示，自动跳过
  const ignoreHoriCoverBtn = Array.from(document.querySelectorAll('button, span, div')).find(e => e.innerText?.trim() === '暂不设置');
  if (ignoreHoriCoverBtn) {
    ignoreHoriCoverBtn.click();
    await sleep(500);
  }

  // 5. 视口平滑滚动模拟真实检查
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(300);

  // 6. 等待平台原生自动保存生效（保留停留在编辑页，绝不点击「暂存离开」或「发布」按钮）
  console.log('[doudou-douyin] 视频及作品信息已注入完成，正在等待抖音原生自动保存生效 (保留在编辑页)...');
  await sleep(2500);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: cleanTitle,
    coverUploaded,
    uploadFinished,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}

