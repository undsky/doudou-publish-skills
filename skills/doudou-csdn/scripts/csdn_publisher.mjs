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
    summary: articleData.summary,
    categoryColumn: articleData.categoryColumn,
    tags: articleData.tags,
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

  log('🚀 开始执行 CSDN 博客文章草稿箱拟真发布流程...');

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

  // 5. 拟真悬停并点击「发布文章」打开发布设置面板
  log('⚙️ 正在打开发布设置抽屉面板...');
  const publishBtn = document.querySelector('.btn-publish');
  if (!publishBtn) {
    return {
      success: false,
      error: '未能找到顶部「发布文章」按钮',
      logs
    };
  }

  publishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  publishBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  publishBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await randomDelay(300, 500);
  publishBtn.click();
  await randomDelay(1000, 1600);

  const modal = document.querySelector('.modal__publish-article');
  if (!modal) {
    return {
      success: false,
      error: '发布设置面板弹窗未正常弹出',
      logs
    };
  }

  // 6. 拟真配置文章标签 (Mark Selection Vue Component)
  if (Array.isArray(data.tags) && data.tags.length > 0) {
    log('🏷️ 正在配置文章标签: ' + data.tags.join(', '));
    const tagBtn = modal.querySelector('.tag__btn-tag');
    if (tagBtn) {
      tagBtn.click();
      await randomDelay(400, 700);
    }

    const markSelectionEl = modal.querySelector('.mark_selection');
    const msVue = markSelectionEl ? markSelectionEl.__vue__ : null;

    if (msVue && typeof msVue.handleSelect === 'function') {
      for (const tag of data.tags) {
        try {
          msVue.handleSelect({ value: tag });
          await randomDelay(200, 400);
        } catch (e) {
          log('添加标签 [' + tag + '] 异常: ' + e.message);
        }
      }
    } else {
      // 备用：通过 input 模拟回车添加标签
      const tagInput = modal.querySelector('input[placeholder*="请输入文字搜索"]');
      if (tagInput) {
        for (const tag of data.tags) {
          tagInput.focus();
          tagInput.value = tag;
          tagInput.dispatchEvent(new Event('input', { bubbles: true }));
          tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          tagInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          await randomDelay(300, 500);
        }
      }
    }
    await randomDelay(400, 800);
  }

  // 7. 拟真配置分类专栏
  if (data.categoryColumn) {
    log('📁 正在匹配分类专栏: ' + data.categoryColumn);
    const columnEntry = Array.from(modal.querySelectorAll('.form-entry')).find(e => e.innerText.includes('分类专栏'));
    if (columnEntry) {
      const labels = Array.from(columnEntry.querySelectorAll('.el-checkbox, label, span'));
      const targetLabel = labels.find(l => l.innerText.trim() === data.categoryColumn);
      if (targetLabel) {
        const chkInput = targetLabel.querySelector('input[type="checkbox"]') || targetLabel.parentElement?.querySelector('input[type="checkbox"]');
        if (!chkInput || !chkInput.checked) {
          targetLabel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          targetLabel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          await randomDelay(200, 400);
          targetLabel.click();
          log('✅ 已勾选分类专栏: ' + data.categoryColumn);
        }
      } else {
        log('ℹ️ 未找到完全匹配的专栏 [' + data.categoryColumn + ']，保留现有专栏设置');
      }
    }
    await randomDelay(400, 700);
  }

  // 8. 拟真绑定/上传文章封面
  let coverSetStatus = 'none';
  if (data.cover && (data.cover.base64 || data.cover.url)) {
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
  }

  // 9. 拟真填写文章摘要
  if (data.summary) {
    log('📝 正在填写文章摘要 (' + data.summary.length + ' 字)...');
    const summaryTextarea = modal.querySelector('textarea');
    if (summaryTextarea) {
      summaryTextarea.focus();
      await randomDelay(200, 400);
      summaryTextarea.value = data.summary;
      summaryTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      summaryTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      await randomDelay(200, 400);
      summaryTextarea.blur();
    }
    await randomDelay(500, 800);
  }

  // 10. 安全隔离：拟真悬停并点击「保存为草稿」
  log('💾 正在执行安全草稿保存（仅保存草稿，绝不触发公开发布）...');
  const saveDraftBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.trim() === '保存为草稿');
  if (!saveDraftBtn) {
    return {
      success: false,
      error: '未能找到面板内的「保存为草稿」按钮',
      logs
    };
  }

  saveDraftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  saveDraftBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  saveDraftBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await randomDelay(400, 700);
  saveDraftBtn.click();
  log('✅ 已点击「保存为草稿」按钮，等待网络同步...');

  // 等待草稿接口保存完毕
  await delay(3000);

  // 获取保存后的 URL 与 articleId
  const currentUrl = window.location.href;
  const urlObj = new URL(currentUrl);
  const articleId = urlObj.searchParams.get('articleId') || '';

  // 尝试关闭弹窗（点击取消或关闭按钮）
  const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.trim() === '取消');
  const closeBtn = modal.querySelector('.modal__close-button');
  if (cancelBtn) {
    cancelBtn.click();
  } else if (closeBtn) {
    closeBtn.click();
  }

  await randomDelay(500, 800);

  log('🎉 CSDN 文章草稿保存成功！草稿文章 ID: ' + (articleId || '已保存'));

  return {
    success: true,
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
