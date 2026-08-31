/**
 * 小红书创作者平台自动化发布浏览器脚本生成器
 * 涵盖：
 * 1. 发布文章（长文专栏）：TipTap/ProseMirror 纯排版 HTML 正文双向同步、一键排版与模板步进、发布设置注入、防风控人机交互与草稿暂存
 * 2. 发布图文（3:4 社交卡片集）：20 字精炼标题与 1000 字话题描述填充、Shadow DOM (<xhs-publish-btn>) 暂存离开按钮安全交互、防风控人机交互与草稿暂存
 */

/**
 * 构建文章发布（长文草稿）浏览器注入脚本
 * @param {object} meta 解析后的完整元数据
 * @returns {string} 可在浏览器上下文运行的立即执行异步函数
 */
export function buildArticleBrowserScript(meta) {
  return `(async () => {
  const meta = {
    title: ${JSON.stringify(meta.articleTitle)},
    author: ${JSON.stringify(meta.author || 'undsky')},
    summary: ${JSON.stringify(meta.articleSummary || '')},
    tags: ${JSON.stringify(meta.tags || [])},
    htmlContent: ${JSON.stringify(meta.articleHtml?.htmlContent || '')},
    desc: ${JSON.stringify(meta.imagePostDesc || '')}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  console.log('[doudou-xiaohongshu] 开始执行小红书长文发布流程...');

  // 1. 若当前在写长文首页，点击「新的创作」进入编辑器
  const newBtn = document.querySelector('.new-btn') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('新的创作'));
  if (newBtn) {
    console.log('[doudou-xiaohongshu] 点击「新的创作」...');
    newBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    newBtn.click();
    await sleep(1500);
  }

  // 2. 填写长文标题（<= 64 字）
  const titleTextarea = document.querySelector('.rich-editor-title textarea, textarea[placeholder*="输入标题"]');
  if (titleTextarea) {
    console.log('[doudou-xiaohongshu] 填写长文标题:', meta.title);
    titleTextarea.focus();
    await sleep(250);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    if (setter) {
      setter.call(titleTextarea, meta.title);
    } else {
      titleTextarea.value = meta.title;
    }
    titleTextarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    titleTextarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    await sleep(300);
    titleTextarea.blur();
  }
  await sleep(400);

  // 3. 注入富文本正文并同步 TipTap / ProseMirror 状态
  const pm = document.querySelector('.tiptap.ProseMirror') || document.querySelector('[contenteditable="true"]');
  if (pm) {
    console.log('[doudou-xiaohongshu] 注入富文本正文...');
    pm.focus();
    await sleep(300);
    if (pm.editor) {
      if (pm.editor.commands && pm.editor.commands.setContent) {
        pm.editor.commands.setContent(meta.htmlContent, true);
      }
      if (pm.editor.options && typeof pm.editor.options.onUpdate === 'function') {
        pm.editor.options.onUpdate({ editor: pm.editor });
      }
      if (typeof pm.editor.emit === 'function') {
        pm.editor.emit('update', { editor: pm.editor });
      }
      // 触发一次微小插入，确保 Vue 响应式字数统计完全刷新
      if (pm.editor.commands && pm.editor.commands.insertContent) {
        pm.editor.commands.insertContent(' ');
      }
    }
  }
  await sleep(800);

  // 4. 模拟人工自上而下阅读检查
  window.scrollTo({ top: 400, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 5. 点击「一键排版」
  const nextBtn = document.querySelector('.next-btn') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('一键排版'));
  if (nextBtn) {
    console.log('[doudou-xiaohongshu] 点击「一键排版」...');
    nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    nextBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    nextBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(300);
    nextBtn.click();
    await sleep(2000);
  }

  // 6. 检查是否进入排版模板与封面设置页（Step 2），点击「下一步」
  const step2Submit = document.querySelector('button.submit') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('下一步'));
  if (step2Submit) {
    console.log('[doudou-xiaohongshu] 点击 Step 2「下一步」...');
    step2Submit.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    step2Submit.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    step2Submit.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(300);
    step2Submit.click();
    await sleep(2000);
  }

  // 7. 在 Step 3（发布设置页）填写描述正文与话题
  const step3Desc = document.querySelector('.tiptap.ProseMirror, textarea[placeholder*="填写"]');
  if (step3Desc) {
    console.log('[doudou-xiaohongshu] Step 3 注入描述与话题...');
    step3Desc.focus();
    await sleep(250);
    if (step3Desc.editor && step3Desc.editor.commands && step3Desc.editor.commands.setContent) {
      step3Desc.editor.commands.setContent(meta.desc.replace(/\\n/g, '<br>'), true);
    } else {
      document.execCommand('insertText', false, meta.desc);
    }
  }
  await sleep(500);

  // 8. 视口微滚模拟人工检查
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await sleep(400);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(300);

  // 9. 智能重试定位「暂存离开」按钮（兼顾 Step 2、Step 3 与 Web Component Shadow DOM）
  const findDraftButton = () => {
    // 优先从 Web Component shadowRoot 查找
    const webComp = document.querySelector('xhs-publish-btn');
    if (webComp && webComp._sr) {
      const btn = webComp._sr.querySelector('button.ce-btn.white') || Array.from(webComp._sr.querySelectorAll('button')).find(b => b.innerText.includes('暂存离开'));
      if (btn) return btn;
    }
    // 其次从主 DOM 查找
    const directBtn = document.querySelector('button.draft, button.save-btn');
    if (directBtn) return directBtn;
    return Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '暂存离开');
  };

  let draftBtn = findDraftButton();
  if (!draftBtn) {
    for (let retry = 0; retry < 10; retry++) {
      await sleep(500);
      draftBtn = findDraftButton();
      if (draftBtn) break;
    }
  }

  if (!draftBtn) {
    return { success: false, error: '未找到「暂存离开」按钮' };
  }

  console.log('[doudou-xiaohongshu] 悬停并点击「暂存离开」...');
  draftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  draftBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  draftBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(400);
  draftBtn.click();
  await sleep(2500);

  return {
    success: true,
    mode: 'article',
    title: meta.title,
    summary: meta.summary,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}

/**
 * 构建图文发布（编辑表单）浏览器注入脚本（在图片上传完成后调用）
 * @param {object} meta 
 * @returns {string}
 */
export function buildImagePostBrowserScript(meta) {
  return `(async () => {
  const meta = {
    title: ${JSON.stringify(meta.imagePostTitle)},
    author: ${JSON.stringify(meta.author || 'undsky')},
    description: ${JSON.stringify(meta.imagePostDesc || '')},
    tags: ${JSON.stringify(meta.tags || [])}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  console.log('[doudou-xiaohongshu] 开始填写图文作品信息并保存草稿...');

  // 1. 填写标题（<= 20 字）
  const titleInput = document.querySelector('input[placeholder*="填写标题"], input.d-text');
  if (titleInput) {
    console.log('[doudou-xiaohongshu] 填写图文标题:', meta.title);
    titleInput.focus();
    await sleep(250);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
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

  // 2. 填写描述正文与话题
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
      document.execCommand('insertText', false, meta.description);
    }
  }
  await sleep(600);

  // 3. 视口平滑滚动模拟真实阅读检查
  window.scrollTo({ top: 350, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 4. 定位 Shadow DOM 下的「暂存离开」按钮并点击
  const findDraftButton = () => {
    const webComp = document.querySelector('xhs-publish-btn');
    if (webComp && webComp._sr) {
      const btn = webComp._sr.querySelector('button.ce-btn.white') || Array.from(webComp._sr.querySelectorAll('button')).find(b => b.innerText.includes('暂存离开'));
      if (btn) return btn;
    }
    return Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '暂存离开');
  };

  let draftBtn = findDraftButton();
  if (!draftBtn) {
    for (let retry = 0; retry < 10; retry++) {
      await sleep(500);
      draftBtn = findDraftButton();
      if (draftBtn) break;
    }
  }

  if (!draftBtn) {
    return { success: false, error: '未找到「暂存离开」按钮' };
  }

  console.log('[doudou-xiaohongshu] 悬停并点击「暂存离开」...');
  draftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  draftBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  draftBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(400);
  draftBtn.click();
  await sleep(2500);

  return {
    success: true,
    mode: 'image',
    title: meta.title,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}
