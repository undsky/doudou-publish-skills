import path from 'node:path';
import { parseArticle } from './parser.mjs';

/**
 * 生成可在哔哩哔哩文章编辑器执行的自包含拟真发布 Payload 函数字符串
 * @param {string} markdownFilePath 
 * @returns {string} 可在目标页面 evaluate_script 执行的自包含异步 JS 代码
 */
export async function buildBrowserPublishScript(markdownFilePathOrMeta) {
  const articleData = typeof markdownFilePathOrMeta === 'string'
    ? await parseArticle(markdownFilePathOrMeta)
    : markdownFilePathOrMeta;

  const jsonPayload = JSON.stringify({
    title: articleData.title,
    summary: articleData.summary,
    topics: articleData.topics,
    cover: articleData.cover,
    html: articleData.html,
    images: articleData.images
  });

  return `async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  log('开始执行哔哩哔哩专栏草稿箱拟真发布流程...');

  // 1. 定位 iframe 与文档环境
  let targetDoc = document;
  let targetWin = window;

  const iframe = document.querySelector('iframe[src*="read-editor"]');
  if (iframe) {
    targetWin = iframe.contentWindow;
    targetDoc = iframe.contentDocument || iframe.contentWindow.document;
    log('已定位到 B站专栏编辑器 iframe: ' + (iframe.src || 'read-editor'));
  }

  const editor = targetWin.editor;
  if (!editor) {
    return {
      success: false,
      error: '未能定位到 B站 Sunflower / TipTap 编辑器实例，请确认当前已登录并停留在 https://member.bilibili.com/platform/upload/text/new-edit 页面',
      logs
    };
  }

  // 2. 获取 CSRF Token (bili_jct)
  function getCookie(name) {
    const cookieStr = (document.cookie || targetDoc.cookie || '');
    const items = cookieStr.split(';');
    for (let i = 0; i < items.length; i++) {
      const item = items[i].trim();
      if (item.indexOf(name + '=') === 0) {
        return decodeURIComponent(item.substring(name.length + 1));
      }
    }
    return '';
  }

  const csrf = getCookie('bili_jct');
  log('CSRF Token (bili_jct) 状态: ' + (csrf ? '已获取(' + csrf.substring(0, 6) + '...)' : '未检测到(尝试直接请求)'));

  // Base64 转 Blob 辅助函数
  function base64ToBlob(base64, mimeType = 'image/png') {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  // 官方图床 BFS 上传函数（带重试）
  async function uploadToBFS(blob, filename = 'image.png', retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const fd = new FormData();
        fd.append('file_up', blob, filename);
        fd.append('biz', 'new_dyn');
        fd.append('category', 'daily');
        if (csrf) {
          fd.append('csrf', csrf);
        }

        const resp = await fetch('https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs', {
          method: 'POST',
          body: fd,
          credentials: 'include'
        });
        const res = await resp.json();
        if (res.code === 0 && res.data && res.data.image_url) {
          return res.data;
        }
        throw new Error(res.message || 'BFS 上传失败 code: ' + res.code);
      } catch (err) {
        if (attempt === retries) throw err;
        await delay(500);
      }
    }
  }

  // 3. 极速正文配图装配（正文已为 CDN 图床，无需逐张网络转存，立省 15~30 秒）
  // 4. 拟真人机输入文章标题
  log('正在拟真输入文章标题: ' + data.title);
  const titleInput = targetDoc.querySelector('.title-input__inner');
  if (titleInput) {
    titleInput.focus();
    await randomDelay(200, 400);
    titleInput.value = data.title;
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    await randomDelay(150, 300);
    titleInput.blur();
  }

  await randomDelay(300, 500);

  // 5. 注入文章正文内容到 TipTap 编辑器
  log('正在注入文章正文到 TipTap 编辑器...');
  editor.commands.setContent(data.html);
  await randomDelay(400, 600);

  // 5.1 精准将占位符替换为 TipTap 原生 enhancedImage 节点（支持真实渲染与显示）
  if (Array.isArray(data.images) && data.images.length > 0 && editor.schema.nodes.enhancedImage) {
    log('正在通过 TipTap 原生 enhancedImage 节点绑定正文配图 (' + data.images.length + ' 张)...');
    const doc = editor.state.doc;
    const positions = [];
    doc.descendants((node, pos) => {
      if (node.isText) {
        for (const img of data.images) {
          if (!img.placeholder) continue;
          const idx = node.text.indexOf(img.placeholder);
          if (idx !== -1) {
            positions.push({
              pos: pos + idx,
              len: img.placeholder.length,
              img
            });
          }
        }
      }
    });

    // 从后向前倒序替换，防止前面的替换改变后续 pos
    positions.sort((a, b) => b.pos - a.pos);
    for (const item of positions) {
      let imgSrc = item.img.src || (item.img.base64 ? 'data:' + (item.img.mimeType || 'image/png') + ';base64,' + item.img.base64 : '');
      // 外部图片通过官方 upload_bfs 快速转存为 B站官方图床（避免保存草稿被拦截）
      if (imgSrc && !imgSrc.includes('hdslb.com')) {
        try {
          const cResp = await fetch(imgSrc);
          if (cResp.ok) {
            const blob = await cResp.blob();
            const bfsRes = await uploadToBFS(blob, 'content_' + (item.img.id || 'img') + '.png');
            if (bfsRes && bfsRes.image_url) {
              imgSrc = bfsRes.image_url.replace(/^http:/, 'https:');
              log('已成功转存至 B站官方 BFS 图床: ' + imgSrc);
            }
          }
        } catch (e) {
          log('BFS 图床转存跳过: ' + e.message);
        }
      }

      if (imgSrc) {
        const imgNode = editor.schema.nodes.enhancedImage.create({
          src: imgSrc,
          alt: item.img.alt || '[图片]',
          caption: item.img.alt || ''
        });
        editor.view.dispatch(
          editor.state.tr.replaceWith(item.pos, item.pos + item.len, imgNode)
        );
        log('已成功注入正文配图: ' + (item.img.alt || item.img.placeholder));
      }
    }
  }
  await randomDelay(400, 600);

  // 6. 配置发布设置与封面图
  log('正在打开发布设置面板...');
  const settingsBtn = targetDoc.querySelector('.settings-button') || Array.from(targetDoc.querySelectorAll('button')).find(b => b.innerText.includes('发布设置'));
  if (settingsBtn) {
    settingsBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await randomDelay(150, 300);
    settingsBtn.click();
    await randomDelay(400, 700);

    // 检查并开启「自定义封面」
    const formItems = Array.from(targetDoc.querySelectorAll('.publish-settings .form .form-item, .publish-settings .form-item'));
    const coverItem = formItems.find(item => item.querySelector('.form-item-label')?.innerText?.includes('自定义封面') || item.innerText?.includes('自定义封面'));

    if (coverItem && data.cover && (data.cover.base64 || data.cover.url)) {
      log('开始上传并设置文章自定义封面...');

      // 如果存在旧封面，先点击删除
      const deleteBtn = coverItem.querySelector('.selected-action button') || Array.from(coverItem.querySelectorAll('button')).find(b => b.innerText.includes('删除'));
      if (deleteBtn) {
        deleteBtn.click();
        await randomDelay(300, 500);
      }

      // 确保自定义封面开关处于开启状态
      const switchEl = coverItem.querySelector('.vui_switch--switch');
      const isChecked = switchEl?.classList.contains('is-checked') || switchEl?.getAttribute('aria-checked') === 'true' || coverItem.querySelector('input.vui_switch-input')?.checked;

      if (!isChecked) {
        const switchCore = coverItem.querySelector('.vui_switch--switch') || coverItem.querySelector('.vui_switch-core') || coverItem.querySelector('.vui_switch-input');
        if (switchCore) {
          switchCore.click();
          await randomDelay(400, 600);
        }
      }

      // 获取封面 Blob
      let coverBlob = null;
      const candidateUrls = [data.cover.url].filter(Boolean);
      for (const u of candidateUrls) {
        try {
          const resp = await fetch(u);
          if (resp.ok) {
            coverBlob = await resp.blob();
            break;
          }
        } catch(e) {}
      }
      if (!coverBlob && data.cover.base64) {
        coverBlob = base64ToBlob(data.cover.base64, data.cover.mimeType || 'image/png');
      }

      if (coverBlob) {
        const uploadBtn = coverItem.querySelector('.upload-button') || Array.from(coverItem.querySelectorAll('div, button')).find(el => el.innerText?.trim() === '添加封面' || el.innerText?.trim() === '重新上传');
        if (uploadBtn) {
          uploadBtn.click();
          await randomDelay(300, 500);
        }

        const coverFile = new File([coverBlob], 'cover.png', { type: 'image/png' });
        let fileInput = coverItem.querySelector('input[type="file"]') || targetDoc.querySelector('input[type="file"]');

        if (fileInput) {
          const dt = new DataTransfer();
          dt.items.add(coverFile);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          log('已注入封面文件至上传控件，等待裁切对话框...');

          let confirmBtn = null;
          for (let waitCount = 0; waitCount < 12; waitCount++) {
            await delay(300);
            confirmBtn = targetDoc.querySelector('.vui_dialog--btn-confirm') || Array.from(targetDoc.querySelectorAll('button')).find(b => b.innerText.trim() === '确定' && (b.className.includes('confirm') || b.className.includes('blue')));
            if (confirmBtn) break;
          }

          if (confirmBtn) {
            confirmBtn.click();
            window.__doudou_cover_status = 'uploaded';
            log('已点击封面裁切确定按钮，封面绑定成功');
            await randomDelay(500, 800);
          }
        }
      }
    }
  }

  // 7. 单次轻度视口微调触发懒加载
  targetWin.scrollTo({ top: 150, behavior: 'smooth' });
  await delay(200);
  targetWin.scrollTo({ top: 0, behavior: 'smooth' });
  await delay(800);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: data.title,
    coverState: data.cover ? (data.cover.localPath || data.cover.url ? '已配置' : '无') : '无',
    imagesCount: data.images.length,
    logs
  };
};
`;
}

