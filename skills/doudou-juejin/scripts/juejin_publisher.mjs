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
    summary: articleData.summary,
    category: articleData.category,
    tags: articleData.tags,
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

  log('开始执行掘金文章草稿箱拟真发布流程...');

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
  await randomDelay(900, 1600);

  // 4. 模拟人工视口平滑滚动浏览
  log('模拟人工视口平滑滚动检查文章内容...');
  window.scrollTo({ top: 450, behavior: 'smooth' });
  await randomDelay(500, 800);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await randomDelay(400, 700);

  // 5. 点击顶部「发布」按钮打开发布设置面板
  log('正在打开发布设置面板...');
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

  if (!panel || !panelVue) {
    log('警告: 未能获取发布面板 Vue 实例，尝试直接在主编辑区触发保存');
  } else {
    // 6. 选择文章分类
    log('正在配置文章分类: ' + data.category);
    const catItems = Array.from(panel.querySelectorAll('.category-list .item'));
    const targetCat = catItems.find(it => it.innerText.trim() === data.category) || catItems[0];
    if (targetCat) {
      targetCat.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      targetCat.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await randomDelay(200, 400);
      targetCat.click();
    }
    await randomDelay(500, 800);

    // 7. 搜索并选择技术标签
    if (Array.isArray(data.tags) && data.tags.length > 0) {
      log('正在搜索并匹配技术标签: ' + data.tags.join(', '));
      const tagInputVue = panel.querySelector('.tag-input')?.__vue__;
      const selectedTagObjects = [];

      for (const tagText of data.tags) {
        try {
          if (tagInputVue && typeof tagInputVue.handleSearch === 'function') {
            await tagInputVue.handleSearch(tagText);
            await randomDelay(400, 700);
            if (Array.isArray(tagInputVue.dataList) && tagInputVue.dataList.length > 0) {
              const matchedTag = tagInputVue.dataList.find(t => t.title?.toLowerCase() === tagText.toLowerCase() || t.alias?.toLowerCase().includes(tagText.toLowerCase())) || tagInputVue.dataList[0];
              if (matchedTag && !selectedTagObjects.some(s => s.id === matchedTag.id)) {
                selectedTagObjects.push(matchedTag);
              }
            }
          }
        } catch (e) {
          log('搜索标签 [' + tagText + '] 异常: ' + e.message);
        }
      }

      if (selectedTagObjects.length > 0) {
        if (tagInputVue && typeof tagInputVue.handleChange === 'function') {
          tagInputVue.handleChange(selectedTagObjects);
        }
        if (panelVue.handleTagsChange) {
          panelVue.handleTagsChange(selectedTagObjects);
        }
        log('已绑定标签: ' + selectedTagObjects.map(t => t.title).join(', '));
      }
      await randomDelay(400, 800);
    }

    // 8. 官方通道上传文章封面图
    let coverUploaded = false;
    let coverUrl = null;
    if (data.cover && data.cover.type !== 'none') {
      log('正在通过官方通道上传封面图...');
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

        const fileInput = panel.querySelector('.coverselector_container input[type="file"]');
        const uploaderVue = fileInput ? (fileInput.__vue__ || fileInput.parentElement?.__vue__) : null;

        if (file && uploaderVue && typeof uploaderVue.onFileSelected === 'function') {
          uploaderVue.onFileSelected({ target: { files: [file] } });
          
          // 等待上传完成
          let waitTime = 0;
          while (waitTime < 10000) {
            await delay(500);
            waitTime += 500;
            if (!uploaderVue.updating && panelVue.post?.cover_image) {
              coverUploaded = true;
              coverUrl = panelVue.post.cover_image;
              break;
            }
          }
          if (panelVue.post?.cover_image) {
            coverUploaded = true;
            coverUrl = panelVue.post.cover_image;
          }
          log('封面图上传结果: ' + (coverUploaded ? '成功' : '完成'));
        }
      } catch (e) {
        log('封面图处理异常: ' + e.message);
      }
      await randomDelay(500, 900);
    }

    // 9. 填写文章摘要
    if (data.summary) {
      log('正在填写文章摘要: ' + data.summary);
      const summaryEl = panel.querySelector('.publish-popup textarea, .panel textarea');
      if (summaryEl) {
        summaryEl.focus();
        await randomDelay(200, 400);
        summaryEl.value = data.summary;
        summaryEl.dispatchEvent(new Event('input', { bubbles: true }));
        summaryEl.dispatchEvent(new Event('change', { bubbles: true }));
        summaryEl.blur();
      }
      if (panelVue.post) {
        panelVue.post.brief_content = data.summary;
      }
      await randomDelay(400, 700);
    }

    // 10. 点击「取消」关闭发布面板（严格仅存为草稿，绝不触发公开发布）
    log('正在关闭发布设置面板并保留草稿配置...');
    const cancelBtn = Array.from(panel.querySelectorAll('button')).find(b => b.innerText.trim() === '取消');
    if (cancelBtn) {
      cancelBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cancelBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await randomDelay(200, 400);
      cancelBtn.click();
    }
    await randomDelay(600, 1000);
  }

  // 11. 触发草稿保存并校验状态
  log('正在触发草稿箱保存更新...');
  if (parentVue && typeof parentVue.update === 'function') {
    try {
      parentVue.update();
    } catch (e) {
      log('触发 update 提示: ' + e.message);
    }
  }

  await delay(2500);

  // 12. 获取草稿保存状态反馈
  const statusTexts = Array.from(document.querySelectorAll('header *, nav *, [class*="status"] *'))
    .map(el => el.innerText ? el.innerText.trim() : '')
    .filter(t => t && (t.includes('保存') || t.includes('草稿')));

  const draftId = parentVue?.draft?.id || (window.location.href.match(/drafts\\/(\\d+)/) ? window.location.href.match(/drafts\\/(\\d+)/)[1] : null);

  return {
    success: true,
    draftId,
    title: data.title,
    category: data.category,
    tags: parentVue?.draft?.tags?.map(t => t.title) || data.tags,
    summary: data.summary,
    coverUrl: parentVue?.draft?.cover_image || null,
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
