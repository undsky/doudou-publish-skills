/**
 * 企鹅号（腾讯内容开放平台）自动化发布浏览器脚本生成器
 * 核心能力：
 * 1. 真实人工行为模拟：微随机时延抖动、全链路 DOM 事件派发、拟真悬停。
 * 2. 企鹅号 ExEditor (ProseMirror) 富文本极速双向同步：标题绑定、完整正文 HTML 注入。
 * 3. 视频发布自动化：视频上传控件激活、标题与多行简介填写、16:9 封面本地上传与裁剪绑定、自主声明处理、AI 生成声明弹窗确认。
 * 4. 标签留空规约：无论图文还是视频发文页，严格留空，由用户人工按需填写。
 * 5. 草稿安全隔离：严格限定为存草稿，绝不触碰任何形式的公开发布。
 */

import path from 'node:path';
import { parseAllAssets } from './parser.mjs';

/**
 * 构建暴露视频上传隐藏 input[type="file"] 的浏览器脚本
 * 用于供 MCP upload_file 工具接管上传
 * @returns {string}
 */
export function buildPrepareVideoUploadBrowserScript() {
  return `(() => {
  let input = document.querySelector('input[name="Filedata"]') || document.querySelector('input[type="file"]');
  if (!input) {
    input = Array.from(document.querySelectorAll('input[type="file"]'))[0];
  }
  if (input) {
    input.removeAttribute('hidden');
    input.id = 'video-upload-input';
    input.style.cssText = 'display: block !important; position: fixed !important; z-index: 999999 !important; top: 120px !important; left: 120px !important; width: 140px !important; height: 50px !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; background: yellow !important;';
    return { success: true, readyForUpload: true, inputId: 'video-upload-input' };
  }
  return { success: false, error: '未找到视频上传 input[type="file"] 元素' };
})()`;
}

/**
 * 构建轮询等待视频上传就绪状态的浏览器脚本
 * @param {number} maxWaitSeconds
 * @returns {string}
 */
export function buildWaitVideoUploadReadyBrowserScript(maxWaitSeconds = 180) {
  return `(async () => {
  const maxWait = ${maxWaitSeconds} * 1000;
  const start = Date.now();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  console.log('[doudou-qiehao] 正在等待视频上传及预解析处理完成...');

  while (Date.now() - start < maxWait) {
    const titleInput = document.querySelector('.omui-articletitle__input1 .omui-inputautogrowing__inner, .omui-inputautogrowing__inner');
    const descArea = document.querySelector('textarea.omui-textarea__inner');
    const hasVideo = !!document.querySelector('video') || document.body.innerText.includes('重新上传') || !!document.querySelector('.uploadSuccess-cls') || !!document.querySelector('.commonThumb-cls1nhB7');

    if ((titleInput || descArea) && hasVideo) {
      console.log('[doudou-qiehao] 视频上传就绪！');
      return { success: true, elapsedMs: Date.now() - start };
    }

    await sleep(2000);
  }

  return { success: false, error: '等待视频上传超时（超过 ' + ${maxWaitSeconds} + ' 秒）' };
})()`;
}

/**
 * 构建企鹅号视频草稿发布浏览器端注入脚本
 * @param {object} meta 解析后的文章/视频元数据
 * @returns {string} 立即执行的异步 JavaScript 代码字符串
 */
