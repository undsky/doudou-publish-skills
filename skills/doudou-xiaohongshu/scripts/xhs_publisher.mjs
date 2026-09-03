/**
 * 小红书创作者平台自动化发布图文笔记浏览器脚本生成器
 * 涵盖：
 * 1. 20 字精炼标题与 1000 字话题描述填充
 * 2. 自动关闭新手引导与遮罩弹窗
 * 3. Shadow DOM (<xhs-publish-btn>) 暂存离开按钮安全交互
 * 4. 防风控人机交互与草稿暂存存证
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

  // 5. 定位 Shadow DOM 或主 DOM 下的「暂存离开」按钮并点击
  const findDraftButton = () => {
    const webComp = document.querySelector('xhs-publish-btn');
    if (webComp && webComp._sr) {
      const btn = webComp._sr.querySelector('button.ce-btn.white') || Array.from(webComp._sr.querySelectorAll('button')).find(b => b.innerText.includes('暂存离开'));
      if (btn) return btn;
    }
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
    mode: 'image',
    title: meta.title,
    url: location.href,
    timestamp: Date.now()
  };
})()`;
}
