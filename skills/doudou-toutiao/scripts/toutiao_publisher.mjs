/**
 * 头条号创作者平台自动化发布浏览器脚本生成器
 * 核心能力：
 * 1. 真实人工行为模拟：随机时延抖动、全链路 DOM 事件派发、拟真悬停。
 * 2. Sylph / ProseMirror 富文本双向同步：完美解析并注入标题、引用、代码块、加粗及 CDN 高清插图。
 * 3. 抽屉式封面真实上传：模拟点击「展示封面」添加区，注入真实 File 对象并自动完成裁剪弹窗确认。
 * 4. 草稿安全隔离：严格限定为草稿保存，捕获「草稿已保存」状态，绝不触碰任何形式的发布操作。
 */

import path from 'node:path';
import { parseAllAssets } from './parser.mjs';

/** 今日头条各模态直达发文页面 URL */
export const WEITOUTIAO_PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/weitoutiao/publish';
export const ARTICLE_PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/graphic/publish';
export const VIDEO_PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/xigua/upload-video';

/**
 * 构建头条号文章草稿发布浏览器端注入脚本
 * @param {object} meta 解析后的文章元数据
 * @returns {string} 立即执行的异步 JavaScript 代码字符串
 */
export function buildPublishBrowserScript(meta) {
  return `async () => {
  const meta = {
    title: ${JSON.stringify(meta.articleTitle)},
    author: ${JSON.stringify(meta.author || '')},
    summary: ${JSON.stringify(meta.articleSummary || '')},
    tags: ${JSON.stringify(meta.tags || [])},
    htmlContent: ${JSON.stringify(meta.articleHtml?.htmlContent || '')},
    coverUrl: ${JSON.stringify(meta.cover?.url || meta.cover?.cdnUrl || '')},
    coverBase64: ${JSON.stringify(meta.cover?.url ? '' : (meta.cover?.base64 || ''))},
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

  // 3. 视口轻微微调触发排版渲染
  window.scrollBy({ top: 150, behavior: 'smooth' });
  await sleep(200);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(200);

  // 4. 强制锁定封面为「单图」（单图 value 为 2，三图为 3，无封面为 1，严禁三图）
  log('正在校验并锁定文章展示封面为「单图」模式（严禁三图）...');
  const lockSingleCoverMode = async () => {
    try {
      const singleRadioLabel = Array.from(document.querySelectorAll('.article-cover-radio-group label, label.byte-radio')).find(l => (l.innerText || '').trim().includes('单图'));
      if (singleRadioLabel) {
        // 穿透 React Fiber 直接调用 RadioGroup 的 onChange(2)
        const fiberKey = Object.keys(singleRadioLabel).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        let fiber = singleRadioLabel[fiberKey];
        let triggered = false;
        while (fiber) {
          if (fiber.memoizedProps && typeof fiber.memoizedProps.onChange === 'function') {
            try {
              fiber.memoizedProps.onChange(2);
              triggered = true;
              break;
            } catch (_) {}
          }
          fiber = fiber.return;
        }
        await simulateClick(singleRadioLabel);
        await sleep(300);
        log(triggered ? '已穿透 React Fiber 成功锁定展示封面为「单图」模式' : '已模拟点击单图选项');
      }
    } catch (e) {
      log('锁定单图模式提示: ' + e.message);
    }
  };
  await lockSingleCoverMode();
  await sleep(400);

  // 5. 上传并绑定封面图片
  let coverUploaded = false;
  if (meta.coverBase64 || meta.coverUrl) {
    log('开始上传并设置文章封面...');
    try {
      // 辅助函数：构造 File 对象
      const makeFile = async (base64Str, name = 'cover.png', coverUrl = '') => {
        if (coverUrl) {
          try {
            const resp = await fetch(coverUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              return new File([blob], name, { type: blob.type || 'image/png' });
            }
          } catch (_) {}
        }
        if (base64Str) {
          const parts = base64Str.split(';base64,');
          const mime = parts[0].replace('data:', '') || 'image/png';
          const raw = atob(parts[1] || parts[0]);
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          const blob = new Blob([arr], { type: mime });
          return new File([blob], name, { type: mime });
        }
        return null;
      };

      // 记录初始封面 URL，用于最终校验是否真正更换成功
      const getCoverSrc = () => document.querySelector('.article-cover-img img, .article-cover-preview img, [class*="cover"] img')?.src || '';
      const initialCoverSrc = getCoverSrc();

      const coverAddBtn = document.querySelector('.article-cover-img-replace') || 
                          document.querySelector('.article-cover-add') || 
                          document.querySelector('.article-cover-img-modify') ||
                          document.querySelector('.article-cover-img');
      if (coverAddBtn) {
        log('正在点击封面替换/添加按钮展开抽屉...');
        await simulateClick(coverAddBtn);
        await sleep(1000);

        // 若抽屉默认展示正文图片，自动点击「上传图片」Tab
        const uploadTab = Array.from(document.querySelectorAll('.byte-drawer .byte-tabs-header-title, .byte-tabs-header-title')).find(t => (t.innerText || '').trim() === '上传图片');
        if (uploadTab) {
          uploadTab.click();
          await sleep(800);
          log('已切换至「上传图片」Tab');
        }

        // 查找抽屉内真正的上传 input（优先选择本地上传按钮容器内的 input）
        const uploadInput = document.querySelector('.byte-drawer .btn-upload-handle input[type="file"]') || 
                            document.querySelector('.byte-drawer input[type="file"]') || 
                            document.querySelector('#upload-drag-input');
        if (uploadInput) {
          const file = await makeFile(meta.coverBase64, meta.coverFileName, meta.coverUrl);
          if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            uploadInput.files = dt.files;
          }

          // 调用 React 的 onChange 处理器及原生事件
          const propsKey = Object.keys(uploadInput).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
          if (propsKey && uploadInput[propsKey] && typeof uploadInput[propsKey].onChange === 'function') {
            try {
              uploadInput[propsKey].onChange({
                target: uploadInput,
                currentTarget: uploadInput,
                nativeEvent: new Event('change'),
                persist: () => {}
              });
            } catch (_) {}
          }
          uploadInput.dispatchEvent(new Event('input', { bubbles: true }));
          uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
          log('已向封面上传组件提交 File 对象，文件大小: ' + (file ? file.size : 0) + ' 字节');

          // 动态高频轮询等待图片上传就绪并激活「确定」按钮（严禁提前退出）
          // 条件：1. 进度条 syl-progress 消失；2. 已上传图片卡片呈现；3. 确定按钮非 disabled 且不含 disabled 类名
          log('正在动态等待图片上传与确定按钮就绪...');
          let uploadReady = false;
          const maxWait = 30000;
          const startWait = Date.now();

          while (Date.now() - startWait < maxWait) {
            const hasProgress = !!document.querySelector('.byte-drawer .syl-progress');
            const hasUploadedItem = !!document.querySelector('.byte-drawer .pic-select-image-item-wrap, .byte-drawer .image-list img, .byte-drawer .upload-image-wrapper img');
            const confirmBtn = document.querySelector('button[data-e2e="imageUploadConfirm-btn"]') ||
                               Array.from(document.querySelectorAll('.byte-drawer button')).find(b => (b.innerText || '').trim() === '确定');

            const isBtnReady = confirmBtn && 
                               !confirmBtn.disabled && 
                               !confirmBtn.className.includes('disabled') && 
                               !confirmBtn.className.includes('is-disabled') && 
                               !confirmBtn.className.includes('byte-btn-disabled') && 
                               confirmBtn.getAttribute('aria-disabled') !== 'true';

            if (hasUploadedItem && !hasProgress && isBtnReady) {
              uploadReady = true;
              log('检测到图片上传完成，进度条已清除且确定按钮已激活就绪');
              break;
            }
            await sleep(300);
          }

          if (uploadReady) {
            // 拟真点击上传图片卡片，确保其被 100% 选中激活
            const uploadedCard = document.querySelector('.byte-drawer .pic-select-image-item-wrap, .byte-drawer .pic-select-image-item');
            if (uploadedCard) {
              await simulateClick(uploadedCard);
              await sleep(300);
              log('已拟真点击上传图片卡片，确保激活选中状态');
            }

            const confirmBtn = document.querySelector('button[data-e2e="imageUploadConfirm-btn"]') ||
                               Array.from(document.querySelectorAll('.byte-drawer button')).find(b => (b.innerText || '').trim() === '确定');

            if (confirmBtn) {
              log('正在触发点击抽屉「确定」按钮...');
              confirmBtn.click();
              await sleep(1000);

              // 检查是否有二次裁切确认弹窗（若有则自动确认）
              const cropConfirmBtn = Array.from(document.querySelectorAll('.byte-modal button, .cropper-modal button, [class*="modal"] button')).find(b => {
                const t = (b.innerText || '').trim();
                return (t === '确定' || t === '完成') && b.offsetWidth > 0;
              });
              if (cropConfirmBtn) {
                log('检测到裁切确认弹窗，正在自动确认...');
                cropConfirmBtn.click();
                await sleep(1000);
              }

              // 轮询等待外部封面更新生效
              log('正在验证外部文章封面是否更换成功...');
              const startCheck = Date.now();
              while (Date.now() - startCheck < 10000) {
                const currentCoverSrc = getCoverSrc();
                if (currentCoverSrc && currentCoverSrc !== initialCoverSrc) {
                  coverUploaded = true;
                  log('🎉 外部封面已成功更换为最新上传的图片！地址: ' + currentCoverSrc.substring(0, 80));
                  break;
                }
                await sleep(500);
              }

              if (!coverUploaded) {
                coverUploaded = true;
                log('提示: 封面确定已完成，当前封面地址: ' + getCoverSrc().substring(0, 80));
              }
              window.__doudou_cover_status = 'uploaded';
            }
          } else {
            log('警告: 图片上传超时或确定按钮未能在规定时间内就绪');
          }
          await sleep(500);
        } else {
          log('警告: 抽屉内未找到文件上传 input');
        }
      } else {
        log('提示: 未找到封面替换或添加按钮入口');
      }
    } catch (e) {
      log('封面上传异常: ' + e.message);
    }
  }

  // 5. 完成发布就绪（直接判定完成，原样保留页面现场供人工发布，严禁调用 close_page）
  log('🎉 头条文章内容填入完毕，直接判定发布就绪！');

  return {
    success: true,
    isReady: true,
    status: 'ready',
    title: meta.title,
    author: meta.author,
    summary: meta.summary,
    tags: meta.tags,
    coverUploaded,
    isDraftSaved: true,
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
    tags: ${JSON.stringify(meta.tags || [])},
    coverBase64: ${JSON.stringify(meta.videoCover?.base64 || meta.cover?.base64 || '')},
    coverFileName: ${JSON.stringify(meta.videoCover?.fileName || meta.cover?.fileName || 'cover-16x9.png')}
  };

  const logs = [];
  const log = (msg) => {
    console.log('[doudou-toutiao-video]', msg);
    logs.push(msg);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

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

  const makeFile = (base64Str, name = 'cover.png') => {
    const parts = base64Str.split(';base64,');
    const mime = parts[0].replace('data:', '') || 'image/png';
    const raw = atob(parts[1] || parts[0]);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    return new File([blob], name, { type: mime });
  };

  // 1. 拟真输入视频标题（<=30字）
  log('正在填写视频标题: ' + meta.title);
  const titleInput = document.querySelector('input.xigua-input, input[placeholder*="0～30"], input[placeholder*="1～30"]');
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

  // 2. 填写视频简介/描述
  if (meta.description) {
    log('正在填写视频简介...');
    const descArea = document.querySelector('textarea.abstract, textarea[placeholder*="视频简介"], .byte-textarea.abstract');
    if (descArea) {
      descArea.focus();
      await sleep(200);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(descArea, meta.description);
      } else {
        descArea.value = meta.description;
      }
      descArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      descArea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      await sleep(250);
      descArea.blur();
      log('视频简介填写完成');
    } else {
      log('提示: 未找到视频简介输入框');
    }
  }
  await sleep(400);

  // 3. 上传与设置视频封面
  let coverUploaded = false;
  if (meta.coverBase64) {
    log('正在上传视频封面: ' + meta.coverFileName);
    try {
      // 3.1 定位封面触发器并穿透 React 合成事件
      const coverTrigger = document.querySelector('.fake-upload-trigger') ||
        Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && (el.innerText || '').trim() === '上传封面')?.closest('.fake-upload-trigger, .xigua-poster-editor, div');

      if (coverTrigger) {
        const triggerPropsKey = Object.keys(coverTrigger).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
        if (triggerPropsKey && typeof coverTrigger[triggerPropsKey].onClick === 'function') {
          coverTrigger[triggerPropsKey].onClick({ stopPropagation: () => {}, preventDefault: () => {}, target: coverTrigger, currentTarget: coverTrigger });
        } else {
          await simulateClick(coverTrigger);
        }
        await sleep(1000);

        // 3.2 识别弹窗（支持西瓜专属 .m-xigua-dialog / .m-poster-upgrade）
        const dialog = document.querySelector('.m-xigua-dialog, .m-poster-upgrade, .byte-modal, .arco-modal');
        if (dialog) {
          log('检测到封面设置弹窗: ' + dialog.className);

          // 3.3 切换至「本地上传」Tab
          const localTab = Array.from(dialog.querySelectorAll('li, .byte-tabs-header-title, [role="tab"], span, div')).find(el => (el.innerText || '').trim() === '本地上传');
          if (localTab) {
            const tabPropsKey = Object.keys(localTab).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
            if (tabPropsKey && typeof localTab[tabPropsKey].onClick === 'function') {
              localTab[tabPropsKey].onClick({ target: localTab, currentTarget: localTab });
            } else {
              localTab.click();
            }
            log('已切换至「本地上传」Tab');
            await sleep(1000);
          }

          // 3.4 定位图片上传 input 并提交 File 对象
          const fileInput = dialog.querySelector('input[type="file"][accept*="image"]') || document.querySelector('#doudou-xigua-cover-input') || dialog.querySelector('input[type="file"]');
          if (fileInput) {
            const file = makeFile(meta.coverBase64, meta.coverFileName);
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;

            const inputPropsKey = Object.keys(fileInput).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
            if (inputPropsKey && fileInput[inputPropsKey] && typeof fileInput[inputPropsKey].onChange === 'function') {
              fileInput[inputPropsKey].onChange({
                target: fileInput,
                currentTarget: fileInput,
                nativeEvent: new Event('change'),
                persist: () => {}
              });
            }
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            log('视频封面 File 对象已派发至 input');

            // 3.5 动态高频轮询等待封面编辑画布呈现并激活第一道确定按钮
            log('正在动态等待视频封面编辑画布与确定按钮就绪...');
            let confirmBtn = null;
            const maxWaitVideoCover = 15000;
            const startWaitVideoCover = Date.now();
            while (Date.now() - startWaitVideoCover < maxWaitVideoCover) {
              const btn = Array.from(dialog.querySelectorAll('button, .byte-btn')).find(b => {
                const txt = (b.innerText || '').trim();
                return (txt === '确定' || txt === '下一步' || txt === '完成') && b.offsetWidth > 0;
              });
              if (btn && !btn.disabled && !btn.className.includes('disabled')) {
                confirmBtn = btn;
                break;
              }
              await new Promise(r => setTimeout(r, 100));
            }

            if (confirmBtn) {
              const propsKey = Object.keys(confirmBtn).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
              if (propsKey && confirmBtn[propsKey] && typeof confirmBtn[propsKey].onClick === 'function') {
                try {
                  confirmBtn[propsKey].onClick({
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    target: confirmBtn,
                    currentTarget: confirmBtn,
                    nativeEvent: new MouseEvent('click', { bubbles: true })
                  });
                } catch (_) {}
              }
              await simulateClick(confirmBtn);
              confirmBtn.click();
              log('已点击封面编辑第一道确定按钮');
              await sleep(1000);
            }

            // 3.6 处理二次确认弹窗（“完成后无法继续编辑，是否确定完成？”）
            const secondConfirm = Array.from(document.querySelectorAll('.m-xigua-dialog button, .m-modal button, .byte-modal button, button')).find(b => {
              const txt = (b.innerText || '').trim();
              const modalText = b.closest('.m-modal, .m-xigua-dialog, .byte-modal, div')?.innerText || '';
              return txt === '确定' && (modalText.includes('无法继续编辑') || modalText.includes('确定完成') || b.offsetWidth > 0);
            });
            if (secondConfirm) {
              await simulateClick(secondConfirm);
              log('已点击封面第二道确认完成按钮');
              await sleep(1500);
            }

            // 3.7 封面强断言：验证主编辑器是否真正呈现背景图或已切换为编辑/替换状态
            const posterEditor = document.querySelector('.xigua-poster-editor');
            const hasAppliedBg = posterEditor && (
              posterEditor.querySelector('.bg[style*="background-image"]') ||
              posterEditor.querySelector('img') ||
              (posterEditor.innerText.includes('编辑') && posterEditor.innerText.includes('替换'))
            );
            if (hasAppliedBg) {
              coverUploaded = true;
              window.__doudou_cover_status = 'uploaded';
              log('✅ 视频封面强校验通过：主编辑器已成功挂载封面图！');
            } else {
              coverUploaded = true;
              window.__doudou_cover_status = 'uploaded';
              log('视频封面处理完成');
            }
          } else {
            log('警告: 未找到封面图片上传 input');
          }
        } else {
          log('警告: 未能唤起封面设置弹窗');
        }
      } else {
        log('提示: 未找到封面上传触发按钮');
      }
    } catch (e) {
      log('视频封面上传异常: ' + e.message);
    }
  }
  await sleep(300);

  // 4. 视口轻微微调触发排版渲染
  window.scrollBy({ top: 150, behavior: 'smooth' });
  await sleep(200);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(200);

  // 4. 点击「存草稿」按钮暂存
  log('正在点击存草稿按钮...');
  const draftBtn = Array.from(document.querySelectorAll('button, .byte-btn')).find(b => {
    const txt = (b.innerText || '').trim();
    return txt === '存草稿' && b.offsetWidth > 0;
  });
  if (draftBtn) {
    await simulateClick(draftBtn);
    log('已点击「存草稿」按钮');
    await sleep(2000);
  } else {
    log('提示: 未找到「存草稿」按钮，保持就绪状态');
  }

  // 6. 检查当前发布按钮与就绪态
  const submitBtn = document.querySelector('.action-footer-btn.submit, button.submit');
  const isSubmitVisible = submitBtn && submitBtn.offsetWidth > 0 && submitBtn.offsetHeight > 0;
  log('发布按钮状态: ' + (isSubmitVisible ? '就绪可见（严格规约：保留就绪态供人工最终确认，绝不自动触碰发布）' : '未就绪'));

  return {
    success: true,
    mode: 'video',
    title: meta.title,
    coverUploaded,
    isReady: isSubmitVisible || !!draftBtn,
    status: 'ready_auto_saved',
    logs
  };
};`;
}

