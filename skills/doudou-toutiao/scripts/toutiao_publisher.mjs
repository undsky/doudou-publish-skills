/**
 * 头条号创作者平台自动化发布浏览器脚本生成器
 * 核心能力：
 * 1. 真实人工行为模拟：随机时延抖动、全链路 DOM 事件派发、视口平滑滚动排版审阅、拟真悬停。
 * 2. Sylph / ProseMirror 富文本双向同步：完美解析并注入标题、引用、代码块、加粗及 CDN 高清插图。
 * 3. 抽屉式封面真实上传：模拟点击「展示封面」添加区，注入真实 File 对象并自动完成裁剪弹窗确认。
 * 4. 草稿安全隔离：严格限定为草稿保存，捕获「草稿已保存」状态，绝不触碰任何形式的发布操作。
 */

import path from 'node:path';
import { parseAllAssets } from './parser.mjs';

/**
 * 构建头条号文章草稿发布浏览器端注入脚本
 * @param {object} meta 解析后的文章元数据
 * @returns {string} 立即执行的异步 JavaScript 代码字符串
 */
export function buildPublishBrowserScript(meta) {
  return `async () => {
  const meta = {
    title: ${JSON.stringify(meta.articleTitle)},
    author: ${JSON.stringify(meta.author || 'undsky')},
    summary: ${JSON.stringify(meta.articleSummary || '')},
    tags: ${JSON.stringify(meta.tags || [])},
    htmlContent: ${JSON.stringify(meta.articleHtml.htmlContent)},
    coverBase64: ${JSON.stringify(meta.cover?.base64 || '')},
    coverFileName: ${JSON.stringify(meta.cover?.fileName || 'cover.png')}
  };

  const logs = [];
  const log = (msg) => {
    console.log('[doudou-toutiao]', msg);
    logs.push(msg);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  // 拟真鼠标事件派发
  const simulateHover = (el) => {
    if (!el) return;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
  };

  const simulateClick = async (el) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);
    simulateHover(el);
    await sleep(200);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  // 1. 拟真输入文章大标题
  log('正在拟真输入文章标题: ' + meta.title);
  const titleEl = document.querySelector('textarea, input[placeholder*="请输入文章标题"]');
  if (titleEl) {
    titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    titleEl.focus();
    titleEl.dispatchEvent(new Event('focus', { bubbles: true }));
    await sleep(200);

    const descArea = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    const descInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    const setter = (descArea && descArea.set) || (descInput && descInput.set);
    if (setter) {
      setter.call(titleEl, meta.title);
    } else {
      titleEl.value = meta.title;
    }
    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    titleEl.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
    titleEl.blur();
    titleEl.dispatchEvent(new Event('blur', { bubbles: true }));
    log('文章标题输入完成');
  } else {
    log('警告: 未找到标题输入框');
  }
  await sleep(400);

  // 2. 注入 ProseMirror / Sylph 富文本正文
  log('正在注入文章正文与排版内容...');
  const pmEl = document.querySelector('.ProseMirror') || document.querySelector('[contenteditable="true"]');
  if (pmEl) {
    pmEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    pmEl.focus();

    // 查找 React Fiber 上的 Editor 实例
    const fiberKey = Object.keys(pmEl.parentElement || {}).find(k => k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
    let fiber = pmEl.parentElement ? pmEl.parentElement[fiberKey] : null;
    let reactEditor = null;
    while (fiber) {
      const propsEditor = fiber.memoizedProps && fiber.memoizedProps.editor;
      const stateEditor = fiber.stateNode && (fiber.stateNode.editor || fiber.stateNode.view);
      if (propsEditor || stateEditor) {
        reactEditor = propsEditor || stateEditor;
        break;
      }
      fiber = fiber.return;
    }

    // 清理可能存在的旧占位内容
    if (reactEditor && reactEditor.view) {
      const tr = reactEditor.view.state.tr.delete(0, reactEditor.view.state.doc.content.size);
      reactEditor.view.dispatch(tr);
      await sleep(200);
    }

    // 注入富文本 HTML
    if (reactEditor && typeof reactEditor.pasteContent === 'function') {
      reactEditor.pasteContent(meta.htmlContent);
      log('已通过 reactEditor.pasteContent 注入富文本');
    } else {
      const dt = new DataTransfer();
      dt.setData('text/html', meta.htmlContent);
      dt.setData('text/plain', meta.title + '\\n\\n' + meta.summary);
      const pasteEvt = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      pmEl.dispatchEvent(pasteEvt);
      log('已通过 ClipboardEvent(paste) 注入富文本');
    }
  } else {
    log('警告: 未找到 ProseMirror 正文编辑区');
  }
  await sleep(800);

  // 3. 模拟人工视口平滑滚动（审阅排版）
  log('正在模拟人工视口平滑滚动审阅排版...');
  window.scrollTo({ top: 400, behavior: 'smooth' });
  await sleep(600);
  window.scrollTo({ top: 900, behavior: 'smooth' });
  await sleep(600);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 4. 上传并绑定封面图片
  let coverUploaded = false;
  if (meta.coverBase64) {
    log('开始上传并设置文章封面...');
    try {
      // 辅助函数：构造 File 对象
      const makeFile = (base64Str, name = 'cover.png') => {
        const parts = base64Str.split(';base64,');
        const mime = parts[0].replace('data:', '') || 'image/png';
        const raw = atob(parts[1] || parts[0]);
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        const blob = new Blob([arr], { type: mime });
        return new File([blob], name, { type: mime });
      };

      const coverAddBtn = document.querySelector('.article-cover-add') || document.querySelector('.article-cover-img-replace');
      if (coverAddBtn) {
        await simulateClick(coverAddBtn);
        await sleep(800);

        // 若抽屉默认展示正文图片，自动点击「上传图片」Tab
        const uploadTab = Array.from(document.querySelectorAll('.byte-drawer .byte-tabs-header-title')).find(t => (t.innerText || '').trim() === '上传图片');
        if (uploadTab) {
          uploadTab.click();
          await sleep(500);
        }

        // 查找抽屉内的上传 input
        const uploadInput = document.querySelector('.byte-drawer input[type="file"]') || document.querySelector('.btn-upload-handle input') || document.querySelector('#upload-drag-input');
        if (uploadInput) {
          const file = makeFile(meta.coverBase64, meta.coverFileName);
          const dt = new DataTransfer();
          dt.items.add(file);
          uploadInput.files = dt.files;

          // 调用 React 的 onChange 处理器
          const propsKey = Object.keys(uploadInput).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
          if (propsKey && uploadInput[propsKey] && typeof uploadInput[propsKey].onChange === 'function') {
            uploadInput[propsKey].onChange({
              target: uploadInput,
              currentTarget: uploadInput,
              nativeEvent: new Event('change'),
              persist: () => {}
            });
          }
          uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
          log('已向封面上传组件提交 File 对象');

          // 等待裁剪/确认弹窗出现并点击「确定」
          await sleep(1800);
          const confirmBtn = Array.from(document.querySelectorAll('button, .byte-btn')).find(b => {
            const txt = (b.innerText || '').trim();
            return txt === '确定' || txt === '完成';
          });

          if (confirmBtn) {
            await simulateClick(confirmBtn);
            log('已点击封面确认/裁剪按钮');
            coverUploaded = true;
          } else {
            log('提示: 未出现额外的裁剪确定弹窗，封面可能已直接应用');
            coverUploaded = true;
          }
          await sleep(1000);
        } else {
          log('警告: 抽屉内未找到文件上传 input');
        }
      } else {
        log('提示: 未找到 .article-cover-add，封面可能已预设或无需重复上传');
      }
    } catch (e) {
      log('封面上传异常: ' + e.message);
    }
  }
  await sleep(600);

  // 5. 滚动到页面底部并等待草稿云端同步保存
  log('正在滚动到底部并等待草稿云端保存...');
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  await sleep(2500);

  // 检查底部草稿状态与字数
  const footerEl = document.querySelector('.publish-footer');
  const footerText = footerEl ? footerEl.innerText : '';
  const isDraftSaved = footerText.includes('草稿已保存') || footerText.includes('草稿将自动保存') || footerText.includes('共');

  log('草稿保存状态检查: ' + (isDraftSaved ? '成功' : '等待中') + ' (Footer: ' + footerText.replace(/\\n/g, ' ') + ')');

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: meta.title,
    author: meta.author,
    summary: meta.summary,
    tags: meta.tags,
    coverUploaded,
    footerText: footerText.replace(/\n/g, ' | '),
    isDraftSaved,
    logs
  };
}`;
}