/**
 * 构建准备视频上传的脚本（将隐藏的 input[type="file"] 暴露给 accessibility tree）
 * @returns {string}
 */
export function buildPrepareVideoUploadBrowserScript() {
  return `() => {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const targetInput = inputs.find(i => i.closest('.bcc-upload-wrapper') && i.accept && i.accept.includes('.mp4'))
    || inputs.find(i => i.accept && i.accept.includes('.mp4') && i.name !== 'buploader')
    || inputs.find(i => i.name === 'buploader' && i.accept && i.accept.includes('.mp4')) 
    || inputs.find(i => i.accept && i.accept.includes('.mp4')) 
    || inputs[0];

  if (targetInput) {
    targetInput.id = 'doudou-bilibili-video-input';
    targetInput.style.display = 'inline-block';
    targetInput.style.position = 'fixed';
    targetInput.style.top = '10px';
    targetInput.style.right = '10px';
    targetInput.style.zIndex = '999999';
    targetInput.style.width = '120px';
    targetInput.style.height = '36px';
    targetInput.style.opacity = '0.05';
    return { success: true, id: targetInput.id, name: targetInput.name };
  }
  return { success: false, error: '未在页面上找到视频上传 input[type="file"] 控件' };
}`;
}

/**
 * 构建等待视频上传完成的轮询脚本
 * @param {number} maxWaitSeconds 最长等待秒数，默认 180 秒
 * @returns {string}
 */
