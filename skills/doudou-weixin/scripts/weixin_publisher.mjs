import fs from 'node:fs';
import path from 'node:path';
import { parseAllAssets } from './parser.mjs';

/**
 * 生成在文章编辑器页面（pageId）执行的自包含脚本
 * 严格遵循 doudou-markdown-skill 规约：
 * 1. 从 doudou-markdown-skill:L116-L128 获取纯排版 HTML 并完整保留样式注入；
 * 2. 从 doudou-markdown-skill:L94-L101 获取 2.35:1 宽屏主封面并自动上传、裁切绑定为封面；
 * 3. 严格遵循真实人机交互与防风控规约，仅保存草稿。
 * @param {object} meta 
 * @returns {string}
 */
export function buildArticleBrowserScript(meta) {
  const payload = {
    title: meta.title,
    author: meta.author || 'undsky',
    summary: meta.summary,
    htmlContent: meta.articleHtml.htmlContent,
    hasCover: !!(meta.cover && meta.cover.hasCover && meta.cover.base64),
    coverBase64: meta.cover?.base64 || null,
    coverFileName: meta.cover?.fileName || 'cover-2.35x1.png',
    coverMimeType: meta.cover?.mimeType || 'image/jpeg'
  };

  return `async () => {
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

  // 4. 拟真注入纯排版 HTML 正文（严格遵循 gzh-design 与 doudou-markdown-skill 规范）
  const bodyPm = document.querySelector('.rich_media_content .ProseMirror') || Array.from(document.querySelectorAll('.ProseMirror')).find(el => !el.closest('.title-editor__input'));
  if (bodyPm) {
    bodyPm.focus();
    await sleep(200);

    // 先清空编辑器现有内容，避免重复堆叠或旧残留
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(bodyPm);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete', false, null);
    await sleep(250);

    let pasteDispatched = false;
    try {
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          getData: (type) => (type.includes('html') ? meta.htmlContent : meta.summary),
          types: ['text/html', 'text/plain'],
          items: [
            { type: 'text/html', getAsString: (cb) => cb(meta.htmlContent) },
            { type: 'text/plain', getAsString: (cb) => cb(meta.summary) }
          ]
        }
      });
      bodyPm.dispatchEvent(pasteEvent);
      pasteDispatched = true;
    } catch (e) {
      console.warn('[doudou-weixin] paste 事件派发异常:', e);
    }
    await sleep(600);

    // 保底校验：若 paste 事件未被 ProseMirror 接受，使用 insertHTML 注入并派发 input
    if (bodyPm.innerText.trim().length < 50 || !bodyPm.innerHTML.includes('section')) {
      document.execCommand('insertHTML', false, meta.htmlContent);
      bodyPm.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  await sleep(800);

  // 5. 自动上传与绑定 2.35:1 宽屏主封面（遵循 doudou-markdown-skill:L94-L101）
  if (meta.hasCover && meta.coverBase64) {
    try {
      console.log('[doudou-weixin] 开始上传并设置文章主封面...');
      
      // 5.1 展开图片库选择弹窗
      let dialog = document.querySelector('.weui-desktop-dialog_img-picker');
      if (!dialog || window.getComputedStyle(dialog.closest('.weui-desktop-dialog__wrp') || dialog).display === 'none') {
        const coverTrigger = document.querySelector('.js_imagedialog') || 
                             document.querySelector('.js_cover_btn_area') || 
                             document.querySelector('#js_cover_area');
        if (coverTrigger) {
          coverTrigger.click();
          await sleep(1000);
        }
      }
      dialog = document.querySelector('.weui-desktop-dialog_img-picker');

      if (dialog) {
        const fileInput = dialog.querySelector('input[type="file"]');
        if (fileInput) {
          // 5.2 构建 File 对象并派发上传
          const b64Data = meta.coverBase64.includes(',') ? meta.coverBase64.split(',')[1] : meta.coverBase64;
          const byteCharacters = atob(b64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: meta.coverMimeType });
          const file = new File([blob], meta.coverFileName, { type: meta.coverMimeType });

          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));

          console.log('[doudou-weixin] 封面图片已提交上传，等待 3.5 秒处理...');
          await sleep(3500);

          // 5.3 选中第一张图片（最新上传的封面）
          const firstItem = dialog.querySelector('.weui-desktop-img-picker__list .weui-desktop-img-picker__item') || 
                            dialog.querySelector('.weui-desktop-img-picker__item');
          if (firstItem) {
            firstItem.click();
            await sleep(600);
          }

          // 5.4 点击「下一步」进入裁切
          const nextBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.trim() === '下一步');
          if (nextBtn && !nextBtn.disabled && !nextBtn.className.includes('disabled')) {
            nextBtn.click();
            await sleep(1500);
          }

          // 5.5 点击「完成」/「确定」确认裁切并绑定封面
          const doneBtn = Array.from(document.querySelectorAll('.weui-desktop-dialog button')).find(b => b.innerText.trim() === '完成' || b.innerText.trim() === '确定');
          if (doneBtn && !doneBtn.disabled && !doneBtn.className.includes('disabled')) {
            doneBtn.click();
            await sleep(1000);
          }
          console.log('[doudou-weixin] 封面上传与裁切绑定完成！');
        }
      }
    } catch (coverErr) {
      console.warn('[doudou-weixin] 封面自动上传处理出现非阻塞异常:', coverErr);
    }
  }
  await sleep(600);

  // 6. 模拟自然视口滚动检查排版
  window.scrollTo({ top: 380, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 7. 拟真悬停并点击「保存为草稿」
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

  // 8. 等待保存反馈并获取草稿结果
  await sleep(3000);

  const finalUrl = location.href;
  const matchDraft = finalUrl.match(/appmsgid=(\\d+)/);
  const appmsgid = matchDraft ? matchDraft[1] : null;
  const isSaved = document.body.innerText.includes('已保存') || !!appmsgid;

  const coverArea = document.querySelector('#js_cover_area');
  const hasCoverSet = !!(coverArea && coverArea.querySelector('.select-cover__preview:not([style*="display: none"]), img, [style*="background-image"]'));

  return {
    success: isSaved,
    type: 'article',
    appmsgid,
    title: meta.title,
    author: meta.author,
    hasCoverSet,
    url: finalUrl,
    timestamp: Date.now()
  };
};`;
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

  return `async () => {
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
};`;
}

// 命令行运行支持
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('weixin_publisher.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node weixin_publisher.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const meta = parseAllAssets(targetFile);
  console.log(`[weixin_publisher] 生成针对: ${meta.title} 的发布脚本`);
  console.log(`- 封面文件: ${meta.cover?.fileName}`);
  console.log(`- 文章脚本长度: ${buildArticleBrowserScript(meta).length} 字符`);
  console.log(`- 贴图脚本长度: ${buildStickerBrowserScript(meta).length} 字符`);
}