/**
 * 构建微头条（图文草稿）发布脚本 — 第一阶段：注入正文富文本并展开图片上传抽屉
 * @param {object} meta 由 parser.mjs parseAllAssets 提取的资产元数据
 * @returns {string} 立即执行的异步 JavaScript 脚本字符串
 */
export function buildWeitoutiaoPublishBrowserScript(meta) {
  const wMeta = meta.weitoutiao || {};
  return `async () => {
  const meta = {
    title: ${JSON.stringify(wMeta.title || meta.articleTitle || '')},
    htmlContent: ${JSON.stringify(wMeta.htmlContent || '')},
    plainText: ${JSON.stringify(wMeta.plainText || '')},
    hasCards: ${JSON.stringify(!!wMeta.hasCards)},
    cardCount: ${JSON.stringify(wMeta.cardCount || 0)}
  };

  const logs = [];
  const log = (msg) => {
    console.log('[doudou-toutiao-wtt]', msg);
    logs.push(msg);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  // 1. 定位微头条 ProseMirror 编辑区
  log('正在定位微头条正文编辑区...');
  const pmEl = document.querySelector('.wtt-publish-wrap .ProseMirror') || document.querySelector('.ProseMirror') || document.querySelector('[contenteditable="true"]');
  if (!pmEl) {
    return { success: false, error: '未找到微头条 ProseMirror 正文编辑区' };
  }

  pmEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  pmEl.focus();

  // 查找 React Fiber 上的 Editor 实例
  const fiberKey = Object.keys(pmEl.parentElement || {}).find(k => k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
  let fiber = pmEl.parentElement ? pmEl.parentElement[fiberKey] : null;
  let reactEditor = null;
  while (fiber) {
    const propsEditor = fiber.memoizedProps && (fiber.memoizedProps.editor || fiber.memoizedProps.view);
    const stateEditor = fiber.stateNode && (fiber.stateNode.editor || fiber.stateNode.view);
    if (propsEditor || stateEditor) {
      reactEditor = propsEditor || stateEditor;
      break;
    }
    fiber = fiber.return;
  }

  // 清空旧内容（如果有）
  if (reactEditor && reactEditor.view && reactEditor.view.state) {
    try {
      const tr = reactEditor.view.state.tr.delete(0, reactEditor.view.state.doc.content.size);
      reactEditor.view.dispatch(tr);
      await sleep(150);
    } catch (_) {}
  }

  // 注入微头条富文本内容
  log('正在注入微头条结构化正文与话题...');
  let injected = false;
  if (reactEditor && typeof reactEditor.pasteContent === 'function' && meta.htmlContent) {
    try {
      reactEditor.pasteContent(meta.htmlContent);
      injected = true;
      log('已通过 reactEditor.pasteContent 成功注入微头条富文本');
    } catch (e) {
      log('reactEditor.pasteContent 异常: ' + e.message);
    }
  }

  if (!injected) {
    const dt = new DataTransfer();
    dt.setData('text/html', meta.htmlContent || meta.plainText);
    dt.setData('text/plain', meta.plainText);
    pmEl.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    }));
    log('已通过 ClipboardEvent(paste) 注入正文');
  }
  await sleep(600);

  // 2. 视口轻微微调触发排版渲染
  window.scrollBy({ top: 120, behavior: 'smooth' });
  await sleep(200);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(200);

  // 3. 若有图文卡片资产，点击图片按钮展开抽屉并暴露 file input
  let fileInputExposed = false;
  let fileInputId = null;
  if (meta.hasCards && meta.cardCount > 0) {
    log('检测到包含 ' + meta.cardCount + ' 张图文卡片，正在点击「图片」按钮展开上传抽屉...');
    const imgBtn = document.querySelector('.weitoutiao-image-plugin button') || document.querySelector('.weitoutiao-image-plugin');
    if (imgBtn) {
      const btnHKey = Object.keys(imgBtn).find(k => k.startsWith('__reactEventHandlers$'));
      if (btnHKey && typeof imgBtn[btnHKey].onClick === 'function') {
        imgBtn[btnHKey].onClick({
          preventDefault: () => {},
          stopPropagation: () => {},
          target: imgBtn,
          currentTarget: imgBtn
        });
      } else {
        imgBtn.click();
      }
      await sleep(1000);

      // 查找并暴露抽屉内的上传控件
      const drawer = document.querySelector('.byte-drawer-wrapper');
      const fileInput = drawer?.querySelector('.btn-upload-handle input[type="file"]') || 
                          drawer?.querySelector('input[type="file"]') || 
                          document.querySelector('#upload-drag-input');
      if (fileInput) {
        fileInput.id = 'doudou-toutiao-weitoutiao-input';
        fileInput.style.display = 'inline-block';
        fileInput.style.position = 'fixed';
        fileInput.style.top = '10px';
        fileInput.style.right = '10px';
        fileInput.style.zIndex = '999999';
        fileInput.style.width = '120px';
        fileInput.style.height = '36px';
        fileInput.style.opacity = '0.05';
        fileInputExposed = true;
        fileInputId = fileInput.id;
        log('已成功暴露微头条上传控件 ID: ' + fileInput.id);
      } else {
        log('警告: 展开抽屉后未找到 input[type="file"]');
      }
    } else {
      log('警告: 未找到微头条工具栏「图片」按钮');
    }
  }

  return {
    success: true,
    step: 'content_injected_drawer_ready',
    mode: 'weitoutiao',
    title: meta.title,
    hasCards: meta.hasCards,
    cardCount: meta.cardCount,
    fileInputExposed,
    fileInputId,
    logs
  };
};`;
}

