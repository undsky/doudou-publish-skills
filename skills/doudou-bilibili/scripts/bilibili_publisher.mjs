import path from 'node:path';
import { parseArticle } from './parser.mjs';

/**
 * 生成可在哔哩哔哩文章编辑器执行的自包含拟真发布 Payload 函数字符串
 * @param {string} markdownFilePath 
 * @returns {string} 可在目标页面 evaluate_script 执行的自包含异步 JS 代码
 */
export async function buildBrowserPublishScript(markdownFilePath) {
  const articleData = await parseArticle(markdownFilePath);

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

  // 3. 批量将正文中的所有配图转存至 B 站 BFS 图床
  let finalHtml = data.html;
  log('开始检查并转存正文配图 (共 ' + data.images.length + ' 张)...');

  let successImgCount = 0;
  for (let idx = 0; idx < data.images.length; idx++) {
    const imgInfo = data.images[idx];
    try {
      let blob = null;
      if (imgInfo.base64) {
        blob = base64ToBlob(imgInfo.base64, imgInfo.mimeType || 'image/png');
      } else if (imgInfo.src && imgInfo.src.startsWith('http')) {
        // 网络图片拉取为 Blob
        const imgResp = await fetch(imgInfo.src);
        blob = await imgResp.blob();
      }

      if (blob) {
        log('正在上传正文配图 [' + (idx + 1) + '/' + data.images.length + '] (' + (imgInfo.alt || '配图') + ') 至 B站 BFS...');
        const bfsData = await uploadToBFS(blob, 'article_img_' + idx + '.png');
        const hdslbUrl = bfsData.image_url.replace(/^http:/, 'https:');
        log('配图 [' + (idx + 1) + '] 上传成功: ' + hdslbUrl);

        const imgNodeHtml = '<img class="eva3-bili-image" data-eva3-scoped="" src="' + hdslbUrl + '" alt="' + (imgInfo.alt || '配图') + '" data-caption="' + (imgInfo.alt || '配图') + '" data-ai-gen-pic="0" data-eva-image="enhanced">';
        finalHtml = finalHtml.replaceAll(imgInfo.placeholder, imgNodeHtml);
        successImgCount++;
      } else {
        log('配图 [' + (idx + 1) + '] 未获取到有效数据，清除占位');
        finalHtml = finalHtml.replaceAll(imgInfo.placeholder, '');
      }
      await randomDelay(250, 450);
    } catch (e) {
      log('正文配图 [' + (idx + 1) + '] 转存失败: ' + e.message + '，清除占位');
      finalHtml = finalHtml.replaceAll(imgInfo.placeholder, '');
    }
  }
  log('正文配图处理完成，成功转存: ' + successImgCount + '/' + data.images.length);

  // 4. 拟真人机输入文章标题
  log('正在拟真输入文章标题: ' + data.title);
  const titleInput = targetDoc.querySelector('.title-input__inner');
  if (titleInput) {
    titleInput.focus();
    await randomDelay(300, 600);
    titleInput.value = data.title;
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    await randomDelay(200, 400);
    titleInput.blur();
  } else {
    log('未找到标题输入框 .title-input__inner');
  }

  await randomDelay(400, 700);

  // 5. 注入文章正文内容
  log('正在注入文章正文到 TipTap 编辑器...');
  editor.commands.setContent(finalHtml);
  await randomDelay(800, 1400);

  // 6. 配置发布设置与封面图
  log('正在打开发布设置面板...');
  const settingsBtn = targetDoc.querySelector('.settings-button') || Array.from(targetDoc.querySelectorAll('button')).find(b => b.innerText.includes('发布设置'));
  if (settingsBtn) {
    settingsBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await randomDelay(200, 400);
    settingsBtn.click();
    await randomDelay(600, 1000);

    // 检查并开启「自定义封面」
    const formItems = Array.from(targetDoc.querySelectorAll('.publish-settings .form .form-item, .publish-settings .form-item'));
    const coverItem = formItems.find(item => item.querySelector('.form-item-label')?.innerText?.includes('自定义封面') || item.innerText?.includes('自定义封面'));

    if (coverItem && data.cover && (data.cover.base64 || data.cover.url)) {
      log('开始上传并设置文章自定义封面...');

      // 如果存在旧封面，先点击删除
      const deleteBtn = coverItem.querySelector('.selected-action button') || Array.from(coverItem.querySelectorAll('button')).find(b => b.innerText.includes('删除'));
      if (deleteBtn) {
        log('检测到已有旧封面，先点击删除以更新新封面...');
        deleteBtn.click();
        await randomDelay(500, 800);
      }

      // 确保自定义封面开关处于开启状态
      const switchEl = coverItem.querySelector('.vui_switch--switch');
      const isChecked = switchEl?.classList.contains('is-checked') || switchEl?.getAttribute('aria-checked') === 'true' || coverItem.querySelector('input.vui_switch-input')?.checked;

      if (!isChecked) {
        log('点击开启自定义封面开关...');
        const switchCore = coverItem.querySelector('.vui_switch--switch') || coverItem.querySelector('.vui_switch-core') || coverItem.querySelector('.vui_switch-input');
        if (switchCore) {
          switchCore.click();
          await randomDelay(600, 900);
        }
      }

      // 获取封面 Blob
      let coverBlob = null;
      if (data.cover.base64) {
        coverBlob = base64ToBlob(data.cover.base64, data.cover.mimeType || 'image/png');
      } else if (data.cover.url) {
        const cResp = await fetch(data.cover.url);
        coverBlob = await cResp.blob();
      }

      if (coverBlob) {
        // 点击「添加封面」/「重新上传」以唤起文件选择控件
        const uploadBtn = coverItem.querySelector('.upload-button') || Array.from(coverItem.querySelectorAll('div, button')).find(el => el.innerText?.trim() === '添加封面' || el.innerText?.trim() === '重新上传');
        if (uploadBtn) {
          uploadBtn.click();
          await randomDelay(400, 700);
        }

        const coverFile = new File([coverBlob], 'cover.png', { type: 'image/png' });
        let fileInput = coverItem.querySelector('input[type="file"]') || targetDoc.querySelector('input[type="file"]');

        if (fileInput) {
          const dt = new DataTransfer();
          dt.items.add(coverFile);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          log('已注入封面文件至上传控件，等待裁切对话框...');

          // 轮询等待裁切对话框出现
          let confirmBtn = null;
          for (let waitCount = 0; waitCount < 15; waitCount++) {
            await delay(400);
            confirmBtn = targetDoc.querySelector('.vui_dialog--btn-confirm') || Array.from(targetDoc.querySelectorAll('button')).find(b => b.innerText.trim() === '确定' && (b.className.includes('confirm') || b.className.includes('blue')));
            if (confirmBtn) break;
          }

          if (confirmBtn) {
            confirmBtn.click();
            log('已点击封面裁切确定按钮，封面绑定成功');
            await randomDelay(800, 1400);
          } else {
            log('未检测到裁切弹窗确定按钮，尝试备用查找');
            const anyConfirmBtn = Array.from(targetDoc.querySelectorAll('button')).find(b => b.innerText.trim() === '确定');
            if (anyConfirmBtn) {
              anyConfirmBtn.click();
              await randomDelay(800, 1400);
            }
          }
        } else {
          log('未找到封面文件上传控件 input[type="file"]');
        }
      }
    }

    // 勾选「原创声明」
    const originItem = formItems.find(item => item.querySelector('.form-item-label')?.innerText?.includes('创作声明') || item.innerText?.includes('创作声明'));
    if (originItem) {
      const checkbox = originItem.querySelector('.vui_checkbox');
      const isChecked = checkbox?.classList.contains('is-checked') || originItem.querySelector('input[type="checkbox"]')?.checked;
      if (!isChecked) {
        const boxInput = originItem.querySelector('.vui_checkbox--input-box') || originItem.querySelector('.vui_checkbox') || originItem.querySelector('input[type="checkbox"]');
        if (boxInput) {
          boxInput.click();
          log('已勾选文章原创声明');
          await randomDelay(300, 500);
        }
      }
    }
  }

  // 7. 模拟人工视口平滑滚动检查
  log('模拟人工视口平滑滚动检查排版...');
  targetWin.scrollTo({ top: 350, behavior: 'smooth' });
  await randomDelay(400, 700);
  targetWin.scrollTo({ top: 0, behavior: 'smooth' });
  await randomDelay(300, 600);

  // 8. 等待平台原生自动保存生效（B站专栏编辑器输入后自动保存，绝不主动点击「保存为草稿」或「发布」按钮）
  log('内容已注入完成，正在等待 B站专栏原生自动保存生效 (保留在编辑页)...');
  await delay(2500);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: data.title,
    summary: data.summary,
    topics: data.topics,
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
  // 查找 B站视频上传页面中的 input[type="file"]
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const targetInput = inputs.find(i => i.name === 'buploader' && i.accept.includes('.mp4')) 
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

/**
 * 构建填写视频作品信息并进行防风控检查的浏览器注入脚本
 * @param {object} meta 
 * @returns {string}
 */
export function buildFillVideoFormBrowserScript(meta) {
  // 标签一律取解析结果（parser.inferTopics 从文章自身派生），不注入与内容无关的固定标签；
  // 留空时由 publisher 记录提示，交人工在页面补填。
  const metaJson = JSON.stringify({
    title: meta.videoTitle || meta.title || '',
    description: meta.videoDesc || meta.description || '',
    tags: Array.isArray(meta.topics) ? meta.topics : [],
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

  log('开始填充 B站视频投稿表单元数据...');

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

  // 2. 自定义封面上传与裁切绑定（优先使用同名目录 cover/images 下的封面产物）
  if (meta.cover && (meta.cover.base64 || meta.cover.url)) {
    log('检测到自定义封面图配置，准备上传设置封面...');
    const coverTrigger = document.querySelector('.cover-empty-pill, .cover-empty') 
      || Array.from(document.querySelectorAll('span, button, div')).find(el => el.innerText?.trim() === '添加封面' || el.innerText?.trim() === '更换封面');

    if (coverTrigger) {
      log('点击打开封面制作弹窗...');
      coverTrigger.click();
      await delay(800);

      // 获取封面 Blob
      let coverBlob = null;
      if (meta.cover.base64) {
        const byteCharacters = atob(meta.cover.base64);
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
        
        // 查找封面弹窗中的上传 input[type="file"]
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

          // 查找并点击弹窗中的「完成」按钮
          const completeBtn = document.querySelector('.cover-editor-button .button.submit') 
            || Array.from(document.querySelectorAll('div, button, span')).find(el => el.innerText?.trim() === '完成' && (el.className.includes('submit') || el.className.includes('button')));
          if (completeBtn) {
            completeBtn.click();
            log('已点击封面制作「完成」按钮，封面绑定成功！');
            await delay(1200);
          } else {
            log('未找到封面制作完成按钮');
          }
        } else {
          log('未找到封面上传 input 控件');
        }
      }
    } else {
      log('未找到「添加封面」入口按钮');
    }
  }

  await randomDelay(400, 700);

  // 3. 拟真输入视频标题（上限 80 字，使用 Vue 3 原生 setter 驱动）
  const titleInput = document.querySelector('input[placeholder*="标题"], .video-title input, input.title-input__inner, input[maxlength="80"]')
    || Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.placeholder?.includes('标题') || i.className.includes('title'));

  if (titleInput) {
    log('定位到视频标题输入框，拟真填入标题: ' + meta.title);
    titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    titleInput.focus();
    await randomDelay(200, 400);
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(titleInput, meta.title);
    } catch (e) {
      titleInput.value = meta.title;
    }
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    await randomDelay(200, 400);
    titleInput.blur();
  } else {
    log('⚠️ 未定位到标题输入框');
  }

  await randomDelay(400, 700);

  // 3. 设置类型为「自制」（原创声明）
  const typeRadios = Array.from(document.querySelectorAll('.video-type-item, .vui_radio, label.radio, .type-wrp label'));
  const originalRadio = typeRadios.find(r => r.innerText?.includes('自制') || r.innerText?.includes('原创'));
  if (originalRadio) {
    log('点击选择投稿类型为「自制」');
    originalRadio.click();
    await randomDelay(400, 600);
  }

  // 4. 选择分区（若有自动推荐分区标签，点击第一个适宜推荐）
  const categoryChips = Array.from(document.querySelectorAll('.rec-type-item, .category-chip, .type-item, .f-type-item'));
  if (categoryChips.length > 0) {
    const techChip = categoryChips.find(c => c.innerText.includes('科技') || c.innerText.includes('软件') || c.innerText.includes('人工智能') || c.innerText.includes('计算机') || c.innerText.includes('知识')) || categoryChips[0];
    if (techChip) {
      log('点击选择推荐分区: ' + techChip.innerText?.trim());
      techChip.click();
      await randomDelay(400, 600);
    }
  }

  // 5. 填写视频标签（TAG）与推荐标签
  const tagInput = document.querySelector('.tag-input-wrp input, input[placeholder*="按回车键Enter创建标签"], input[placeholder*="标签"], .tag-wrp input, .tag-input input');
  if (tagInput && Array.isArray(meta.tags) && meta.tags.length > 0) {
    log('开始输入视频标签: ' + meta.tags.join(', '));
    tagInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    for (const tag of meta.tags.slice(0, 5)) {
      tagInput.focus();
      try {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(tagInput, tag);
      } catch (e) {
        tagInput.value = tag;
      }
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));
      await randomDelay(150, 300);
      tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      tagInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      await randomDelay(300, 500);
    }
    tagInput.blur();
  } else if (tagInput) {
    log('提示: 未从文章派生出标签，已跳过标签填写（B 站要求至少一个标签，请人工在页面补填）');
  }

  // 顺带点击推荐标签
  const recTags = Array.from(document.querySelectorAll('.label-item, .rec-tag, [class*="recommend"] span, [class*="tag-item"]')).filter(el => {
    const text = el.innerText.trim();
    return text === 'undsky' || text === '人工智能' || text === '生活记录' || text === '开源先锋计划';
  }).slice(0, 2);
  for (const rt of recTags) {
    try {
      rt.click();
      await randomDelay(200, 400);
    } catch (e) {}
  }

  await randomDelay(400, 700);

  // 6. 拟真填入视频简介（结构化多行文本，支持 Quill 富文本编辑器与 textarea 回退）
  const qlContainer = document.querySelector('.ql-container');
  const descArea = document.querySelector('textarea[placeholder*="简介"], .desc-input textarea, textarea.content-desc, textarea[maxlength*="2000"]')
    || Array.from(document.querySelectorAll('textarea')).find(t => t.placeholder?.includes('简介') || t.className.includes('desc'));

  if (qlContainer && qlContainer.__quill) {
    log('定位到 Quill 简介编辑器，注入结构化简介...');
    qlContainer.__quill.setText(meta.description);
    await randomDelay(300, 500);
  } else if (descArea) {
    log('定位到视频简介 textarea，注入结构化简介...');
    descArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    descArea.focus();
    await randomDelay(200, 400);
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(descArea, meta.description);
    } catch (e) {
      descArea.value = meta.description;
    }
    descArea.dispatchEvent(new Event('input', { bubbles: true }));
    descArea.dispatchEvent(new Event('change', { bubbles: true }));
    await randomDelay(200, 400);
    descArea.blur();
  } else {
    log('⚠️ 未定位到视频简介输入域');
  }

  await randomDelay(500, 800);

  // 7. 模拟人工视口平滑滚动检查
  log('模拟人工视口平滑滚动检查表单填写...');
  window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
  await randomDelay(400, 600);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await randomDelay(300, 500);

  // 8. 等待平台就绪与自动保存（严禁触碰「立即投稿」按钮，亦不主动点击存草稿，保留现场）
  log('【安全红线检查】表单与视频已配置完成，等待平台自动同步就绪 (严格绝不点击「立即投稿」)');
  await delay(2000);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: meta.title,
    tags: meta.tags,
    draftUrl: window.location.href,
    logs
  };
}`;
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