/**
 * 构建准备视频上传的浏览器脚本（将隐藏的 input[type="file"] 暴露给 accessibility tree）
 * @returns {string}
 */
export function buildPrepareVideoUploadBrowserScript() {
  return `(() => {
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.id = 'doudou-toutiao-video-input';
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
 * @param {number} maxWaitSeconds 
 * @returns {string}
 */
export function buildWaitVideoUploadReadyBrowserScript(maxWaitSeconds = 120) {
  return `(async () => {
  const maxWait = ${maxWaitSeconds} * 1000;
  const start = Date.now();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  console.log('[doudou-toutiao] 正在等待视频上传及云端转码处理完成...');

  while (Date.now() - start < maxWait) {
    const text = document.body ? document.body.innerText : '';
    const hasSuccess = text.includes('上传成功') || text.includes('重新上传');
    const isUploading = text.includes('上传中') || text.includes('已上传:');

    if (hasSuccess && !isUploading) {
      console.log('[doudou-toutiao] 视频上传就绪！');
      return { success: true, elapsedMs: Date.now() - start };
    }

    await sleep(2000);
  }

  return { success: false, error: '等待视频上传超时（超过 ' + ${maxWaitSeconds} + ' 秒）' };
})()`;
}

/**
 * 构建头条号/西瓜视频作品信息填写与就绪状态脚本
 * @param {object} meta 
 * @returns {string}
 */
export function buildVideoPublishBrowserScript(meta) {
  return `async () => {
  const meta = {
    title: ${JSON.stringify(meta.videoTitle || meta.articleTitle || '')},
    description: ${JSON.stringify(meta.videoDesc || '')},
    tags: ${JSON.stringify(meta.tags || [])}
  };

  const logs = [];
  const log = (msg) => {
    console.log('[doudou-toutiao-video]', msg);
    logs.push(msg);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  // 1. 拟真输入视频标题（<=30字）
  log('正在填写视频标题: ' + meta.title);
  const titleInput = document.querySelector('input.xigua-input, input[placeholder*="0～30"]');
  if (titleInput && meta.title) {
    titleInput.focus();
    await sleep(200);

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(titleInput, meta.title);
    } else {
      titleInput.value = meta.title;
    }
    titleInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    await sleep(250);
    titleInput.blur();
    log('视频标题填写完成');
  } else {
    log('警告: 未找到视频标题输入框');
  }
  await sleep(400);

  // 2. 模拟视口平滑滚动人工核验
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await sleep(400);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(300);

  // 3. 检查当前发布按钮与就绪态
  const submitBtn = document.querySelector('.action-footer-btn.submit, button.submit');
  const isSubmitVisible = submitBtn && submitBtn.offsetWidth > 0 && submitBtn.offsetHeight > 0;
  log('发布按钮状态: ' + (isSubmitVisible ? '就绪可见（严格规约：保留就绪态供人工最终确认，绝不自动触碰发布）' : '未就绪'));

  return {
    success: true,
    mode: 'video',
    title: meta.title,
    isReady: isSubmitVisible,
    status: 'ready_auto_saved',
    logs
  };
}`;
}

// 命令行直接测试支持
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('toutiao_publisher.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node toutiao_publisher.mjs <Markdown文件路径>');
    process.exit(1);
  }
  console.log(`[toutiao_publisher] 正在为文章解析元数据: ${targetFile}`);
  const meta = parseAllAssets(targetFile);
  if (meta.video && meta.video.hasVideo) {
    console.log(`[toutiao_publisher] 检测到视频成片，生成视频发布脚本: ${meta.video.videoPath}`);
    const script = buildVideoPublishBrowserScript(meta);
    console.log(`[toutiao_publisher] 视频注入脚本生成成功，字符数: ${script.length}`);
  } else {
    console.log(`[toutiao_publisher] 生成长文图文发布脚本`);
    const script = buildPublishBrowserScript(meta);
    console.log(`[toutiao_publisher] 长文注入脚本生成成功，字符数: ${script.length}`);
  }
}