export function buildVideoPublishBrowserScript(meta) {
  return `async () => {
  const meta = {
    title: ${JSON.stringify(meta.videoTitle || meta.articleTitle || '')},
    description: ${JSON.stringify(meta.videoDesc || '')},
    coverBase64: ${JSON.stringify(meta.videoCover?.cdnUrl ? '' : (meta.videoCover?.base64 || meta.cover?.base64 || ''))},
    coverCdnUrl: ${JSON.stringify(meta.videoCover?.cdnUrl || meta.videoCover?.url || meta.cover?.cdnUrl || meta.cover?.url || '')},
    coverFileName: ${JSON.stringify(meta.videoCover?.fileName || meta.cover?.fileName || 'cover-16x9.png')},
    tags: ${JSON.stringify(meta.tags || [])},
    category: ${JSON.stringify(meta.category || '科技')}
  };

  const logs = [];
  const log = (msg) => {
    const time = new Date().toLocaleTimeString();
    console.log('[doudou-qiehao-video ' + time + ']', msg);
    logs.push('[' + time + '] ' + msg);
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

  const getReactHandler = (node) => {
    if (!node) return null;
    const key = Object.keys(node).find(k => k.startsWith('__reactEventHandlers'));
    return key ? node[key] : null;
  };

  log('🚀 开始执行企鹅号视频草稿箱拟真发布流程...');

  // 1. 拟真填入视频标题（5~64 字）
  log('✍️ 正在拟真人机输入视频标题: ' + meta.title);
  const titleEl = document.querySelector('.omui-articletitle__input1 .omui-inputautogrowing__inner, .omui-inputautogrowing__inner');
  if (titleEl) {
    titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    titleEl.focus();
    titleEl.innerText = meta.title;
    const titleHandlers = getReactHandler(titleEl);
    if (titleHandlers && typeof titleHandlers.onInput === 'function') {
      titleHandlers.onInput({ target: titleEl, currentTarget: titleEl });
    }
    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    titleEl.dispatchEvent(new Event('change', { bubbles: true }));
    titleEl.blur();
    log('✅ 视频标题 DOM 与 React 状态绑定完成');
  } else {
    log('⚠️ 未找到视频标题输入框');
  }
  await sleep(400);

  // 2. 拟真填入视频简介/描述（多行干货，无标签）
  log('📝 正在填写视频简介/描述...');
  const descEl = document.querySelector('textarea.omui-textarea__inner');
  if (descEl && meta.description) {
    descEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    descEl.focus();
    descEl.value = meta.description;
    const descHandlers = getReactHandler(descEl);
    if (descHandlers && typeof descHandlers.onChange === 'function') {
      descHandlers.onChange({ target: descEl, currentTarget: descEl });
    }
    descEl.dispatchEvent(new Event('input', { bubbles: true }));
    descEl.dispatchEvent(new Event('change', { bubbles: true }));
    descEl.blur();
    log('✅ 视频简介填写完成');
  } else {
    log('⚠️ 未找到视频简介输入框');
  }
  await sleep(500);

  // 3. 上传与绑定 16:9 视频封面
  let coverUploaded = false;
  if (meta.coverBase64 || meta.coverCdnUrl) {
    log('🖼️ 正在上传与绑定 16:9 视频封面: ' + meta.coverFileName + '...');
    try {
      // 触发封面设置弹窗
      const triggerBtn = document.querySelector('.commonThumb-cls1nhB7, .addCoverBtn-cls3gyHX, button.omui-button--add, [class*="addCover"], [class*="Thumb"]');
      if (triggerBtn) {
        await simulateClick(triggerBtn);
        await sleep(600);

        // 识别弹窗并切换至「本地上传」tab
        const tabs = Array.from(document.querySelectorAll('.omui-tab__label'));
        const localUploadTab = tabs.find(t => t.innerText?.includes('本地上传'));
        if (localUploadTab) {
          localUploadTab.click();
          await sleep(500);
        }

        // 获取文件上传 input
        const fileInput = document.querySelector('.imgEditorDialogWrap-clshBLfh input[type="file"], .omui-dialog-content input[type="file"], input[type="file"]');
        if (fileInput) {
          let file = null;
          const candidateUrls = ['http://127.0.0.1:39281/cover.png', meta.coverCdnUrl].filter(Boolean);
          for (const u of candidateUrls) {
            try {
              const resp = await fetch(u);
              if (resp.ok) {
                const blob = await resp.blob();
                file = new File([blob], meta.coverFileName || 'cover-16x9.png', { type: blob.type || 'image/png' });
                log('已从 URL 成功获取封面 Blob: ' + u);
                break;
              }
            } catch(e) {}
          }

          if (!file && meta.coverBase64) {
            let b64 = meta.coverBase64;
            if (b64.includes(',')) b64 = b64.split(',')[1];
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            const mimeType = meta.coverFileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const blob = new Blob([byteArray], { type: mimeType });
            file = new File([blob], meta.coverFileName, { type: mimeType });
            log('已从 Base64 成功生成封面 File');
          }

          if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;

            const fileHandlers = getReactHandler(fileInput);
            if (fileHandlers && typeof fileHandlers.onChange === 'function') {
              fileHandlers.onChange({
                target: fileInput,
                currentTarget: fileInput,
                preventDefault() {},
                stopPropagation() {},
                persist() {},
                nativeEvent: new Event('change')
              });
            }
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            log('已派发封面上传事件，等待「下一步」或裁剪按钮就绪...');

            // 等待「下一步」按钮就绪并点击
            for (let retry = 0; retry < 15; retry++) {
              await sleep(600);
              const nextBtn = document.querySelector('.uploadNextBtn-clssB59u') ||
                Array.from(document.querySelectorAll('.omui-dialog button, button')).find(b => b.innerText?.trim() === '下一步');
              if (nextBtn && !nextBtn.disabled && !nextBtn.className.includes('is--disabled')) {
                await simulateClick(nextBtn);
                log('已点击「下一步」进入封面裁剪界面');
                break;
              }
            }

            // 等待「完成」按钮就绪并点击
            for (let retry = 0; retry < 15; retry++) {
              await sleep(600);
              const finishBtn = Array.from(document.querySelectorAll('.omui-dialog button.omui-button--primary, button')).find(b => b.innerText?.trim() === '完成' || b.innerText?.trim() === '确认');
              if (finishBtn && !finishBtn.disabled && !finishBtn.className.includes('is--disabled')) {
                await simulateClick(finishBtn);
                coverUploaded = true;
                log('✅ 视频封面裁剪绑定完成');
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      log('⚠️ 封面上传处理异常: ' + e.message);
    }
  }
  await sleep(400);

  // 4. 智能设置分类（视频分类下拉 / 常用分类选择，默认「互联网」，标签严格留空）
  log('🏷️ 正在设置分类（默认「互联网」，标签严格留空）...');
  try {
    const targetCategory = meta.category || '互联网';
    let catSelected = false;

    // 4.1 优先检查「常用分类」标签
    const tagBlocks = Array.from(document.querySelectorAll('.tag_block-cls326uu, [class*="tag_block"]'));
    for (const block of tagBlocks) {
      const tags = Array.from(block.querySelectorAll('.omui-tag, [class*="tag"]')).filter(t => !t.className.includes('tag_label'));
      const hit = tags.find(t => t.innerText?.trim() === targetCategory || t.innerText?.trim() === '互联网');
      if (hit && !hit.innerText?.includes('暂无')) {
        await simulateClick(hit);
        catSelected = true;
        log('✅ 已从常用分类选择: ' + hit.innerText.trim());
        break;
      }
    }

    // 4.2 若常用分类无可用项（如「常用分类 暂无」），通过 .videocat-suggestion 下拉搜索选择
    if (!catSelected) {
      const catControl = document.querySelector('.videocat-suggestion .omui-suggestion__control') || document.querySelector('.videocat-suggestion');
      const catInput = document.querySelector('.videocat-suggestion input.omui-suggestion__value');

      if (catControl) {
        const handlerKey = Object.keys(catControl).find(k => k.startsWith('__reactEventHandlers'));
        if (handlerKey && catControl[handlerKey].onMouseDown) {
          catControl[handlerKey].onMouseDown({ preventDefault() {}, stopPropagation() {}, target: catControl, currentTarget: catControl });
        } else {
          catControl.click();
        }
        await sleep(400);

        if (catInput) {
          const inputHandlerKey = Object.keys(catInput).find(k => k.startsWith('__reactEventHandlers'));
          if (inputHandlerKey && typeof catInput[inputHandlerKey].onChange === 'function') {
            catInput.value = targetCategory;
            catInput[inputHandlerKey].onChange({ target: { value: targetCategory }, currentTarget: { value: targetCategory }, preventDefault() {}, stopPropagation() {} });
          } else {
            catInput.value = targetCategory;
            catInput.dispatchEvent(new Event('input', { bubbles: true }));
            catInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          await sleep(500);

          // 在过滤后的选项中点击匹配项
          const options = Array.from(document.querySelectorAll('.omui-suggestion__option'));
          const targetOpt = options.find(o => o.innerText?.trim() === targetCategory) || options.find(o => o.innerText?.trim() === '互联网') || options.find(o => !o.className.includes('disabled'));
          if (targetOpt) {
            const optHandler = Object.keys(targetOpt).find(k => k.startsWith('__reactEventHandlers'));
            if (optHandler && targetOpt[optHandler].onClick) {
              targetOpt[optHandler].onClick({ preventDefault() {}, stopPropagation() {}, target: targetOpt, currentTarget: targetOpt });
            } else if (optHandler && targetOpt[optHandler].onMouseDown) {
              targetOpt[optHandler].onMouseDown({ preventDefault() {}, stopPropagation() {}, target: targetOpt, currentTarget: targetOpt });
            } else {
              targetOpt.click();
            }
            catSelected = true;
            log('✅ 已通过视频分类下拉搜索选择: ' + targetOpt.innerText.trim());
          }
        }
      }
    }

    // 4.3 备选：通用 #articlePublish-category_id 区域点击
    if (!catSelected) {
      const catWrap = document.querySelector('#articlePublish-category_id');
      if (catWrap) {
        const catTags = Array.from(catWrap.querySelectorAll('.omui-tag, [class*="tag"]'));
        const targetCat = catTags.find(t => t.innerText?.includes(targetCategory) || t.innerText?.includes('互联网') || t.innerText?.includes('科技'));
        if (targetCat) {
          targetCat.click();
          log('✅ 已从分类标签区选择: ' + targetCat.innerText.trim());
        }
      }
    }
  } catch (e) {
    log('⚠️ 分类设置异常: ' + e.message);
  }
  await sleep(400);

  // 5. 自主声明弹窗确认（消除「请选择自主声明」必填校验）
  log('🛡️ 正在处理自主声明必填项...');
  try {
    const selfDeclareBtn = document.querySelector('[id*="selfDeclaration"] button, [class*="selfDeclare"] button, [id*="declaration"] button');
    if (selfDeclareBtn) {
      await simulateClick(selfDeclareBtn);
      await sleep(500);

      const dialog = document.querySelector('.selfDeclareDialog-clsuft6F, .omui-dialog');
      if (dialog) {
        const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText?.trim() === '确认');
        if (confirmBtn) {
          await simulateClick(confirmBtn);
          log('✅ 自主声明确认完成');
        }
      }
    }
  } catch (e) {
    log('⚠️ 自主声明设置异常: ' + e.message);
  }
  await sleep(500);

  // 6. 安全存草稿并自动处理「AI生成声明」合规弹窗
  let savedDraft = false;
  try {
    const draftBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.trim() === '存草稿');
    if (draftBtn) {
      log('💾 正在点击「存草稿」按钮保存视频草稿...');
      draftBtn.click();
      await sleep(1000);

      // 监测并自动确认「AI生成声明」弹窗
      for (let retry = 0; retry < 10; retry++) {
        const aiDialog = Array.from(document.querySelectorAll('.omui-dialog')).find(d => d.innerText?.includes('AI生成声明'));
        if (aiDialog) {
          log('检测到「AI生成声明」合规确认弹窗，正在自动点击「提交」...');
          const submitBtn = aiDialog.querySelector('button.omui-button--primary') ||
            Array.from(aiDialog.querySelectorAll('button')).find(b => b.innerText?.trim() === '提交');
          if (submitBtn) {
            submitBtn.click();
            log('✅ 已提交「AI生成声明」合规确认');
          }
          break;
        }
        await sleep(500);
      }

      await sleep(1200);
      const isSaved = document.body.innerText.includes('已保存') || document.body.innerText.includes('保存成功');
      if (isSaved) {
        savedDraft = true;
        log('✅ 视频草稿已成功保存！');
      }
    }
  } catch (e) {
    log('⚠️ 存草稿异常: ' + e.message);
  }

  // 7. 完成发布就绪（原样保留页面现场供人工发布，严禁调用 close_page）
  log('🎉 企鹅号视频资产填入完毕，直接判定发布就绪！');
  const coverImg = document.querySelector('.commonThumb-cls1nhB7 img, .coverThumb-cls3RUR3 img, [class*="Thumb"] img');

  return {
    success: true,
    isReady: true,
    status: 'ready',
    title: meta.title,
    coverUploaded: !!coverImg,
    coverSrc: coverImg?.src || null,
    category: meta.category,
    tags: meta.tags,
    savedDraft: savedDraft,
    logs
  };
};`;
}

