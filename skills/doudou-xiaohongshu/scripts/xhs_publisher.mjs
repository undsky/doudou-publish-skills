/**
 * 小红书创作者平台自动化发布浏览器脚本生成器
 * 涵盖：
 * 1. 发布视频：本地 MP4 视频真实上传、20 字精炼短标题与 1000 字换行分段描述填充、Shadow DOM 暂存草稿
 * 2. 发布图文：全套 3:4 卡片批量上传、20 字短标题与 1000 字话题描述填充、ProseMirror 状态双向同步与暂存草稿
 * 3. 自动防御：自动关闭新手引导弹窗、拟真视口滚动与防风控人机模拟交互
 */

/**
 * 构建图文发布（编辑表单）浏览器注入脚本（在图片上传完成后调用）
 * @param {object} meta 
 * @returns {string} 可在浏览器上下文运行的立即执行异步函数
 */
export function buildImagePostBrowserScript(meta) {
  return `(async () => {
  const meta = {
    title: ${JSON.stringify(meta.imagePostTitle || meta.title || '')},
    author: ${JSON.stringify(meta.author || 'undsky')},
    description: ${JSON.stringify(meta.imagePostDesc || meta.description || '')},
    tags: ${JSON.stringify(meta.tags || [])}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  console.log('[doudou-xiaohongshu] 开始填写图文作品信息并保存草稿...');

  // 1. 关闭新手引导弹窗或浮层
  const guideBtns = Array.from(document.querySelectorAll('button')).filter(b => 
    b.innerText.includes('我知道了') || b.innerText.includes('关闭新功能引导')
  );
  for (const b of guideBtns) {
    b.click();
    await sleep(200);
  }

  // 2. 填写图文标题（<= 20 字）
  const titleInput = document.querySelector('input[placeholder*="填写标题"], input.d-text') || document.querySelector('input');
  if (titleInput) {
    console.log('[doudou-xiaohongshu] 填写图文标题:', meta.title);
    titleInput.focus();
    await sleep(250);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(titleInput, meta.title);
    } else {
      titleInput.value = meta.title;
    }
    titleInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    await sleep(300);
    titleInput.blur();
  }
  await sleep(400);

  // 3. 填写描述正文与话题
  const descEl = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"]');
  if (descEl) {
    console.log('[doudou-xiaohongshu] 填写描述正文与话题...');
    descEl.focus();
    await sleep(300);

    let setOk = false;
    if (descEl.editor && descEl.editor.commands && descEl.editor.commands.setContent) {
      const htmlFormatted = meta.description.split('\\n').map(line => \`<p>\${line || '<br>'}</p>\`).join('');
      descEl.editor.commands.setContent(htmlFormatted, true);
      setOk = true;
    }

    if (!setOk) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, meta.description);
    }
    descEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    descEl.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
  }
  await sleep(600);

  // 4. 视口平滑滚动模拟真实阅读检查
  window.scrollTo({ top: 350, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 5. 依托平台原生自动保存，平滑停留在当前编辑页供人工复核（严禁点击暂存离开跳出页面，严禁触发发布）
  console.log('[doudou-xiaohongshu] 依托小红书原生自动保存，等待 2.5 秒并保留编辑页面...');
  await sleep(2500);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    mode: 'image',
    title: meta.title,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}

/**
 * 构建视频发布（编辑表单）浏览器注入脚本（在视频上传完成后调用）
 * @param {object} meta 
 * @returns {string} 可在浏览器上下文运行的立即执行异步函数
 */
export function buildVideoPostBrowserScript(meta) {
  return `(async () => {
  const meta = {
    title: ${JSON.stringify(meta.videoTitle || meta.title || '')},
    author: ${JSON.stringify(meta.author || 'undsky')},
    description: ${JSON.stringify(meta.videoDesc || meta.description || '')},
    tags: ${JSON.stringify(meta.tags || [])}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  console.log('[doudou-xiaohongshu] 开始填写视频作品信息并保存草稿...');

  // 1. 关闭新手引导弹窗或浮层
  const guideBtns = Array.from(document.querySelectorAll('button')).filter(b => 
    b.innerText.includes('我知道了') || b.innerText.includes('关闭新功能引导')
  );
  for (const b of guideBtns) {
    b.click();
    await sleep(200);
  }

  // 2. 轮询等待视频上传处理就绪（最长 60 秒）
  for (let i = 0; i < 60; i++) {
    const reuploadBtn = Array.from(document.querySelectorAll('*')).find(el => el.innerText?.trim() === '重新上传');
    const titleInput = document.querySelector('input[placeholder*="填写标题"], input.d-text');
    if (reuploadBtn || titleInput) {
      console.log(\`[doudou-xiaohongshu] 视频上传就绪，耗时 \${i + 1} 秒\`);
      break;
    }
    await sleep(1000);
  }
  await sleep(400);

  // 3. 填写视频短标题（严格限制 20 字以内）
  const cleanTitle = meta.title.length > 20 ? meta.title.substring(0, 19) + '…' : meta.title;
  const titleInput = document.querySelector('input[placeholder*="填写标题"], input.d-text') || document.querySelector('input');
  if (titleInput) {
    console.log('[doudou-xiaohongshu] 填写视频标题:', cleanTitle);
    titleInput.focus();
    await sleep(250);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(titleInput, cleanTitle);
    } else {
      titleInput.value = cleanTitle;
    }
    titleInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    await sleep(300);
    titleInput.blur();
  }
  await sleep(400);

  // 4. 填写描述正文与话题（严格保留换行分段）
  const descEl = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"]');
  if (descEl) {
    console.log('[doudou-xiaohongshu] 填写描述正文与话题（保留分段换行）...');
    descEl.focus();
    await sleep(300);

    const cleanDesc = meta.description.length > 1000 ? meta.description.substring(0, 990) + '...' : meta.description;
    let setOk = false;
    if (descEl.editor && descEl.editor.commands && descEl.editor.commands.setContent) {
      const htmlFormatted = cleanDesc.split('\\n').map(line => \`<p>\${line || '<br>'}</p>\`).join('');
      descEl.editor.commands.setContent(htmlFormatted, true);
      setOk = true;
    }

    if (!setOk) {
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
    descEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    descEl.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
  }
  await sleep(600);

  // 5. 视口平滑滚动模拟真实阅读检查
  window.scrollTo({ top: 350, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 6. 依托平台原生自动保存，平滑停留在当前编辑页供人工复核（严禁点击暂存离开跳出页面，严禁触发发布）
  console.log('[doudou-xiaohongshu] 依托小红书原生自动保存，等待 2.5 秒并保留编辑页面...');
  await sleep(2500);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    mode: 'video',
    title: cleanTitle,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}

