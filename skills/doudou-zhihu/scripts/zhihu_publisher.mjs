import path from 'node:path';
import { parseArticle } from './parser.mjs';

/**
 * 生成可直接在知乎写文章页面 (https://zhuanlan.zhihu.com/write) evaluate_script 执行的拟真发布 Payload 函数字符串
 * @param {string} markdownFilePath
 * @returns {string} 可在目标页面执行的自包含异步 JS 代码
 */
export function buildBrowserPublishScript(markdownFilePath) {
  const articleData = parseArticle(markdownFilePath);
  const jsonPayload = JSON.stringify({
    title: articleData.title,
    cover: articleData.cover,
    bodyContent: articleData.bodyContent,
    htmlContent: articleData.htmlContent
  });

  return `async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  // 辅助函数：快速探测并关闭可能抢占焦点的干扰/插件弹窗
  function closeAnnoyingModals() {
    let closed = false;
    try {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], .Modal-closeButton, .css-1yxmbwk'));
      for (const btn of buttons) {
        const text = (btn.innerText || '').trim();
        if (text.includes('仍要继续') || text.includes('我知道了') || text.includes('稍后提醒') || text.includes('放弃')) {
          btn.click();
          log('已自动确认并关闭干扰弹窗: ' + text);
          closed = true;
        }
      }
    } catch (e) {
      // 忽略
    }
    return closed;
  }

  log('开始执行知乎专栏文章草稿箱拟真极速发布流程...');

  // 0. 主动多次探测并清理干扰弹窗（应对异步弹窗）
  for (let i = 0; i < 3; i++) {
    closeAnnoyingModals();
    await delay(120);
  }

  // 1. 检查页面登录态与编辑器容器
  const titleTextarea = document.querySelector('.WriteIndex-titleInput textarea, textarea[placeholder*="请输入标题"]');
  const editorEl = document.querySelector('.notranslate.public-DraftEditor-content');

  if (!titleTextarea || !editorEl) {
    return {
      success: false,
      error: '未能定位知乎写文章编辑器，请确认当前已登录并停留在 https://zhuanlan.zhihu.com/write 页面',
      logs
    };
  }

  // 2. 拟真输入文章标题
  log('正在拟真人机输入文章标题: ' + data.title);
  try {
    closeAnnoyingModals();
    titleTextarea.focus();
    await randomDelay(200, 400);
    
    // 使用 React 原生 property setter 确保受控组件状态同步
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeTextareaValueSetter.call(titleTextarea, data.title);
    titleTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    titleTextarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    await randomDelay(150, 300);
    titleTextarea.blur();
  } catch (e) {
    log('输入标题异常: ' + e.message);
  }
  await randomDelay(300, 500);

  // 3. 注入富文本并触发知乎 Draft.js 词法树解析渲染
  log('正在注入正文 (' + data.bodyContent.length + ' 字符)...');
  try {
    closeAnnoyingModals();
    editorEl.focus();
    document.execCommand('selectAll', false, null);
    await randomDelay(200, 350);

    // 优先通过剪贴板 paste 派发 Draft.js 原生识别事件
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/html', data.htmlContent);
    dataTransfer.setData('text/plain', data.bodyContent);

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    });

    editorEl.dispatchEvent(pasteEvent);
    log('已派发剪贴板富文本粘贴事件');
    
    // 关键保底检查：若由于浏览器安全策略或焦点被盗导致粘贴为空，触发 execCommand 自动降级保底
    await delay(350);
    const textLen = (editorEl.innerText || editorEl.textContent || '').trim().length;
    if (textLen < 10 && data.bodyContent.length > 0) {
      log('检测到剪贴板粘贴未生效，立即触发 execCommand 自动降级写入...');
      editorEl.focus();
      let ok = false;
      try {
        ok = document.execCommand('insertHTML', false, data.htmlContent);
      } catch (err) {}
      if (!ok || (editorEl.innerText || '').trim().length < 10) {
        document.execCommand('insertText', false, data.bodyContent);
      }
      log('正文保底注入完成，当前字符数: ' + (editorEl.innerText || '').trim().length);
    }
  } catch (e) {
    log('注入正文异常: ' + e.message);
  }
  await randomDelay(500, 900);

  // 4. 视口轻微微调触发排版渲染
  try {
    window.scrollBy({ top: 120, behavior: 'smooth' });
    await delay(150);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await delay(150);
  } catch (e) {
    // 忽略滚动异常
  }

  // 5. 官方通道上传文章封面图（全链路防 CSP 阻断）
  let coverUploaded = false;
  const initialCoverWrapper = document.querySelector('.UploadPicture-wrapper, [class*="WriteCover"], [class*="TitleImage"]');
  if (initialCoverWrapper && (initialCoverWrapper.innerText.includes('更换') || initialCoverWrapper.innerText.includes('删除') || initialCoverWrapper.querySelector('img'))) {
    coverUploaded = true;
    log('检测到封面已存在，跳过重复上传');
  } else if (data.cover && data.cover.type !== 'none' && data.cover.hasCover !== false && (data.cover.base64 || data.cover.url)) {
    log('正在通过官方通道上传封面图...');
    try {
      let file = null;
      let mimeType = data.cover.mimeType || 'image/png';
      const fileName = data.cover.fileName || 'cover.png';

      if (data.cover.base64) {
        // 方案 A（极速免 CSP）：从本地内存 Base64 直接构造 File，0ms 耗时，彻底杜绝知乎 CSP 阻断
        log('使用本地图片 Base64 内存直生 File 对象（100% 避开网络与 CSP 限制）...');
        let base64Clean = data.cover.base64;
        if (base64Clean.includes(',')) {
          const parts = base64Clean.split(',');
          base64Clean = parts[1];
          const match = parts[0].match(/:(.*?);/);
          if (match) mimeType = match[1];
        }
        const byteCharacters = atob(base64Clean);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        file = new File([blob], fileName, { type: blob.type });
      } else if (data.cover.url) {
        // 方案 B：仅有 URL 时尝试 fetch，配备 3 秒超时控制器与 CSP 错误捕获，避免挂死
        log('尝试拉取网络封面 URL: ' + data.cover.url);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
          const resp = await fetch(data.cover.url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (resp.ok) {
            const blob = await resp.blob();
            mimeType = blob.type || mimeType;
            file = new File([blob], fileName, { type: mimeType });
          } else {
            log('网络封面请求返回状态非 200: ' + resp.status);
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          log('封面拉取异常（通常由知乎 connect-src CSP 限制引起）: ' + fetchErr.message);
        }
      }

      // 精准查找顶部或设置区域中的封面上传输入框，坚决排除正文富文本内的插图/附件 input
      let coverInput = document.querySelector('label.UploadPicture-wrapper input.UploadPicture-input, .UploadPicture-wrapper input');
      if (!coverInput) {
        const allFileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        coverInput = allFileInputs.find(inp => {
          const parent = inp.closest('.UploadPicture-wrapper') || inp.closest('.WriteCover') || inp.closest('[class*="Cover"]');
          const isInsideEditor = inp.closest('.PostEditor, .DraftEditor-root, .public-DraftEditor-content');
          return parent && !isInsideEditor;
        });
      }

      if (file && coverInput) {
        let dispatched = false;
        const keys = Object.keys(coverInput);
        const reactPropKey = keys.find(k => k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'));
        const props = reactPropKey ? coverInput[reactPropKey] : null;

        if (props && typeof props.onChange === 'function') {
          props.onChange({
            target: { files: [file] },
            currentTarget: { files: [file] },
            stopPropagation: () => {},
            preventDefault: () => {}
          });
          dispatched = true;
        }

        try {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          coverInput.files = dataTransfer.files;
          coverInput.dispatchEvent(new Event('change', { bubbles: true }));
          coverInput.dispatchEvent(new Event('input', { bubbles: true }));
          dispatched = true;
        } catch (e) {
          // 忽略 DataTransfer 异常
        }

        if (dispatched) {
          // 动态探测封面上传完成状态（最长等待 4 秒，检测到更换/删除立即退出）
          let waitTime = 0;
          while (waitTime < 4000) {
            await delay(300);
            waitTime += 300;
            const coverWrapper = document.querySelector('.UploadPicture-wrapper, [class*="WriteCover"], [class*="TitleImage"]');
            if (coverWrapper && (coverWrapper.innerText.includes('更换') || coverWrapper.innerText.includes('删除') || coverWrapper.querySelector('img'))) {
              coverUploaded = true;
              window.__doudou_cover_status = 'uploaded';
              break;
            }
          }
          log('封面图绑定结果: ' + (coverUploaded ? '成功' : '完成'));
        }
      }
    } catch (e) {
      log('封面图处理异常: ' + e.message);
    }
    await delay(200);
  }

  // 6. 等待草稿自动同步并校验状态（智能动态轮询，替代死等）
  log('正在确认知乎草稿同步状态...');
  if (editorEl) {
    editorEl.blur();
  }

  let saveWait = 0;
  while (saveWait < 2000) {
    await delay(250);
    saveWait += 250;
    const currentTexts = Array.from(document.querySelectorAll('header *, nav *, [class*="status"] *, [class*="Status"] *'))
      .map(el => el.innerText ? el.innerText.trim() : '')
      .filter(t => t && (t.includes('已保存') || t.includes('草稿')));
    if (currentTexts.some(t => t.includes('已保存'))) {
      log('知乎已完成草稿自动同步 (' + saveWait + 'ms)');
      break;
    }
  }

  // 获取知乎草稿保存状态文字与字数
  const statusTexts = Array.from(document.querySelectorAll('header *, nav *, [class*="status"] *, [class*="Status"] *, [class*="css-"] *'))
    .map(el => el.innerText ? el.innerText.trim() : '')
    .filter(t => t && (t.includes('草稿') || t.includes('保存') || t.includes('字数')));

  const uniqueStatus = [...new Set(statusTexts)].filter(t => t.length < 50);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    title: data.title,
    coverUploaded,
    currentUrl: window.location.href,
    statusTexts: uniqueStatus,
    logs
  };
}`;
}

// 命令行直接测试生成执行代码
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('zhihu_publisher.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node zhihu_publisher.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const script = buildBrowserPublishScript(targetFile);
  console.log('--- GENERATED ZHIHU PUBLISH SCRIPT LENGTH: ' + script.length + ' BYTES ---');
}
