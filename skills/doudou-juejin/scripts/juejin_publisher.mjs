import path from 'node:path';
import { parseArticle } from './parser.mjs';

/**
 * 生成可直接在目标页面 (https://juejin.cn/editor/drafts/new?v=2) evaluate_script 执行的拟真发布 Payload 函数字符串
 * @param {string} markdownFilePath 
 * @returns {string} 可在目标页面执行的自包含异步 JS 代码
 */
export function buildBrowserPublishScript(markdownFilePath) {
  const articleData = parseArticle(markdownFilePath);
  const jsonPayload = JSON.stringify({
    title: articleData.title,
    cover: articleData.cover,
    bodyContent: articleData.bodyContent
  });

  return `(async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  log('开始执行掘金文章草稿箱拟真发布流程（极简流：标题 + 正文 + 封面）...');

  // 1. 检查页面与 Vue / CodeMirror 实例
  const editorEl = document.querySelector('.markdown-editor');
  const editorVue = editorEl ? editorEl.__vue__ : null;
  const parentVue = editorVue ? editorVue.$parent : null;
  const cmEl = document.querySelector('.CodeMirror');
  const cmInstance = cmEl ? cmEl.CodeMirror : null;

  if (!editorEl || !parentVue) {
    return {
      success: false,
      error: '未能定位掘金 Markdown 编辑器 Vue 实例，请确认当前已登录并停留在 https://juejin.cn/editor/drafts/new?v=2 页面',
      logs
    };
  }

  // 2. 拟真输入文章标题
  log('正在拟真输入文章标题: ' + data.title);
  const titleInput = document.querySelector('input.title-input');
  if (titleInput) {
    titleInput.focus();
    await randomDelay(300, 600);
    titleInput.value = data.title;
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));

    const titleVue = titleInput.__vue__;
    if (titleVue) {
      titleVue.innerValue = data.title;
      titleVue.$emit('input', data.title);
      titleVue.$emit('change', data.title);
    }
    await randomDelay(200, 400);
    titleInput.blur();
  }

  if (parentVue.draft) {
    parentVue.draft.title = data.title;
  }
  await randomDelay(500, 900);

  // 3. 注入 Markdown 正文并触发 CodeMirror & Vue 实时渲染
  log('正在注入 Markdown 正文 (' + data.bodyContent.length + ' 字符)...');
  if (cmInstance) {
    cmInstance.focus();
    cmInstance.setValue(data.bodyContent);
  }
  if (editorVue && typeof editorVue.handleChange === 'function') {
    editorVue.handleChange(data.bodyContent);
  }
  if (parentVue.draft) {
    parentVue.draft.markdown = data.bodyContent;
  }
  await randomDelay(400, 700);

  // 4. 若有封面图，打开发布面板仅上传封面图后关闭（严格不配置分类、标签与摘要）
  let coverUploaded = false;
  let coverUrl = null;
  if (data.cover && data.cover.type !== 'none' && (data.cover.base64 || data.cover.url)) {
    log('正在打开发布面板上传封面图...');
    const publishBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '发布');
    if (publishBtn) {
      publishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      publishBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      publishBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await randomDelay(300, 500);
      publishBtn.click();
      await randomDelay(800, 1300);
    }

    const panel = document.querySelector('.publish-popup');
    const panelVue = panel ? panel.__vue__ : null;

    if (panel && panelVue) {
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
          try {
            const resp = await fetch(data.cover.url);
            const blob = await resp.blob();
            const mimeType = blob.type || 'image/jpeg';
            const ext = mimeType.includes('png') ? 'png' : 'jpg';
            file = new File([blob], 'cover.' + ext, { type: mimeType });
          } catch (fetchErr) {
            log('拉取网络封面图异常: ' + fetchErr.message);
          }
        }

        const fileInput = panel.querySelector('.coverselector_container input[type="file"]');
        const uploaderVue = fileInput ? (fileInput.__vue__ || fileInput.parentElement?.__vue__) : null;

        if (file) {
          let tosUrl = null;
          if (editorVue && typeof editorVue.uploadImages === 'function') {
            try {
              const uploadRes = await editorVue.uploadImages([file]);
              if (Array.isArray(uploadRes) && uploadRes[0]?.url) {
                tosUrl = uploadRes[0].url;
              }
            } catch (err) {
              log('editorVue.uploadImages 异常: ' + err.message);
            }
          }

          if (!tosUrl && uploaderVue && typeof uploaderVue.onFileSelected === 'function') {
            try {
              uploaderVue.onFileSelected({ target: { files: [file] } });
              let waitTime = 0;
              while (waitTime < 10000) {
                await delay(500);
                waitTime += 500;
                if (!uploaderVue.updating && panelVue.post?.cover_image) {
                  tosUrl = panelVue.post.cover_image;
                  break;
                }
              }
            } catch (err) {
              log('uploaderVue.onFileSelected 异常: ' + err.message);
            }
          }

          if (tosUrl) {
            if (panelVue.post) panelVue.post.cover_image = tosUrl;
            if (parentVue.draft) parentVue.draft.cover_image = tosUrl;
            if (uploaderVue) uploaderVue.$emit('changeCover', tosUrl);
            coverUploaded = true;
            coverUrl = tosUrl;
            window.__doudou_cover_status = 'uploaded';
            log('封面图已成功上传至掘金官方 TOS 并完成绑定: ' + tosUrl);
          }
        }
      } catch (e) {
        log('封面图处理异常: ' + e.message);
      }
      await randomDelay(300, 500);

      // 关闭发布面板，绝不点击确定发布
      log('正在关闭发布设置面板并保留草稿...');
      const cancelBtn = Array.from(panel.querySelectorAll('button')).find(b => b.innerText.trim() === '取消');
      if (cancelBtn) {
        cancelBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await randomDelay(150, 300);
        cancelBtn.click();
      }
      await randomDelay(400, 600);
    }
  }

  // 5. 单次轻度视口微调触发渲染与懒加载
  window.scrollTo({ top: 150, behavior: 'smooth' });
  await delay(200);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await delay(800);

  // 获取草稿保存状态反馈
  const statusTexts = Array.from(document.querySelectorAll('header *, nav *, [class*="status"] *'))
    .map(el => el.innerText ? el.innerText.trim() : '')
    .filter(t => t && (t.includes('保存') || t.includes('草稿')));

  const draftId = parentVue?.draft?.id || (window.location.href.match(/drafts\\/(\\d+)/) ? window.location.href.match(/drafts\\/(\\d+)/)[1] : null);

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    draftId,
    title: data.title,
    coverUrl: parentVue?.draft?.cover_image || coverUrl || null,
    currentUrl: window.location.href,
    statusTexts: [...new Set(statusTexts)],
    logs
  };
})()`;
}

// 命令行直接测试生成执行代码
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('juejin_publisher.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node juejin_publisher.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const script = buildBrowserPublishScript(targetFile);
  console.log('--- GENERATED PUBLISH SCRIPT LENGTH: ' + script.length + ' BYTES ---');
}
