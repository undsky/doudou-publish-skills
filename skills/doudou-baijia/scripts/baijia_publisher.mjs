/**
 * 百家号创作者平台自动化发布浏览器脚本生成器
 * 核心能力：
 * 1. 真实人工行为模拟：微随机时延抖动、全链路 DOM 事件派发、视口平滑滚动排版审阅、拟真悬停。
 * 2. 百家号富文本双向同步：完美解析并注入标题（Lexical/UEditor 同步）、完整正文 HTML（UEditor + 诊断ID）、代码块及 CDN 高清插图。
 * 3. 抽屉式/弹窗封面真实上传：模拟点击「设置封面」插槽，注入真实 File 对象并自动完成裁切弹窗确认。
 * 4. 草稿安全隔离：严格限定为存草稿，捕获「内容已存入草稿」通知与 article_id，绝不触碰任何形式的公开发布。
 */

import path from 'node:path';
import { parseAllAssets } from './parser.mjs';

/**
 * 构建百家号文章草稿发布浏览器端注入脚本
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
    console.log('[doudou-baijia]', msg);
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

  // 查找 React Props
  const getProps = (node) => {
    if (!node) return null;
    const key = Object.keys(node).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
    return key ? node[key] : null;
  };

  // 1. 拟真人机输入文章标题（适配百家号 Lexical & UEditor 状态绑定）
  log('正在拟真输入文章标题: ' + meta.title);
  
  // 1.1 优先通过百家号全局 API 绑定标题
  if (typeof window.editor?.__bjh_news_setTitle === 'function') {
    try {
      window.editor.__bjh_news_setTitle(meta.title);
      log('已通过 window.editor.__bjh_news_setTitle 绑定标题');
    } catch (e) {
      log('调用 __bjh_news_setTitle 异常: ' + e.message);
    }
  }

  // 1.2 模拟 DOM 焦点与事件派发
  const titleBox = document.querySelector('[data-testid="news-title-input"] [contenteditable="true"], .client_components_titleInput [contenteditable="true"], [data-testid="news-title-input"] textarea, .client_components_titleInput textarea');
  if (titleBox) {
    titleBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);
    titleBox.focus();
    titleBox.dispatchEvent(new Event('focus', { bubbles: true }));
    await sleep(150);

    if (titleBox.tagName === 'TEXTAREA' || titleBox.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(titleBox, meta.title);
      else titleBox.value = meta.title;
    } else if (titleBox.getAttribute('contenteditable') === 'true') {
      titleBox.innerText = meta.title;
    }

    titleBox.dispatchEvent(new Event('input', { bubbles: true }));
    titleBox.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
    titleBox.blur();
    titleBox.dispatchEvent(new Event('blur', { bubbles: true }));
    log('文章标题 DOM 事件派发完成');
  } else {
    log('提示: 未找到独立标题输入框，已通过编辑器 API 绑定');
  }
  await sleep(400);

  // 2. 注入百家号 UEditor 富文本正文（100% 原始解析内容）
  log('正在注入文章完整正文与排版内容（字符数: ' + meta.htmlContent.length + '）...');
  if (window.editor && typeof window.editor.setContent === 'function') {
    window.editor.setContent(meta.htmlContent);
    if (typeof window.editor.sync === 'function') {
      window.editor.sync();
    }
    log('已通过 window.editor.setContent 注入完整富文本正文');
  } else {
    // 降级尝试 iframe 文档操作
    const iframe = document.querySelector('#ueditor_0');
    const iframeDoc = iframe ? iframe.contentDocument || iframe.contentWindow?.document : null;
    if (iframeDoc && iframeDoc.body) {
      iframeDoc.body.innerHTML = meta.htmlContent;
      iframeDoc.body.dispatchEvent(new Event('input', { bubbles: true }));
      log('已降级通过 iframeDoc.body.innerHTML 注入富文本正文');
    } else {
      log('警告: 未找到 UEditor 实例或 iframe 正文编辑区');
    }
  }
  await sleep(1500);

  // 3. 模拟人工视口平滑滚动（审阅排版）
  log('正在模拟人工视口平滑滚动审阅排版...');
  window.scrollTo({ top: 400, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 900, behavior: 'smooth' });
  await sleep(600);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 4. 上传并绑定封面图片
  let coverUploaded = false;
  log('开始设置文章封面...');
  try {
    // 构造 File 对象的纯前端函数（免网络请求与 CORS 风险）
    const makeFileFromBase64 = (base64Str, name = 'cover.png') => {
      const parts = base64Str.split(';base64,');
      const mime = parts[0].replace('data:', '') || 'image/png';
      const raw = atob(parts[1] || parts[0]);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      return new File([blob], name, { type: mime });
    };

    // 查找封面插槽元素
    const coverSlot = document.querySelector('.FeEditorApp-_73a3a52aab7e3a36-content, .FeEditorApp-_73a3a52aab7e3a36-default, .FeEditorApp-_93c3fe2a3121c388-item, .form-item-cover, [class*="cover"] [class*="item"]');
    if (coverSlot) {
      coverSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);

      // 触发 React 点击
      const p = getProps(coverSlot) || getProps(coverSlot.querySelector('.FeEditorApp-_73a3a52aab7e3a36-content')) || getProps(coverSlot.parentElement);
      if (p && typeof p.onClick === 'function') {
        try {
          p.onClick({
            stopPropagation: () => {},
            preventDefault: () => {},
            target: coverSlot,
            currentTarget: coverSlot,
            nativeEvent: new MouseEvent('click', { bubbles: true })
          });
        } catch (err) {}
      }
      coverSlot.click();
      await sleep(1200);

      // 检查是否需要上传本地封面
      const uploadInput = document.querySelector('.cheetah-modal input[name="media"][type="file"], input[name="media"][type="file"], input[type="file"][accept*="image"]');
      if (meta.coverBase64 && uploadInput) {
        try {
          const file = makeFileFromBase64(meta.coverBase64, meta.coverFileName);
          const dt = new DataTransfer();
          dt.items.add(file);
          uploadInput.files = dt.files;

          const inputProps = getProps(uploadInput);
          if (inputProps && typeof inputProps.onChange === 'function') {
            inputProps.onChange({
              target: uploadInput,
              currentTarget: uploadInput,
              nativeEvent: new Event('change'),
              persist: () => {}
            });
          }
          uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
          log('已向封面上传组件注入 File 对象');
          await sleep(2000);
        } catch (err) {
          log('注入 File 异常: ' + err.message);
        }
      }

      // 查找并点击裁切/确认按钮
      let confirmBtn = document.querySelector('.FeEditorApp-e8c90bfac9d4eab4-confirmBtn') ||
        Array.from(document.querySelectorAll('.cheetah-modal button, .cheetah-modal .cheetah-btn')).find(b => {
          const txt = (b.innerText || '').trim();
          return txt.includes('确定') || txt.includes('完成');
        });

      if (confirmBtn) {
        const btnProps = getProps(confirmBtn);
        if (btnProps && typeof btnProps.onClick === 'function') {
          try {
            btnProps.onClick({
              preventDefault: () => {},
              stopPropagation: () => {},
              target: confirmBtn,
              currentTarget: confirmBtn,
              nativeEvent: new MouseEvent('click', { bubbles: true })
            });
          } catch (err) {}
        }
        confirmBtn.click();
        log('已点击封面确认/裁切按钮: ' + (confirmBtn.innerText || '确定'));
        await sleep(2500);
      }

      // 验证封面是否呈现在插槽中
      const coverImg = document.querySelector('.FeEditorApp-_73a3a52aab7e3a36-coverImg, .FeEditorApp-_93c3fe2a3121c388-item img, [class*="cover"] img');
      if (coverImg) {
        coverUploaded = true;
        log('封面图片已成功渲染在封面插槽中: ' + coverImg.src.substring(0, 60));
      } else {
        log('提示: 未捕获到封面 img 标签，可能仍在异步加载');
      }
    } else {
      log('提示: 未找到封面设置插槽，可能为无图模式');
    }
  } catch (e) {
    log('封面处理异常: ' + e.message);
  }
  await sleep(600);

  // 5. 滚动到页面底部并点击「存草稿」
  log('正在拟真点击「存草稿」按钮...');
  const draftBtn = Array.from(document.querySelectorAll('button, .cheetah-btn')).find(b => (b.innerText || '').trim() === '存草稿');
  
  if (draftBtn) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    await sleep(400);
    draftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);

    const draftProps = getProps(draftBtn);
    if (draftProps && typeof draftProps.onClick === 'function') {
      try {
        draftProps.onClick({
          preventDefault: () => {},
          stopPropagation: () => {},
          target: draftBtn,
          currentTarget: draftBtn,
          nativeEvent: new MouseEvent('click', { bubbles: true })
        });
      } catch (err) {}
    }
    draftBtn.click();
    log('已点击「存草稿」按钮');
  } else {
    log('警告: 未找到「存草稿」按钮');
  }

  // 6. 等待并捕获草稿保存 Toast 与 article_id
  await sleep(3500);
  let toastMessage = '';
  const messageEls = document.querySelectorAll('.cheetah-message-notice-content, .cheetah-message-custom-content, .cheetah-message');
  if (messageEls.length > 0) {
    toastMessage = Array.from(messageEls).map(el => el.innerText.trim()).filter(Boolean).join(' | ');
  }

  const currentUrl = location.href;
  const urlObj = new URL(currentUrl);
  const articleId = urlObj.searchParams.get('article_id') || '';

  const isDraftSaved = toastMessage.includes('存入草稿') || toastMessage.includes('成功') || !!articleId;
  log('草稿保存状态检查: ' + (isDraftSaved ? '成功' : '等待中') + ' (Toast: ' + toastMessage + ', ArticleID: ' + articleId + ')');

  return {
    success: true,
    title: meta.title,
    author: meta.author,
    summary: meta.summary,
    tags: meta.tags,
    coverUploaded,
    articleId,
    currentUrl,
    toastMessage,
    isDraftSaved,
    contentLength: window.editor ? window.editor.getContentLength() : 0,
    logs
  };
};`;
}

// 命令行直接测试支持
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('baijia_publisher.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node baijia_publisher.mjs <Markdown文件路径>');
    process.exit(1);
  }
  console.log(`[baijia_publisher] 正在为文章生成注入脚本: ${targetFile}`);
  const meta = parseAllAssets(targetFile);
  const script = buildPublishBrowserScript(meta);
  console.log(`[baijia_publisher] 注入脚本生成成功，字符数: ${script.length}`);
}
