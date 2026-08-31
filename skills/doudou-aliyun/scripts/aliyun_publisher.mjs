import { parseArticle } from './parser.mjs';

/**
 * 生成可直接在目标页面 (https://developer.aliyun.com/article/new) evaluate_script 执行的拟真发布 Payload 函数字符串
 * @param {string} markdownFilePath 
 * @returns {string} 可在目标页面执行的自包含异步 JS 代码
 */
export function buildBrowserPublishScript(markdownFilePath) {
  const articleData = parseArticle(markdownFilePath);
  const jsonPayload = JSON.stringify({
    title: articleData.title,
    summary: articleData.summary,
    bodyContent: articleData.bodyContent,
    cover: articleData.cover
  });

  return `(async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  // 1. 检查页面和表单实例
  const formEl = document.querySelector('form.public-article-form');
  if (!formEl) {
    return { success: false, error: '未找到发布表单，请确保已登录并停留在 https://developer.aliyun.com/article/new' };
  }

  const fiberKey = Object.keys(formEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  let fFiber = formEl ? formEl[fiberKey] : null;
  let instance = null;
  while (fFiber) {
    if (fFiber.stateNode && typeof fFiber.stateNode === 'object' && fFiber.stateNode.handleSubmit) {
      instance = fFiber.stateNode;
      break;
    }
    fFiber = fFiber.return;
  }

  if (!instance) {
    return { success: false, error: '未能获取表单组件 React 实例' };
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  // 2. 模拟人工输入标题
  log('正在设置文章标题...');
  const titleInput = document.querySelector('input[placeholder*="标题"]');
  if (titleInput) {
    titleInput.focus();
    await randomDelay(300, 600);
    titleInput.value = data.title;
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    titleInput.blur();
  }
  if (instance.field) {
    instance.field.setValue('title', data.title);
  }
  await randomDelay(400, 800);

  // 3. 注入 Markdown 正文并触发 mditor 预览渲染
  log('正在注入 Markdown 正文并渲染预览...');
  const textarea = document.querySelector('.left-content textarea.textarea');
  if (textarea) {
    textarea.focus();
    textarea.value = data.bodyContent;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
  }

  if (instance.editor) {
    instance.editor.value = data.bodyContent;
    if (instance.editor.$emit) {
      instance.editor.$emit('change', data.bodyContent);
      instance.editor.$emit('input', data.bodyContent);
    }
    if (instance.editor.viewer && instance.editor.viewer.render) {
      instance.editor.viewer.render();
    }
  }
  await randomDelay(800, 1500);

  // 4. 模拟平滑滚动到页面下方
  log('模拟平滑视口滚动...');
  window.scrollTo({ top: 600, behavior: 'smooth' });
  await randomDelay(500, 800);
  window.scrollTo({ top: 900, behavior: 'smooth' });
  await randomDelay(400, 700);

  // 5. 填写文章摘要
  log('正在设置文章摘要...');
  const summaryEl = document.querySelector('textarea[placeholder*="摘要"]');
  if (summaryEl) {
    summaryEl.focus();
    await randomDelay(200, 400);
    summaryEl.value = data.summary;
    summaryEl.dispatchEvent(new Event('input', { bubbles: true }));
    summaryEl.dispatchEvent(new Event('change', { bubbles: true }));
    summaryEl.blur();
  }
  if (instance.field) {
    instance.field.setValue('abstractContent', data.summary);
  }
  await randomDelay(500, 800);

  // 6. 处理封面图上传
  let coverUploaded = false;
  let coverUrl = null;
  if (data.cover && data.cover.type !== 'none') {
    log('正在通过官方 OSS 通道上传并绑定封面图...');
    try {
      let file = null;
      if (data.cover.base64) {
        const byteCharacters = atob(data.cover.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.cover.mimeType || 'image/png' });
        file = new File([blob], 'cover.png', { type: blob.type });
      } else if (data.cover.url) {
        const resp = await fetch(data.cover.url);
        const blob = await resp.blob();
        const mimeType = blob.type || 'image/jpeg';
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        file = new File([blob], 'cover.' + ext, { type: mimeType });
      }

      if (file && instance.uploadCoverImage) {
        await new Promise((resolve) => {
          const origSetState = instance.setState.bind(instance);
          let resolved = false;
          instance.setState = function(partialState, callback) {
            origSetState(partialState, () => {
              if (callback) callback();
              if (partialState && partialState.fileList && partialState.fileList.length > 0) {
                resolved = true;
                coverUploaded = true;
                coverUrl = partialState.fileList[0].imgURL;
                resolve();
              }
            });
          };

          instance.uploadCoverImage(file, 'coverImage');

          setTimeout(() => {
            if (!resolved) {
              if (instance.state.fileList && instance.state.fileList.length > 0) {
                coverUploaded = true;
                coverUrl = instance.state.fileList[0].imgURL;
              }
              resolve();
            }
          }, 12000);
        });
      }
    } catch (e) {
      log('封面图上传出现异常: ' + e.message);
    }
  }
  await randomDelay(600, 1000);

  // 7. 拟真悬停并点击「存为草稿」
  log('模拟鼠标悬停并点击「存为草稿」...');
  const draftBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '存为草稿');
  if (!draftBtn) {
    return { success: false, error: '未找到「存为草稿」按钮', logs };
  }

  draftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  draftBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  draftBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await randomDelay(400, 700);

  draftBtn.click();
  log('已触发「存为草稿」点击');

  // 8. 捕获反馈
  await delay(2500);
  const toasts = Array.from(document.querySelectorAll('.next-message, .next-toast, .next-feedback')).map(t => t.innerText.trim()).filter(Boolean);
  const statusTexts = Array.from(document.querySelectorAll('p, span, div')).map(el => el.innerText.trim()).filter(t => t.includes('保存了草稿'));

  return {
    success: true,
    title: data.title,
    summary: data.summary,
    coverUploaded,
    coverUrl,
    toasts,
    statusTexts,
    logs
  };
})()`;
}
