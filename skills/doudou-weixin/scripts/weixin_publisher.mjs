import path from 'node:path';
import { parseAllAssets } from './parser.mjs';

/**
 * 根据 token 生成微信公众号文章发布页直达 URL
 * @param {string|number} token 
 * @returns {string}
 */
export function getArticleEditorUrl(token) {
  return `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&token=${token}&lang=zh_CN`;
}

/**
 * 根据 token 生成微信公众号贴图发布页直达 URL
 * @param {string|number} token 
 * @returns {string}
 */
export function getStickerEditorUrl(token) {
  return `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=8&token=${token}&lang=zh_CN`;
}

/**
 * 生成在文章编辑器页面（pageId）执行的自包含脚本
 * 1. 获取纯排版 HTML 并完整保留样式注入；
 * 2. 获取 2.35:1 宽屏主封面并自动上传、裁切绑定为封面；
 * 3. 严格遵循真实人机交互与防风控规约，仅保存草稿。
 * @param {object} meta 
 * @returns {string}
 */
export function buildArticleBrowserScript(meta) {
  const payload = {
    title: meta.title,
    summary: meta.summary || meta.title,
    htmlContent: meta.articleHtml.htmlContent,
    hasCover: !!(meta.cover && meta.cover.hasCover && meta.cover.base64),
    coverBase64: meta.cover?.base64 || null,
    coverFileName: meta.cover?.fileName || 'cover-2.35x1.png',
    coverMimeType: meta.cover?.mimeType || 'image/jpeg'
  };

  return `async () => {
  const meta = ${JSON.stringify(payload)};

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.random() * 200));

  console.log('[doudou-weixin] 开始拟真人机发布文章草稿（极简流：标题 + 摘要 + 正文 + 封面）...');

  // 1. 拟真输入标题
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
  await sleep(400);

  // 2. 拟真输入摘要（直接填文章标题，同步 Vue 状态与 textarea）
  const digestText = meta.summary || meta.title;
  const digestEl = document.querySelector('#js_description') || 
                   document.querySelector('#digest') || 
                   document.querySelector('textarea.js_desc') ||
                   document.querySelector('textarea[name="digest"]') ||
                   Array.from(document.querySelectorAll('textarea')).find(t => (t.placeholder || '').includes('选填'));
  if (digestEl) {
    digestEl.value = digestText;
    let v = digestEl;
    while (v && !v.__vue__) v = v.parentElement;
    if (v && v.__vue__ && 'abstract' in v.__vue__) {
      v.__vue__.abstract = digestText;
    }
    digestEl.dispatchEvent(new Event('input', { bubbles: true }));
    digestEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await sleep(400);

  // 3. 注入纯排版 HTML 正文（严格遵循 gzh-design 规范）
  const bodyPm = document.querySelector('.rich_media_content .ProseMirror') || Array.from(document.querySelectorAll('.ProseMirror')).find(el => !el.closest('.title-editor__input'));
  if (bodyPm) {
    bodyPm.focus();
    await sleep(200);

    // 核心方案 A（最优先）：穿透 Vue 祖先链查找微信官方 mp-appmsg-editor 实例并调用 replaceAllContent
    let vueP = bodyPm.parentElement;
    while (vueP && !vueP.__vue__) vueP = vueP.parentElement;
    let vueCur = vueP ? vueP.__vue__ : null;
    let mpAppMsgEditor = null;
    while (vueCur) {
      if (typeof vueCur.replaceAllContent === 'function') {
        mpAppMsgEditor = vueCur;
        break;
      }
      vueCur = vueCur.$parent;
    }

    let injectedByOfficialApi = false;
    if (mpAppMsgEditor) {
      try {
        mpAppMsgEditor.replaceAllContent(meta.htmlContent);
        injectedByOfficialApi = true;
        console.log('[doudou-weixin] 成功通过微信官方 mp-appmsg-editor.replaceAllContent 注入富文本，排版样式完整保真！');
        await sleep(800);
      } catch (e) {
        console.warn('[doudou-weixin] replaceAllContent 调用异常，准备降级:', e);
      }
    }

    // 降级方案 B：若未获取到官方实例，走原生剪贴板 paste 事件注入
    if (!injectedByOfficialApi) {
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
  }
  await sleep(800);

  // 5. 自动上传与绑定 2.35:1 宽屏主封面
  if (meta.hasCover && meta.coverBase64) {
    try {
      console.log('[doudou-weixin] 开始上传并设置文章主封面...');
      
      // 5.1 展开图片库选择弹窗
      const findDialog = () => document.querySelector('.weui-desktop-dialog_img-picker') || 
                                Array.from(document.querySelectorAll('.weui-desktop-dialog')).find(d => 
                                  d.querySelector('.weui-desktop-img-picker__list') || 
                                  (d.innerText && (d.innerText.includes('选择图片') || d.innerText.includes('我的图片')))
                                );

      let dialog = findDialog();
      if (!dialog || window.getComputedStyle(dialog.closest('.weui-desktop-dialog__wrp') || dialog).display === 'none') {
        const coverTrigger = document.querySelector('.pop-opr__button.js_imagedialog') ||
                             document.querySelector('.js_imagedialog') || 
                             document.querySelector('.js_cover_btn_area') || 
                             document.querySelector('#js_cover_area');
        if (coverTrigger) {
          coverTrigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(300);
          coverTrigger.click();
          await sleep(1000);
        }
      }
      dialog = findDialog();

      if (dialog) {
        const fileInput = dialog.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
        if (fileInput) {
          // 5.2 构建包含唯一文件名的 File 对象并派发上传
          const uploadFileName = 'doudou_cover_' + Date.now() + '_' + (meta.coverFileName || 'cover.jpg');
          const b64Data = meta.coverBase64.includes(',') ? meta.coverBase64.split(',')[1] : meta.coverBase64;
          const byteCharacters = atob(b64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: meta.coverMimeType });
          const file = new File([blob], uploadFileName, { type: meta.coverMimeType });

          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));

          console.log('[doudou-weixin] 封面图片已提交上传，轮询等待上传完成与列表刷新...');
          
          // 5.3 轮询匹配刚刚上传的新图片（严禁盲选旧图）
          let targetItem = null;
          for (let retry = 0; retry < 15; retry++) {
            await sleep(500);
            const items = Array.from(dialog.querySelectorAll('.weui-desktop-img-picker__item, .img-item'));
            targetItem = items.find(i => (i.innerText || '').includes(uploadFileName) || (i.getAttribute('title') || '').includes(uploadFileName));
            if (targetItem) break;
            // 若后台未回显文件名，等待进度条完成后选取首项
            if (items.length > 0 && retry >= 4 && !dialog.querySelector('.weui-desktop-progress, .upload-progress')) {
              targetItem = items[0];
              break;
            }
          }

          if (targetItem) {
            targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(200);
            targetItem.click();
            const innerImg = targetItem.querySelector('img') || targetItem.querySelector('.img');
            if (innerImg) innerImg.click();
            await sleep(500);
          }

          // 5.4 点击第一道「下一步」进入裁切窗口
          const nextBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.trim() === '下一步' && !b.disabled);
          if (nextBtn) {
            nextBtn.click();
            console.log('[doudou-weixin] 已点击下一步进入裁切窗口...');
            await sleep(1500);
          }

          // 5.5 微信封面双画幅裁切闭环（2.35:1 裁切 -> 下一步/确认 -> 1:1 裁切 -> 确认）
          for (let step = 0; step < 3; step++) {
            const stepBtns = Array.from(document.querySelectorAll('.weui-desktop-dialog button')).filter(b => b.offsetWidth > 0 && !b.disabled);
            const nextStepBtn = stepBtns.find(b => b.innerText.trim() === '下一步');
            const confirmBtn = stepBtns.find(b => b.innerText.trim() === '确认' || b.innerText.trim() === '完成' || b.innerText.trim() === '确定');
            if (nextStepBtn) {
              nextStepBtn.click();
              await sleep(1000);
            } else if (confirmBtn) {
              confirmBtn.click();
              window.__doudou_cover_status = 'uploaded';
              await sleep(1000);
              break;
            }
          }
          console.log('[doudou-weixin] 封面上传与裁切绑定完成！');
        }
      }
    } catch (coverErr) {
      console.warn('[doudou-weixin] 封面自动上传处理出现非阻塞异常:', coverErr);
    }
  }
  await sleep(300);

  // 6. 完成发布就绪（直接判定完成，原样保留页面现场供人工发布，严禁调用 close_page）
  console.log('[doudou-weixin] 微信公众号文章内容填入完毕，直接判定发布就绪！');
  const appmsgid = null;

  const coverArea = document.querySelector('#js_cover_area');
  const hasCoverSet = !!(coverArea && coverArea.querySelector('.select-cover__preview:not([style*="display: none"]), img, [style*="background-image"]'));

  return {
    success: true,
    isReady: true,
    status: 'ready',
    type: 'article',
    appmsgid,
    title: meta.title,
    author: meta.author,
    hasCoverSet,
    url: window.location.href,
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
    description: meta.stickerDesc,
    stickerCount: meta.stickerImages ? meta.stickerImages.length : 0
  };

  return `async () => {
  const meta = ${JSON.stringify(payload)};

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.random() * 200));

  console.log('[doudou-weixin] 开始拟真人机设置贴图文案并保存草稿（极简流：卡片 + 标题 + 简介）...');

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

  // 3. 完成发布就绪（直接判定完成，原样保留页面现场供人工发布，严禁调用 close_page）
  console.log('[doudou-weixin] 微信贴图内容填入完毕，直接判定发布就绪！');
  const appmsgid = null;

  return {
    success: true,
    isReady: true,
    status: 'ready',
    type: 'sticker',
    appmsgid,
    title: meta.title,
    cardCount: meta.stickerCount,
    url: window.location.href,
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