export function buildWaitVideoUploadReadyBrowserScript(maxWaitSeconds = 180) {
  return `async () => {
  const maxWait = ${maxWaitSeconds} * 1000;
  const start = Date.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  console.log('[doudou-bilibili] 正在等待视频上传及服务端处理就绪...');

  while (Date.now() - start < maxWait) {
    const bodyText = document.body ? document.body.innerText : '';
    
    // 检查是否有上传失败
    if (bodyText.includes('上传失败') || bodyText.includes('网络异常，上传中断')) {
      return { success: false, error: '检测到视频上传失败提示' };
    }

    // 检查是否出现编辑表单字段（如视频标题输入框、简介文本域）
    const titleInput = document.querySelector('input[placeholder*="标题"], .video-title input, input.title-input__inner, input[maxlength="80"]');
    const descInput = document.querySelector('.ql-container, textarea[placeholder*="简介"], .desc-input textarea');
    
    // 检查上传状态：进度达到 100% 或出现视频文件列表 / 重新上传 / 换源 / 上传完成 / 成功
    const hasSuccessStatus = bodyText.includes('上传完成') || bodyText.includes('上传成功') || bodyText.includes('100%');
    const hasFileList = !!document.querySelector('.video-list, .file-list, .upload-file-item, [class*="upload-status"]');

    if (titleInput && (hasSuccessStatus || hasFileList || descInput)) {
      console.log('[doudou-bilibili] 视频上传就绪，表单已可编辑！');
      return {
        success: true,
        elapsedMs: Date.now() - start,
        hasTitleInput: !!titleInput,
        hasDescInput: !!descInput
      };
    }

    await sleep(2000);
  }

  return { success: false, error: '等待视频上传超时（超过 ' + ${maxWaitSeconds} + ' 秒）' };
}`;
}

