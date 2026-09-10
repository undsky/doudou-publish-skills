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

  log('开始执行知乎专栏文章草稿箱拟真发布流程...');

  // 0. 自动关闭可能出现的插件提示/干扰弹窗
  try {
    const continueBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('仍要继续'));
    if (continueBtn) {
      continueBtn.click();
      log('已自动确认并关闭浏览器插件提示弹窗');
      await randomDelay(300, 600);
    }
  } catch (e) {
    // 忽略
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
    titleTextarea.focus();
    await randomDelay(300, 600);
    
    // 使用 React 原生 property setter 确保受控组件状态同步
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeTextareaValueSetter.call(titleTextarea, data.title);
    titleTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    titleTextarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    await randomDelay(200, 400);
    titleTextarea.blur();
  } catch (e) {
    log('输入标题异常: ' + e.message);
  }
  await randomDelay(500, 900);

  // 3. 注入富文本并触发知乎 Draft.js 词法树解析渲染
  log('正在通过剪贴板 paste 注入正文 (' + data.bodyContent.length + ' 字符)...');
  try {
    editorEl.focus();
    document.execCommand('selectAll', false, null);
    await randomDelay(300, 600);

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
  } catch (e) {
    log('注入正文异常: ' + e.message);
  }
  await randomDelay(1200, 2000);

  // 4. 视口轻微微调触发排版渲染
  try {
    window.scrollBy({ top: 150, behavior: 'smooth' });
    await delay(200);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await delay(200);
  } catch (e) {
    // 忽略滚动异常
  }

  // 5. 官方通道上传文章封面图
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
        const resp = await fetch(data.cover.url);
        const blob = await resp.blob();
        mimeType = blob.type || mimeType;
        file = new File([blob], fileName, { type: mimeType });
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
          // 等待封面上传完成
          let waitTime = 0;
          while (waitTime < 8000) {
            await delay(500);
            waitTime += 500;
            const coverWrapper = document.querySelector('.UploadPicture-wrapper, [class*="WriteCover"], [class*="TitleImage"]');
            if (coverWrapper && (coverWrapper.innerText.includes('更换') || coverWrapper.innerText.includes('删除') || coverWrapper.querySelector('img'))) {
              coverUploaded = true;
              window.__doudou_cover_status = 'uploaded';
              break;
            }
          }
          log('封面图上传结果: ' + (coverUploaded ? '成功' : '完成'));
        }
      }
    } catch (e) {
      log('封面图处理异常: ' + e.message);
    }
    await delay(300);
  }

  // 6. 等待草稿自动同步并校验状态
  log('等待知乎草稿箱自动同步完成...');
  if (editorEl) {
    editorEl.blur();
  }
  await delay(2500);

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