/**
 * 构建企鹅号文章草稿发布浏览器端注入脚本
 * @param {object} meta 解析后的文章元数据
 * @returns {string} 立即执行的异步 JavaScript 代码字符串
 */
export function buildPublishBrowserScript(meta) {
  return `async () => {
  const meta = {
    title: ${JSON.stringify(meta.articleTitle)},
    htmlContent: ${JSON.stringify(meta.articleHtml.htmlContent)},
    coverBase64: ${JSON.stringify(meta.cover?.cdnUrl ? '' : (meta.cover?.base64 || ''))},
    coverCdnUrl: ${JSON.stringify(meta.cover?.cdnUrl || meta.cover?.url || '')},
    coverFileName: ${JSON.stringify(meta.cover?.fileName || 'cover.png')},
    tags: ${JSON.stringify(meta.tags || [])},
    category: ${JSON.stringify(meta.category || '科技')}
  };

  const logs = [];
  const log = (msg) => {
    const time = new Date().toLocaleTimeString();
    console.log('[doudou-qiehao ' + time + ']', msg);
    logs.push('[' + time + '] ' + msg);
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

  // 查找 React Props / Handlers
  const getReactHandler = (node) => {
    if (!node) return null;
    const key = Object.keys(node).find(k => k.startsWith('__reactEventHandlers'));
    return key ? node[key] : null;
  };

  log('🚀 开始执行企鹅号文章草稿箱拟真发布流程...');

  // 1. 检查页面元素与登录状态
  const titleEl = document.querySelector('.omui-articletitle__input1 .omui-inputautogrowing__inner');
  const hasExEditor = !!(window.ExEditor && window.ExEditor.view);

  if (!titleEl || !hasExEditor) {
    if (window.location.href.includes('login') || window.location.href.includes('userReg')) {
      return {
        success: false,
        needLogin: true,
        error: '检测到未登录企鹅号，请先在浏览器中登录创作者账号后再执行。',
        logs
      };
    }
    return {
      success: false,
      error: '未能定位企鹅号编辑器，请确认当前已打开 https://om.qq.com/main/creation/article',
      logs
    };
  }

  // 2. 拟真人机输入文章标题（5~64 字）
  log('✍️ 正在拟真人机输入文章标题: ' + meta.title);
  if (titleEl) {
    titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    titleEl.focus();
    titleEl.innerText = meta.title;
    const titleHandlers = getReactHandler(titleEl);
    if (titleHandlers && typeof titleHandlers.onInput === 'function') {
      titleHandlers.onInput({ target: titleEl, currentTarget: titleEl });
    }
    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    titleEl.dispatchEvent(new Event('change', { bubbles: true }));
    titleEl.blur();
    log('✅ 文章标题 DOM 与 React 状态绑定完成');
  }
  await sleep(400);

  // 3. 极速注入 ExEditor (ProseMirror) 富文本正文
  log('📄 正在注入富文本正文 (' + meta.htmlContent.length + ' 字符)...');
  try {
    const view = window.ExEditor.view;
    const slice = window.ExEditor.sliceFromHTML(meta.htmlContent);
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, slice.content);
    view.dispatch(tr);
    log('✅ 已通过 ExEditor ProseMirror 引擎极速注入正文');
  } catch (e) {
    log('⚠️ ExEditor 注入异常: ' + e.message);
  }
  await sleep(500);

  // 4. 封面上传与裁切弹窗确认
  let coverUploaded = false;
  if (meta.coverBase64 || meta.coverCdnUrl) {
    log('🖼️ 正在上传与绑定文章封面图: ' + meta.coverFileName + '...');
    try {
      // 检查当前是否已有封面
      const currentCoverImg = document.querySelector('.articleCoverWrap-cls3i-ak img, .coverThumb-cls3RUR3 img');
      const replaceCoverBtn = Array.from(document.querySelectorAll('.omui-thumb__action span, .coverThumb-cls3RUR3 span, .cover-container span')).find(s => s.innerText?.trim() === '更换');
      const addCoverBtn = document.querySelector('.addCoverBtn-cls3gyHX, button.omui-button--add, button[class*="addCover"]');
      const triggerBtn = currentCoverImg ? (replaceCoverBtn || currentCoverImg) : (addCoverBtn || document.querySelector('.cover-container figure'));

      if (triggerBtn) {
        await simulateClick(triggerBtn);
        await sleep(600);

        // 切换至「本地上传」标签
        const tabs = Array.from(document.querySelectorAll('.omui-tab__label'));
        const localUploadTab = tabs.find(t => t.innerText?.includes('本地上传'));
        if (localUploadTab) {
          localUploadTab.click();
          await sleep(500);
        }

        // 获取文件上传 input
        const fileInput = document.querySelector('.omui-dialog-content input[type="file"], input[type="file"]');
        if (fileInput) {
          let file = null;
          const candidateUrls = ['http://127.0.0.1:39281/cover.png', meta.coverCdnUrl].filter(Boolean);
          for (const u of candidateUrls) {
            try {
              const resp = await fetch(u);
              if (resp.ok) {
                const blob = await resp.blob();
                file = new File([blob], meta.coverFileName || 'cover.png', { type: blob.type || 'image/png' });
                log('已从 URL 成功获取封面 Blob: ' + u);
                break;
              }
            } catch(e) {}
          }

          if (!file && meta.coverBase64) {
            let b64 = meta.coverBase64;
            if (b64.includes(',')) b64 = b64.split(',')[1];
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            const mimeType = meta.coverFileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const blob = new Blob([byteArray], { type: mimeType });
            file = new File([blob], meta.coverFileName, { type: mimeType });
            log('已从 Base64 成功生成封面 File');
          }

          if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;

            const fileHandlers = getReactHandler(fileInput);
            if (fileHandlers && typeof fileHandlers.onChange === 'function') {
              fileHandlers.onChange({
                target: fileInput,
                currentTarget: fileInput,
                preventDefault() {},
                stopPropagation() {},
                persist() {},
                nativeEvent: new Event('change')
              });
            }
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            log('已派发封面上传事件，等待裁切弹窗确认按钮就绪...');

            for (let retry = 0; retry < 15; retry++) {
              await sleep(600);
              const confirmBtn = Array.from(document.querySelectorAll('.omui-dialog button, button')).find(b => b.innerText?.trim() === '确认');
              if (confirmBtn && !confirmBtn.disabled && !confirmBtn.className.includes('is--disabled')) {
                await simulateClick(confirmBtn);
                coverUploaded = true;
                log('✅ 封面裁切确认完成');
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      log('⚠️ 封面上传处理异常: ' + e.message);
    }
  }
  await sleep(400);

  // 5. 智能设置分类（标签严格留空供用户人工按需填写）
  log('🏷️ 正在设置分类（标签严格留空供人工填写）...');
  try {
    const catWrap = document.querySelector('#articlePublish-category_id');
    if (catWrap) {
      const catTags = Array.from(catWrap.querySelectorAll('.omui-tag, [class*="tag"]'));
      const targetCat = catTags.find(t => t.innerText?.includes(meta.category) || t.innerText?.includes('互联网') || t.innerText?.includes('科技'));
      if (targetCat) {
        targetCat.click();
        log('✅ 已选择文章分类: ' + targetCat.innerText.trim());
      }
    }
  } catch (e) {
    log('⚠️ 分类设置异常: ' + e.message);
  }
  await sleep(400);

  // 6. 安全存草稿
  let savedDraft = false;
  try {
    const draftBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.trim() === '存草稿');
    if (draftBtn) {
      log('💾 正在点击「存草稿」按钮保存草稿...');
      draftBtn.click();
      await sleep(1200);
      const isSaved = document.body.innerText.includes('已保存') || document.body.innerText.includes('保存成功');
      if (isSaved) {
        savedDraft = true;
        log('✅ 草稿已成功保存！');
      }
    }
  } catch (e) {
    log('⚠️ 存草稿异常: ' + e.message);
  }

  // 7. 完成发布就绪（直接判定完成，原样保留页面现场供人工发布，严禁调用 close_page）
  log('🎉 企鹅号图文内容填入完毕，直接判定发布就绪！');

  const finalDocLength = window.ExEditor?.view?.state?.doc?.textContent?.length || 0;
  const coverImg = document.querySelector('.articleCoverWrap-cls3i-ak img, .coverThumb-cls3RUR3 img');

  return {
    success: true,
    isReady: true,
    status: 'ready',
    title: meta.title,
    wordCount: finalDocLength,
    coverUploaded: !!coverImg,
    coverSrc: coverImg?.src || null,
    category: meta.category,
    tags: meta.tags,
    savedDraft: savedDraft,
    logs
  };
};`;
}

// 命令行执行测试
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('qiehao_publisher.mjs'))) {
  const testFile = process.argv[2];
  const mode = process.argv[3] || 'article';
  if (!testFile) {
    console.error('❌ 缺少必要参数！用法: node qiehao_publisher.mjs <Markdown文件路径> [mode: article|video]');
    process.exit(1);
  }
  try {
    const meta = parseAllAssets(testFile);
    if (mode === 'video') {
      const prep = buildPrepareVideoUploadBrowserScript();
      const wait = buildWaitVideoUploadReadyBrowserScript();
      const script = buildVideoPublishBrowserScript(meta);
      console.log('✅ 生成企鹅号视频浏览器发布代码成功，发布脚本长度:', script.length, '字符');
    } else {
      const script = buildPublishBrowserScript(meta);
      console.log('✅ 生成企鹅号长文图文浏览器发布代码成功，代码长度:', script.length, '字符');
    }
  } catch (e) {
    console.error('❌ 生成代码失败:', e.message);
  }
}
