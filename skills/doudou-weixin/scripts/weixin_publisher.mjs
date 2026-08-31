import fs from 'node:fs';
import path from 'node:path';
import { parseAllAssets } from './parser.mjs';

/**
 * 生成在文章编辑器页面（pageId）执行的自包含脚本
 * 严格按照 doudou-markdown-skill:L90-L97 规约绑定 2.35:1 真实主封面，且不污染正文
 * @param {object} meta 
 * @returns {string}
 */
export function buildArticleBrowserScript(meta) {
  const payload = {
    title: meta.title,
    author: meta.author || '豆豆',
    summary: meta.summary,
    htmlContent: meta.articleHtml.htmlContent,
    coverFileName: meta.cover?.fileName || 'cover-main-2.35x1.png'
  };

  return `(async () => {
  const meta = ${JSON.stringify(payload)};

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.random() * 200));

  console.log('[doudou-weixin] 开始拟真人机发布文章草稿...');

  // 1. 设置作者
  const authorInput = document.querySelector('#author');
  if (authorInput) {
    authorInput.focus();
    await sleep(200);
    authorInput.value = meta.author;
    authorInput.dispatchEvent(new Event('input', { bubbles: true }));
    authorInput.dispatchEvent(new Event('change', { bubbles: true }));
    authorInput.blur();
  }
  await sleep(300);

  // 2. 设置摘要（微信公众号限制 120 字以内）
  const digestInput = document.querySelector('#js_description');
  if (digestInput) {
    digestInput.focus();
    await sleep(200);
    digestInput.value = meta.summary;
    digestInput.dispatchEvent(new Event('input', { bubbles: true }));
    digestInput.dispatchEvent(new Event('change', { bubbles: true }));
    digestInput.blur();
  }
  await sleep(300);

  // 3. 拟真输入标题
  const titleHidden = document.querySelector('#title');
  if (titleHidden) {
    titleHidden.value = meta.title;
    titleHidden.dispatchEvent(new Event('input', { bubbles: true }));
    titleHidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const titlePm = document.querySelector('.title-editor__input .ProseMirror') || Array.from(document.querySelectorAll('.ProseMirror'))[0];
  if (titlePm) {
    titlePm.focus();
    await sleep(300);
    titlePm.innerHTML = '<p>' + meta.title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    titlePm.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await sleep(500);

  // 4. 拟真注入纯净正文排版 HTML（绝不污染正文末尾）
  const bodyPm = document.querySelector('.rich_media_content .ProseMirror') || Array.from(document.querySelectorAll('.ProseMirror')).find(el => !el.closest('.title-editor__input'));
  if (bodyPm) {
    bodyPm.focus();
    await sleep(300);

    let pasteOk = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/html', meta.htmlContent);
      dt.setData('text/plain', meta.summary);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      bodyPm.dispatchEvent(pasteEvent);
      pasteOk = true;
    } catch (e) {
      console.warn('[doudou-weixin] paste 事件派发异常:', e);
    }

    if (!pasteOk || bodyPm.innerText.trim().length < 100) {
      bodyPm.innerHTML = meta.htmlContent;
      bodyPm.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  await sleep(1200);

  // 5. 模拟自然视口滚动检查排版
  window.scrollTo({ top: 380, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 6. 拟真悬停并点击「保存为草稿」
  const submitBtn = document.querySelector('#js_submit button') || document.querySelector('#js_submit') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '保存为草稿');
  if (!submitBtn) {
    return { success: false, error: '未找到「保存为草稿」按钮' };
  }

  submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  submitBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  submitBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(400);
  submitBtn.click();

  // 7. 等待保存反馈并获取草稿结果
  await sleep(2500);

  const finalUrl = location.href;
  const matchDraft = finalUrl.match(/appmsgid=(\\d+)/);
  const appmsgid = matchDraft ? matchDraft[1] : null;
  const isSaved = document.body.innerText.includes('已保存') || !!appmsgid;

  return {
    success: isSaved,
    type: 'article',
    appmsgid,
    title: meta.title,
    author: meta.author,
    url: finalUrl,
    timestamp: Date.now()
  };
})()`;
}