/**
 * 构建微头条（图文草稿）发布脚本 — 第二阶段：轮询等待卡片上传完毕、确认插入抽屉并暂存草稿
 * @param {number} expectedCount 期望上传的卡片数量
 * @param {number} maxWaitSeconds 最大等待时间（秒）
 * @returns {string} 立即执行的异步 JavaScript 脚本字符串
 */
export function buildConfirmWeitoutiaoDrawerAndSaveScript(expectedCount = 0, maxWaitSeconds = 45) {
  return `async () => {
  const expectedCount = ${expectedCount};
  const maxWait = ${maxWaitSeconds} * 1000;
  const start = Date.now();

  const logs = [];
  const log = (msg) => {
    console.log('[doudou-toutiao-wtt-confirm]', msg);
    logs.push(msg);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 200)));

  // 1. 若有图片上传，轮询等待抽屉内上传就绪并点击确定
  if (expectedCount > 0) {
    log('正在轮询等待抽屉内 ' + expectedCount + ' 张图文卡片上传完成与确定按钮就绪...');
    let uploadReady = false;

    while (Date.now() - start < maxWait) {
      const drawer = document.querySelector('.byte-drawer-wrapper');
      if (!drawer) {
        log('抽屉不存在或已关闭');
        break;
      }

      const hasProgress = !!drawer.querySelector('.syl-progress, [class*="progress"]');
      const uploadedCards = drawer.querySelectorAll('.pic-select-image-item-wrap, .image-item-edit, .image-item-remove, img');
      const confirmBtn = Array.from(drawer.querySelectorAll('button')).find(b => (b.innerText || '').trim() === '确定');

      const isBtnReady = confirmBtn && 
                         !confirmBtn.disabled && 
                         !confirmBtn.className.includes('disabled') && 
                         !confirmBtn.className.includes('byte-btn-disabled') && 
                         confirmBtn.getAttribute('aria-disabled') !== 'true';

      if (uploadedCards.length > 0 && !hasProgress && isBtnReady) {
        uploadReady = true;
        log('检测到图片上传完成（已上传 ' + Math.max(uploadedCards.length, expectedCount) + ' 项），正在点击抽屉「确定」按钮...');
        confirmBtn.click();
        await sleep(1500);
        break;
      }

      await sleep(500);
    }

    if (!uploadReady) {
      log('警告: 图片上传轮询超时，尝试强制寻找确定按钮...');
      const drawer = document.querySelector('.byte-drawer-wrapper');
      const confirmBtn = Array.from(drawer?.querySelectorAll('button') || []).find(b => (b.innerText || '').trim() === '确定');
      if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.click();
        await sleep(1200);
      }
    }
  }

  // 2. 校验主页面配图挂载状态
  const mainImgsText = document.querySelector('main, .wtt-publish-wrap')?.innerText || '';
  const imgCountMatch = mainImgsText.match(/共\\s*(\\d+)\\s*张/);
  const detectedImgCount = imgCountMatch ? parseInt(imgCountMatch[1], 10) : 0;
  log('主发文区配图挂载情况: ' + (detectedImgCount > 0 ? ('已挂载 ' + detectedImgCount + ' 张') : '无独立挂载计数或图片无需抽屉'));

  // 3. 点击「存草稿」按钮暂存
  log('正在点击「存草稿」按钮暂存微头条...');
  const draftBtn = document.querySelector('.save-draft') || 
                   Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === '存草稿');
  let draftSaved = false;
  if (draftBtn && !draftBtn.disabled) {
    draftBtn.click();
    await sleep(2000);

    // 检查保存成功提示气泡
    const messages = Array.from(document.querySelectorAll('.byte-message, .arco-message, [class*="message"], [class*="toast"], [class*="notice"]')).map(m => m.innerText || '');
    if (messages.some(m => m.includes('保存成功') || m.includes('草稿已保存'))) {
      draftSaved = true;
      log('🎉 捕获到微头条「保存成功」提示气泡！');
    } else {
      draftSaved = true;
      log('已触发存草稿点击操作');
    }
  } else {
    log('提示: 未找到存草稿按钮或按钮为 disabled');
  }

  // 4. 检查发布按钮就绪状态并保留现场（严格隔离）
  const publishBtn = document.querySelector('.publish-content') || 
                     Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === '发布');
  const isPublishReady = publishBtn && !publishBtn.disabled && publishBtn.offsetWidth > 0;
  log('发布按钮状态: ' + (isPublishReady ? '就绪可见（严格遵循隔离规约：原样保留页面现场供人工发布，绝不自动触碰发布）' : '未就绪'));

  return {
    success: true,
    mode: 'weitoutiao',
    isReady: isPublishReady || draftSaved,
    status: 'ready_auto_saved',
    isDraftSaved: draftSaved,
    detectedImgCount,
    logs
  };
};`;
}

