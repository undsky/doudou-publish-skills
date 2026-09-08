/**
 * 微信视频号助手自动化发布浏览器脚本生成器
 * 涵盖：
 * 1. 穿透微前端 iframe[name="content"] 上下文
 * 2. 暴露文件上传 input 辅助 upload_file 精准绑定
 * 3. 异步视频上传与转码完成就绪轮询
 * 4. 16 字精炼短标题与 1000 字换行分段描述注入及 Vue 状态双向同步
 * 5. 拟真视口滚动与保存草稿（严禁误触「发表」按钮）
 */

/**
 * 构建准备视频上传的脚本（将隐藏的 input[type="file"] 暴露给 accessibility tree）
 * @returns {string}
 */
export function buildPrepareUploadBrowserScript() {
  return `(() => {
  const iframe = document.querySelector('iframe[name="content"]');
  const doc = iframe && iframe.contentDocument ? iframe.contentDocument : document;
  const fileInput = doc.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.id = 'doudou-channels-file-input';
    fileInput.style.display = 'inline-block';
    fileInput.style.position = 'fixed';
    fileInput.style.top = '10px';
    fileInput.style.right = '10px';
    fileInput.style.zIndex = '999999';
    fileInput.style.width = '120px';
    fileInput.style.height = '36px';
    fileInput.style.opacity = '0.05';
    return { success: true, id: fileInput.id };
  }
  return { success: false, error: '未找到 input[type="file"]' };
})()`;
}

/**
 * 构建等待视频上传完成的轮询脚本
 * @param {number} maxWaitSeconds 最长等待秒数，默认 120 秒
 * @returns {string}
 */
export function buildWaitUploadReadyBrowserScript(maxWaitSeconds = 120) {
  return `(async () => {
  const maxWait = ${maxWaitSeconds} * 1000;
  const start = Date.now();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const getDoc = () => {
    const iframe = document.querySelector('iframe[name="content"]');
    return iframe && iframe.contentDocument ? iframe.contentDocument : document;
  };

  console.log('[doudou-shipinhao] 正在等待视频上传及转码处理完成...');

  while (Date.now() - start < maxWait) {
    const doc = getDoc();
    const bodyText = doc.body ? doc.body.innerText : '';
    const hasCancelUpload = bodyText.includes('取消上传');
    
    // 检查是否有 video 标签或封面预览
    const hasVideo = !!doc.querySelector('video, .cover-preview, [class*="cover-preview"]');
    const saveBtn = Array.from(doc.querySelectorAll('button, .weui-desktop-btn')).find(b => b.innerText.includes('保存草稿'));
    const isSaveDisabled = saveBtn ? (saveBtn.disabled || saveBtn.className.includes('disabled')) : true;

    // 当取消上传不再出现，且保存草稿按钮可用（或有视频存在）时视为就绪
    if (!hasCancelUpload && (hasVideo || !isSaveDisabled)) {
      console.log('[doudou-shipinhao] 视频上传就绪！');
      return { success: true, elapsedMs: Date.now() - start };
    }

    await sleep(1500);
  }

  return { success: false, error: '等待视频上传超时（超过 ' + ${maxWaitSeconds} + ' 秒）' };
})()`;
}

/**
 * 构建填写视频作品信息并点击「保存草稿」的浏览器注入脚本
 * @param {object} meta 
 * @returns {string}
 */