/**
 * 生成在贴图编辑器页面（createType=8）准备上传组件的脚本
 * @returns {string}
 */
export function buildStickerPrepareScript() {
  return `(() => {
    const fileInput = document.querySelector('.image-selector input[type="file"]') || document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.style.display = 'block';
      fileInput.style.visibility = 'visible';
      fileInput.style.width = '100px';
      fileInput.style.height = '40px';
      fileInput.id = 'js_sticker_upload_input';
      return { ok: true, id: fileInput.id };
    }
    return { ok: false };
  })()`;
}

/**
 * 生成在贴图编辑器页面（createType=8）输入文案并保存草稿的脚本
 * @param {object} meta 
 * @returns {string}
 */
export function buildStickerBrowserScript(meta) {
  const payload = {
    title: meta.title.length > 20 ? meta.title.substring(0, 18) + '...' : meta.title,
    author: meta.author || '豆豆',
    description: meta.stickerDesc,
    stickerCount: meta.stickerImages ? meta.stickerImages.length : 0
  };

  return `(async () => {
  const meta = ${JSON.stringify(payload)};

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.random() * 200));

  console.log('[doudou-weixin] 开始拟真人机设置贴图文案并保存草稿...');

  // 1. 拟真输入贴图标题（选填，20 字以内）
  const titleHidden = document.querySelector('#title');
  if (titleHidden) {
    titleHidden.value = meta.title;
    titleHidden.dispatchEvent(new Event('input', { bubbles: true }));
    titleHidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const pms = Array.from(document.querySelectorAll('.ProseMirror'));
  const titlePm = pms[0];
  if (titlePm) {
    titlePm.focus();
    await sleep(250);
    titlePm.innerHTML = '<p>' + meta.title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    titlePm.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await sleep(400);

  // 2. 拟真输入贴图描述（正文，1000 字以内）
  const descPm = pms[1] || pms[pms.length - 1];
  if (descPm) {
    descPm.focus();
    await sleep(300);

    const paragraphs = meta.description.split('\\n\\n').map(p => '<p>' + p.replace(/\\n/g, '<br>') + '</p>').join('');
    descPm.innerHTML = paragraphs;
    descPm.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await sleep(600);

  // 3. 模拟自然视口滚动检查
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await sleep(400);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(300);

  // 4. 拟真悬停并点击「保存为草稿」
  const submitBtn = document.querySelector('#js_submit button') || document.querySelector('#js_submit') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '保存为草稿');
  if (!submitBtn) {
    return { success: false, error: '未找到「保存为草稿」按钮' };
  }

  submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  submitBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  submitBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(400);
  submitBtn.click();

  // 5. 等待保存反馈并获取草稿结果
  await sleep(2500);

  const finalUrl = location.href;
  const matchDraft = finalUrl.match(/appmsgid=(\\d+)/);
  const appmsgid = matchDraft ? matchDraft[1] : null;
  const isSaved = document.body.innerText.includes('已保存') || !!appmsgid;

  return {
    success: isSaved,
    type: 'sticker',
    appmsgid,
    title: meta.title,
    cardCount: meta.stickerCount,
    url: finalUrl,
    timestamp: Date.now()
  };
})()`;
}

// 命令行运行支持
if (process.argv[1] && process.argv[1].endsWith('weixin_publisher.mjs')) {
  const targetFile = process.argv[2] || '/Users/jyx/project/undsky/mds/AICoding/ddagent.md';
  const meta = parseAllAssets(targetFile);
  console.log(`[weixin_publisher] 生成针对: ${meta.title} 的发布脚本`);
  console.log(`- 封面文件: ${meta.cover?.fileName}`);
  console.log(`- 文章脚本长度: ${buildArticleBrowserScript(meta).length} 字符`);
  console.log(`- 贴图脚本长度: ${buildStickerBrowserScript(meta).length} 字符`);
}