export function buildFillVideoFormBrowserScript(meta) {
  const metaJson = JSON.stringify({
    title: meta.videoTitle || meta.title || '',
    description: meta.videoDesc || meta.description || '',
    cover: meta.cover || null
  });

  return `async () => {
  const meta = ${metaJson};

  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
    console.log('[doudou-bilibili-video] ' + msg);
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  log('开始填充 B站视频投稿表单元数据（视频 + 封面 + 标题 + 简介）...');

  // 1. 关闭可能的弹窗或新功能引导
  const popups = Array.from(document.querySelectorAll('button, .vui_dialog, .vui_modal, .guide-mask, .dialog-footer button')).filter(el => {
    const t = el.innerText?.trim();
    return t === '知道了' || t === '确定' || t === '跳过' || t === '暂不开启' || t === '我已知晓';
  });
  for (const p of popups) {
    try {
      p.click();
      await delay(300);
    } catch (e) {}
  }

  // 2. 自定义封面上传与裁切绑定
  let coverUploaded = false;
  if (meta.cover && (meta.cover.base64 || meta.cover.url)) {
    log('检测到自定义封面图配置，准备上传设置封面...');
    const coverTrigger = document.querySelector('.cover-empty-pill, .cover-empty') 
      || Array.from(document.querySelectorAll('span, button, div')).find(el => el.innerText?.trim() === '添加封面' || el.innerText?.trim() === '更换封面');

    if (coverTrigger) {
      log('点击打开封面制作弹窗...');
      coverTrigger.click();
      await delay(800);

      let coverBlob = null;
      if (meta.cover.base64) {
        let b64 = meta.cover.base64;
        if (b64.includes(',')) b64 = b64.split(',')[1];
        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        coverBlob = new Blob([byteArray], { type: meta.cover.mimeType || 'image/png' });
      } else if (meta.cover.url) {
        try {
          const cResp = await fetch(meta.cover.url);
          coverBlob = await cResp.blob();
        } catch (e) {
          log('下载网络封面图片失败: ' + e.message);
        }
      }

      if (coverBlob) {
        const coverFile = new File([coverBlob], 'cover.png', { type: meta.cover.mimeType || 'image/png' });
        const imageInputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(i => i.accept && i.accept.includes('image'));
        const targetCoverInput = imageInputs.find(i => i.closest('.cover-upload')) || imageInputs[imageInputs.length - 1];

        if (targetCoverInput) {
          const dt = new DataTransfer();
          dt.items.add(coverFile);
          targetCoverInput.files = dt.files;
          targetCoverInput.dispatchEvent(new Event('input', { bubbles: true }));
          targetCoverInput.dispatchEvent(new Event('change', { bubbles: true }));
          log('已注入封面文件至弹窗控件，等待裁切预览渲染...');
          await delay(1800);

          const completeBtn = document.querySelector('.cover-editor-button .button.submit') 
            || Array.from(document.querySelectorAll('div, button, span')).find(el => el.innerText?.trim() === '完成' && (el.className.includes('submit') || el.className.includes('button')));
          if (completeBtn) {
            completeBtn.click();
            coverUploaded = true;
            window.__doudou_cover_status = 'uploaded';
            log('已点击封面制作「完成」按钮，封面绑定成功！');
            await delay(800);
          } else {
            log('未找到封面制作完成按钮');
          }
        } else {
          log('未找到封面上传 input 控件');
        }
      }
    }
  }
  await randomDelay(200, 400);

  // 3. 拟真输入视频标题（上限 80 字，使用 Vue 3 原生 setter 驱动）
  const titleInput = document.querySelector('input[placeholder*="标题"], .video-title input, input.title-input__inner, input[maxlength="80"]')
    || Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.placeholder?.includes('标题') || i.className.includes('title'));

  if (titleInput) {
    log('定位到视频标题输入框，拟真填入标题: ' + meta.title);
    titleInput.focus();
    await randomDelay(150, 300);
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(titleInput, meta.title);
    } catch (e) {
      titleInput.value = meta.title;
    }
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    await randomDelay(150, 300);
    titleInput.blur();
  } else {
    log('⚠️ 未定位到标题输入框');
  }

  await randomDelay(200, 400);

  // 4. 拟真填入视频简介（结构化多行文本，支持 Quill 富文本编辑器与 textarea 回退）
  const qlContainer = document.querySelector('.ql-container');
  const descArea = document.querySelector('textarea[placeholder*="简介"], .desc-input textarea, textarea.content-desc, textarea[maxlength*="2000"]')
    || Array.from(document.querySelectorAll('textarea')).find(t => t.placeholder?.includes('简介') || t.className.includes('desc'));

  if (qlContainer && qlContainer.__quill) {
    log('定位到 Quill 简介编辑器，注入结构化简介...');
    qlContainer.__quill.setText(meta.description);
    await randomDelay(200, 400);
  } else if (descArea) {
    log('定位到视频简介 textarea，注入结构化简介...');
    descArea.focus();
    await randomDelay(150, 300);
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(descArea, meta.description);
    } catch (e) {
      descArea.value = meta.description;
    }
    descArea.dispatchEvent(new Event('input', { bubbles: true }));
    descArea.dispatchEvent(new Event('change', { bubbles: true }));
    await randomDelay(150, 300);
    descArea.blur();
  } else {
    log('⚠️ 未定位到视频简介输入域');
  }

  // 5. 单次轻度视口微调
  window.scrollTo({ top: 150, behavior: 'smooth' });
  await delay(200);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await delay(800);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: meta.title,
    coverUploaded,
    draftUrl: window.location.href,
    logs
  };
};`;
}

/**
 * 构建完整的视频发布浏览器脚本
 * @param {string} markdownFilePath 
 * @returns {Promise<string>}
 */
export async function buildVideoPublishScript(markdownFilePath) {
  const articleData = await parseArticle(markdownFilePath);
  return buildFillVideoFormBrowserScript(articleData);
}

// 别名导出，兼容 SKILL.md 与不同调用习惯
export const buildArticleBrowserScript = buildBrowserPublishScript;

// 命令行直接运行测试脚本生成
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('bilibili_publisher.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node bilibili_publisher.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const scriptCode = await buildBrowserPublishScript(targetFile);
  console.log('生成专栏 Browser Payload 脚本长度:', scriptCode.length);

  const videoScriptCode = await buildVideoPublishScript(targetFile);
  console.log('生成视频 Browser Payload 脚本长度:', videoScriptCode.length);
}