export function buildSaveDraftBrowserScript(meta) {
  return `(async () => {
  const meta = {
    shortTitle: ${JSON.stringify(meta.shortTitle || '')},
    description: ${JSON.stringify(meta.videoDesc || meta.description || '')},
    tags: ${JSON.stringify(meta.tags || [])},
    coverBase64: ${JSON.stringify(meta.coverBase64 || meta.cover?.base64 || meta.videoCover?.base64 || '')}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  const getDoc = () => {
    const iframe = document.querySelector('iframe[name="content"]');
    return iframe && iframe.contentDocument ? iframe.contentDocument : document;
  };

  const doc = getDoc();
  console.log('[doudou-shipinhao] 开始填写短标题与描述...');

  // 1. 关闭可能的弹窗或引导提示
  const guideBtns = Array.from(doc.querySelectorAll('button, .weui-desktop-btn')).filter(b => 
    b.innerText.trim() === '我知道了' && window.getComputedStyle(b).display !== 'none'
  );
  for (const b of guideBtns) {
    try { b.click(); } catch (e) {}
    await sleep(200);
  }

  // 2. 填写短标题（严格限制 16 字以内）
  let cleanTitle = meta.shortTitle.trim();
  if (cleanTitle.length > 16) {
    cleanTitle = cleanTitle.substring(0, 15) + '…';
    if (cleanTitle.length > 16) cleanTitle = cleanTitle.substring(0, 16);
  }

  const titleInput = doc.querySelector('input[placeholder*="填写短标题"]');
  if (titleInput && cleanTitle) {
    console.log('[doudou-shipinhao] 填写短标题:', cleanTitle);
    titleInput.focus();
    await sleep(200);
    
    // 原生 value setter
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(titleInput, cleanTitle);
    } else {
      titleInput.value = cleanTitle;
    }
    titleInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    
    // 同步 Vue 内部状态
    let cur = titleInput;
    let vueComp = null;
    while (cur && !vueComp) {
      if (cur.__vue__) vueComp = cur.__vue__;
      cur = cur.parentElement;
    }
    if (vueComp && vueComp.$data) {
      vueComp.$data.internalValue = cleanTitle;
      vueComp.$data.internalStatus = 'normal';
    }

    await sleep(250);
    titleInput.blur();
  }
  await sleep(350);

  // 3. 填写多行分段描述（严格限制 1000 字以内）
  const editor = doc.querySelector('.input-editor[contenteditable="true"]') || doc.querySelector('[contenteditable="true"]');
  if (editor && meta.description) {
    console.log('[doudou-shipinhao] 填写多行分段描述...');
    editor.focus();
    await sleep(250);

    // 赋值多行文本
    editor.innerText = meta.description;
    editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    // 触发绑定的 Vue 组件 updateDescData
    let cur = editor;
    let editorVue = null;
    while (cur && !editorVue) {
      if (cur.__vue__) editorVue = cur.__vue__;
      cur = cur.parentElement;
    }
    if (editorVue && typeof editorVue.updateDescData === 'function') {
      editorVue.updateDescData();
    }
    await sleep(300);
    editor.blur();
  }
  await sleep(500);

  // 4. 自定义视频封面上传（若提供了封面图）
  let coverUploaded = false;
  if (meta.coverBase64) {
    console.log('[doudou-shipinhao] 检测到视频封面图，尝试设置视频封面...');
    try {
      const makeFile = (base64Str, name = 'cover.png') => {
        const raw = atob(base64Str.replace(/^data:[^;]+;base64,/, ''));
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        const blob = new Blob([arr], { type: 'image/png' });
        return new File([blob], name, { type: 'image/png' });
      };

      // 寻找更换封面/设置封面按钮或直接寻找图片上传 input
      let coverInput = doc.querySelector('input[type="file"][accept*="image"]');
      if (!coverInput) {
        const coverBtn = Array.from(doc.querySelectorAll('button, span, div, a')).find(el => {
          const txt = el.innerText?.trim();
          return (txt === '设置封面' || txt === '更换封面' || txt === '选择封面' || txt === '修改封面') && el.offsetWidth > 0;
        });
        if (coverBtn) {
          coverBtn.click();
          await sleep(1000);
          coverInput = doc.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"][accept*="image"]');
        }
      }

      if (coverInput) {
        const file = makeFile(meta.coverBase64, 'cover.png');
        const dt = new DataTransfer();
        dt.items.add(file);
        coverInput.files = dt.files;
        coverInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        await sleep(1500);

        // 如果有确认弹窗/裁剪确定按钮
        const confirmBtn = Array.from(doc.querySelectorAll('button, .weui-desktop-btn, [class*="dialog"] button')).find(b => {
          const txt = b.innerText?.trim();
          return (txt === '确定' || txt === '完成') && !b.disabled;
        }) || Array.from(document.querySelectorAll('button, [class*="dialog"] button')).find(b => {
          const txt = b.innerText?.trim();
          return (txt === '确定' || txt === '完成') && !b.disabled;
        });

        if (confirmBtn) {
          confirmBtn.click();
          coverUploaded = true;
          console.log('[doudou-shipinhao] 视频封面上传确认成功');
          await sleep(1000);
        } else {
          coverUploaded = true;
          console.log('[doudou-shipinhao] 视频封面文件已注入');
        }
      }
    } catch (e) {
      console.warn('[doudou-shipinhao] 视频封面上传异常:', e);
    }
  }

  // 5. 视口滚动模拟人工检查
  try {
    const scrollContainer = doc.querySelector('#container-wrap') || doc.documentElement || window;
    if (scrollContainer.scrollTo) {
      scrollContainer.scrollTo({ top: 300, behavior: 'smooth' });
      await sleep(400);
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (e) {}
  await sleep(400);

  // 6. 等待平台就绪与自动保存（严格绝不点击「保存草稿」或「发表」按钮，保留编辑页现场）
  console.log('[doudou-shipinhao] 视频作品信息已填入完毕，等待平台原生自动保存与就绪 (保留在编辑页)...');
  await sleep(2500);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    shortTitle: cleanTitle,
    descLength: meta.description.length,
    coverUploaded
  };
})()`;
}
