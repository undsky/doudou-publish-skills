import path from 'node:path';
import { parseArticle } from './parser.mjs';

/**
 * 生成可在 CSDN 编辑器页面 (https://editor.csdn.net/md) evaluate_script 执行的拟真发布 Payload 函数字符串
 * @param {string} markdownFilePath 
 * @returns {string} 可在目标页面执行的自包含异步 JS 代码
 */
export function buildBrowserPublishScript(markdownFilePath) {
  const articleData = parseArticle(markdownFilePath);
  const jsonPayload = JSON.stringify({
    title: articleData.title,
    cover: articleData.cover,
    bodyContent: articleData.bodyContent,
    stem: articleData.stem
  });

  return `async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  log('🚀 开始执行 CSDN 博客文章草稿箱拟真发布流程（极简流：正文 + 标题 + 封面）...');

  // 1. 检查页面元素与登录状态
  const titleInput = document.querySelector('input.article-bar__title') || document.querySelector('input.article-bar__title--input');
  const editorInner = document.querySelector('.editor__inner');

  if (!titleInput || !editorInner) {
    return {
      success: false,
      error: '未能定位 CSDN Markdown 编辑器，请确认当前已登录并在浏览器打开 https://editor.csdn.net/md',
      logs
    };
  }

  // 2. 注入 Markdown 正文并触发 CSDN Markdown 词法分析与预览渲染
  log('📄 正在注入 Markdown 正文 (' + data.bodyContent.length + ' 字符)...');
  const importFileInput = document.getElementById('import-markdown-file-input');
  let importedViaFile = false;

  if (importFileInput) {
    try {
      const fullMdText = '# ' + data.title + '\\n\\n' + data.bodyContent;
      const file = new File([fullMdText], data.title + '.md', { type: 'text/markdown' });
      const dt = new DataTransfer();
      dt.items.add(file);
      importFileInput.files = dt.files;
      importFileInput.dispatchEvent(new Event('change', { bubbles: true }));
      importedViaFile = true;
      log('✅ 已通过 CSDN 原生文件解析器注入 Markdown 正文');
      await randomDelay(600, 1000);
    } catch (e) {
      log('⚠️ 文件注入异常: ' + e.message + '，切换为备用编辑器输入方案');
    }
  }

  if (!importedViaFile) {
    editorInner.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, data.bodyContent);
    editorInner.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
    editorInner.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'a' }));
    log('✅ 已通过编辑器 DOM 事件注入 Markdown 正文');
  }

  // 3. 拟真人机输入并校准文章标题
  log('✍️ 正在拟真人机输入文章标题: ' + data.title);
  titleInput.focus();
  await randomDelay(300, 600);
  titleInput.value = data.title;
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  titleInput.dispatchEvent(new Event('change', { bubbles: true }));
  await randomDelay(200, 400);
  titleInput.blur();
  await randomDelay(800, 1500);

  // 4. 模拟人工视口平滑滚动检查排版
  log('👀 模拟人工视口平滑滚动检查文章内容与预览排版...');
  window.scrollTo({ top: 500, behavior: 'smooth' });
  await randomDelay(600, 900);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await randomDelay(500, 800);

  // 5. 若有封面，打开发布抽屉仅上传封面图后关闭（严禁配置专栏、标签与摘要）
  let coverSetStatus = 'none';
  if (data.cover && (data.cover.base64 || data.cover.url)) {
    log('⚙️ 正在打开发布设置面板上传封面...');
    const publishBtn = document.querySelector('.btn-publish');
    if (publishBtn) {
      publishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      publishBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      publishBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await randomDelay(300, 500);
      publishBtn.click();
      await randomDelay(1000, 1600);

      const modal = document.querySelector('.modal__publish-article');
      if (modal) {
        log('🖼️ 正在设置文章封面...');
        const allElements = Array.from(modal.querySelectorAll('*'));
        const coverCompEl = allElements.find(el => el.__vue__?.$options?.name === 'CoverImage');
        const coverComp = coverCompEl ? coverCompEl.__vue__ : null;

        if (data.cover.base64) {
          try {
            const byteCharacters = atob(data.cover.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const mimeType = data.cover.mimeType || 'image/png';
            const blob = new Blob([byteArray], { type: mimeType });
            const file = new File([blob], 'cover.png', { type: mimeType });

            const fileInput = modal.querySelector('input[type="file"].el-upload__input');
            if (fileInput) {
              const dt = new DataTransfer();
              dt.items.add(file);
              fileInput.files = dt.files;
              fileInput.dispatchEvent(new Event('change', { bubbles: true }));
              coverSetStatus = 'uploaded_local_file';
              log('✅ 已通过本地文件流上传文章封面');
            } else if (coverComp) {
              coverComp.currentImg = data.cover.url;
              coverSetStatus = 'bound_cdn_url';
              log('✅ 已通过 CoverImage 组件绑定封面 URL');
            }
          } catch (e) {
            log('⚠️ 上传本地封面异常: ' + e.message);
            if (coverComp && data.cover.url) {
              coverComp.currentImg = data.cover.url;
              coverSetStatus = 'bound_cdn_url_fallback';
            }
          }
        } else if (data.cover.url && coverComp) {
          coverComp.currentImg = data.cover.url;
          coverSetStatus = 'bound_cdn_url';
          log('✅ 已直接绑定封面 CDN URL: ' + data.cover.url);
        }
        await randomDelay(600, 1200);

        // 关闭发布弹窗，绝不点击确定发布
        log('💾 正在关闭发布设置面板并保留草稿...');
        const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.trim() === '取消');
        const closeBtn = modal.querySelector('.modal__close-button');
        if (cancelBtn) {
          cancelBtn.click();
        } else if (closeBtn) {
          closeBtn.click();
        }
        await randomDelay(500, 800);
      }
    }
  }

  await randomDelay(500, 800);

  // 模拟平滑视口滚动审阅
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await randomDelay(400, 700);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await delay(2500);

  // 获取保存后的 URL 与 articleId
  const currentUrl = window.location.href;
  const urlObj = new URL(currentUrl);
  const articleId = urlObj.searchParams.get('articleId') || '';

  log('🎉 CSDN 文章内容填入完成！(articleId: ' + (articleId || '就绪') + ')');

  return {
    success: true,
    isReady: true,
    status: 'ready_auto_saved',
    platform: 'CSDN',
    articleId,
    draftUrl: currentUrl,
    title: data.title,
    categoryColumn: data.categoryColumn,
    tags: data.tags,
    summary: data.summary,
    coverStatus: coverSetStatus,
    savedAt: new Date().toISOString(),
    logs
  };
};`;
}

// 命令行直接测试执行
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('csdn_publisher.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node csdn_publisher.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const script = buildBrowserPublishScript(targetFile);
  console.log('--- GENERATED BROWSER PUBLISH SCRIPT PREVIEW (FIRST 500 CHARS) ---');
  console.log(script.substring(0, 500) + '...\n');
  console.log('--- SCRIPT SIZE: ' + script.length + ' bytes ---');
}