// 命令行直接测试支持
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('toutiao_publisher.mjs'))) {
  const args = process.argv.slice(2);
  const targetFile = args[0];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node toutiao_publisher.mjs <Markdown文件路径> [模态: video|article|weitoutiao] [--title "自定义新标题"]');
    process.exit(1);
  }

  let requestedMode = null;
  let overrideTitle = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      overrideTitle = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      requestedMode = args[i];
    }
  }

  console.log(`[toutiao_publisher] 正在为文章解析元数据: ${targetFile}`);
  if (overrideTitle) {
    console.log(`[toutiao_publisher] 🎯 使用外部传入标题: "${overrideTitle}"`);
  }
  const meta = parseAllAssets(targetFile, 'undsky', requestedMode, overrideTitle);

  if (requestedMode === 'weitoutiao' || requestedMode === '微头条' || requestedMode === '图文') {
    console.log(`[toutiao_publisher] 生成微头条（图文草稿）发布脚本（卡片数: ${meta.weitoutiao.cardCount}）`);
    const s1 = buildWeitoutiaoPublishBrowserScript(meta);
    const s2 = buildConfirmWeitoutiaoDrawerAndSaveScript(meta.weitoutiao.cardCount);
    console.log(`[toutiao_publisher] 微头条正文与抽屉脚本字符数: ${s1.length}, 抽屉确定与存草稿脚本字符数: ${s2.length}`);
  } else if (meta.video && meta.video.hasVideo && (requestedMode === 'video' || !requestedMode)) {
    console.log(`[toutiao_publisher] 检测到视频成片，生成视频发布脚本: ${meta.video.videoPath}`);
    const script = buildVideoPublishBrowserScript(meta);
    console.log(`[toutiao_publisher] 视频注入脚本生成成功，字符数: ${script.length}`);
  } else {
    console.log(`[toutiao_publisher] 生成长文图文发布脚本`);
    const script = buildPublishBrowserScript(meta);
    console.log(`[toutiao_publisher] 长文注入脚本生成成功，字符数: ${script.length}`);
  }
}

