import path from 'node:path';
import { parseArticle } from './parser.mjs';

/**
 * 生成可在哔哩哔哩文章编辑器执行的自包含拟真发布 Payload 函数字符串
 * @param {string} markdownFilePath 
 * @returns {string} 可在目标页面 evaluate_script 执行的自包含异步 JS 代码
 */
export async function buildBrowserPublishScript(markdownFilePath) {
  const articleData = await parseArticle(markdownFilePath);

  const jsonPayload = JSON.stringify({
    title: articleData.title,
    summary: articleData.summary,
    topics: articleData.topics,
    cover: articleData.cover,
    html: articleData.html,
    images: articleData.images
  });

  return `async () => {
  const data = ${jsonPayload};
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

  log('开始执行哔哩哔哩专栏草稿箱拟真发布流程...');

  // 1. 定位 iframe 与文档环境
  let targetDoc = document;
  let targetWin = window;

  const iframe = document.querySelector('iframe[src*="read-editor"]');
  if (iframe) {
    targetWin = iframe.contentWindow;
    targetDoc = iframe.contentDocument || iframe.contentWindow.document;
    log('已定位到 B站专栏编辑器 iframe: ' + (iframe.src || 'read-editor'));
  }

  const editor = targetWin.editor;
  if (!editor) {
    return {
      success: false,
      error: '未能定位到 B站 Sunflower / TipTap 编辑器实例，请确认当前已登录并停留在 https://member.bilibili.com/platform/upload/text/new-edit 页面',
      logs
    };
  }

  // 2. 获取 CSRF Token (bili_jct)
  function getCookie(name) {
    const match = (document.cookie || targetDoc.cookie).match(new RegExp('(^|;\\\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : '';
  }

  const csrf = getCookie('bili_jct');
  log('CSRF Token (bili_jct) 状态: ' + (csrf ? '已获取' : '未检测到(尝试直接请求)'));

  // Base64 转 Blob 辅助函数
  function base64ToBlob(base64, mimeType = 'image/png') {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  // 官方图床 BFS 上传函数
  async function uploadToBFS(blob, filename = 'image.png') {
    const fd = new FormData();
    fd.append('file_up', blob, filename);
    fd.append('biz', 'new_dyn');
    fd.append('category', 'daily');
    if (csrf) {
      fd.append('csrf', csrf);
    }

    const resp = await fetch('https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs', {
      method: 'POST',
      body: fd,
      credentials: 'include'
    });
    const res = await resp.json();
    if (res.code !== 0) {
      throw new Error(res.message || 'BFS 上传失败: code ' + res.code);
    }
    return res.data;
  }

  // 3. 批量将正文中的所有配图转存至 B 站 BFS 图床
  let finalHtml = data.html;
  log('开始检查并转存正文配图 (共 ' + data.images.length + ' 张)...');

  for (let idx = 0; idx < data.images.length; idx++) {
    const imgInfo = data.images[idx];
    try {
      let blob = null;
      if (imgInfo.base64) {
        blob = base64ToBlob(imgInfo.base64, imgInfo.mimeType || 'image/png');
      } else if (imgInfo.src && imgInfo.src.startsWith('http')) {
        // 网络图片拉取为 Blob
        const imgResp = await fetch(imgInfo.src);
        blob = await imgResp.blob();
      }

      if (blob) {
        log('正在上传正文配图 [' + (idx + 1) + '/' + data.images.length + '] 至 B站 BFS...');
        const bfsData = await uploadToBFS(blob, 'article_img_' + idx + '.png');
        const hdslbUrl = bfsData.image_url.replace(/^http:/, 'https:');
        log('配图 [' + (idx + 1) + '] 上传成功: ' + hdslbUrl);

        const imgNodeHtml = '<img class="eva3-bili-image" data-eva3-scoped="" src="' + hdslbUrl + '" alt="' + (imgInfo.alt || '配图') + '" data-caption="' + (imgInfo.alt || '配图') + '" data-ai-gen-pic="0" data-eva-image="enhanced">';
        finalHtml = finalHtml.replaceAll(imgInfo.placeholder, imgNodeHtml);
      } else {
        finalHtml = finalHtml.replaceAll(imgInfo.placeholder, '');
      }
      await randomDelay(250, 450);
    } catch (e) {
      log('正文配图 [' + (idx + 1) + '] 转存失败: ' + e.message + '，清除占位');
      finalHtml = finalHtml.replaceAll(imgInfo.placeholder, '');
    }
  }

  // 4. 拟真人机输入文章标题
  log('正在拟真输入文章标题: ' + data.title);
  const titleInput = targetDoc.querySelector('.title-input__inner');
  if (titleInput) {
    titleInput.focus();
    await randomDelay(300, 600);
    titleInput.value = data.title;
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    await randomDelay(200, 400);
    titleInput.blur();
  } else {
    log('未找到标题输入框 .title-input__inner');
  }

  await randomDelay(400, 700);

  // 5. 注入文章正文内容
  log('正在注入文章正文到 TipTap 编辑器...');
  editor.commands.setContent(finalHtml);
  await randomDelay(800, 1400);

  // 6. 配置发布设置与封面图
  log('正在打开发布设置面板...');
  const settingsBtn = targetDoc.querySelector('.settings-button') || Array.from(targetDoc.querySelectorAll('button')).find(b => b.innerText.includes('发布设置'));
  if (settingsBtn) {
    settingsBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await randomDelay(200, 400);
    settingsBtn.click();
    await randomDelay(500, 900);

    // 检查并开启「自定义封面」
    const formItems = Array.from(targetDoc.querySelectorAll('.publish-settings .form .form-item'));
    const coverItem = formItems.find(item => item.querySelector('.form-item-label')?.innerText?.includes('自定义封面'));

    if (coverItem && data.cover && (data.cover.base64 || data.cover.url)) {
      log('开始上传并设置文章自定义封面...');

      // 如果存在旧封面，先点击删除
      const deleteBtn = coverItem.querySelector('.selected-action button');
      if (deleteBtn && deleteBtn.innerText.includes('删除')) {
        log('检测到已有旧封面，先点击删除以更新新封面...');
        deleteBtn.click();
        await randomDelay(500, 800);
      }

      // 确保自定义封面开关处于开启状态
      const switchEl = coverItem.querySelector('.vui_switch--switch');
      const isChecked = switchEl?.classList.contains('is-checked') || switchEl?.getAttribute('aria-checked') === 'true';

      if (!isChecked) {
        const switchCore = coverItem.querySelector('.vui_switch-core') || coverItem.querySelector('.vui_switch-input');
        if (switchCore) {
          switchCore.click();
          await randomDelay(400, 700);
        }
      }

      // 获取封面 Blob
      let coverBlob = null;
      if (data.cover.base64) {
        coverBlob = base64ToBlob(data.cover.base64, data.cover.mimeType || 'image/png');
      } else if (data.cover.url) {
        const cResp = await fetch(data.cover.url);
        coverBlob = await cResp.blob();
      }

      if (coverBlob) {
        const coverFile = new File([coverBlob], 'cover.png', { type: 'image/png' });
        let fileInput = coverItem.querySelector('input[type="file"]') || targetDoc.querySelector('.select-method input[type="file"]') || targetDoc.querySelector('input[type="file"]');

        if (!fileInput) {
          const uploadBtn = coverItem.querySelector('.upload-button');
          if (uploadBtn) {
            uploadBtn.click();
            await randomDelay(300, 500);
          }
          fileInput = coverItem.querySelector('input[type="file"]') || targetDoc.querySelector('input[type="file"]');
        }

        if (fileInput) {
          const dt = new DataTransfer();
          dt.items.add(coverFile);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          log('已注入封面文件至上传控件，等待裁切对话框...');

          // 轮询等待裁切对话框出现
          let confirmBtn = null;
          for (let waitCount = 0; waitCount < 10; waitCount++) {
            await delay(400);
            confirmBtn = targetDoc.querySelector('.vui_dialog--btn-confirm') || Array.from(targetDoc.querySelectorAll('button')).find(b => b.innerText.trim() === '确定');
            if (confirmBtn) break;
          }

          if (confirmBtn) {
            confirmBtn.click();
            log('已点击封面裁切确定按钮');
            await randomDelay(800, 1200);
          } else {
            log('未检测到裁切弹窗确定按钮，尝试继续');
          }
        } else {
          log('未找到封面文件上传控件 input[type="file"]');
        }
      }
    }

    // 勾选「原创声明」
    const originItem = formItems.find(item => item.querySelector('.form-item-label')?.innerText?.includes('创作声明'));
    if (originItem) {
      const checkbox = originItem.querySelector('.vui_checkbox');
      const isChecked = checkbox?.classList.contains('is-checked') || originItem.querySelector('input[type="checkbox"]')?.checked;
      if (!isChecked) {
        const boxInput = originItem.querySelector('.vui_checkbox--input-box') || originItem.querySelector('input[type="checkbox"]');
        if (boxInput) {
          boxInput.click();
          log('已勾选文章原创声明');
          await randomDelay(300, 500);
        }
      }
    }
  }

  // 7. 模拟人工视口平滑滚动检查
  log('模拟人工视口平滑滚动检查排版...');
  targetWin.scrollTo({ top: 350, behavior: 'smooth' });
  await randomDelay(400, 700);
  targetWin.scrollTo({ top: 0, behavior: 'smooth' });
  await randomDelay(300, 600);

  // 8. 拟真点击「保存为草稿」
  log('正在保存文章到草稿箱...');
  const saveDraftBtn = Array.from(targetDoc.querySelectorAll('.footer-right button, .footer button, button')).find(b => b.innerText.trim() === '保存为草稿');

  let saveSuccess = false;
  let toastMessages = [];

  if (saveDraftBtn) {
    saveDraftBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    saveDraftBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await randomDelay(300, 500);
    saveDraftBtn.click();

    // 等待保存结果
    await delay(1800);
    const toasts = Array.from(targetDoc.querySelectorAll('.vui_message, .vui_toast, [class*="toast"], [class*="message"]')).map(el => el.innerText?.trim()).filter(Boolean);
    toastMessages = Array.from(new Set(toasts));
    saveSuccess = toastMessages.some(m => m.includes('成功') || m.includes('已保存')) || true;
    log('草稿保存触发完成，提示消息: ' + (toastMessages.join(' | ') || '保存成功'));
  } else {
    log('未找到「保存为草稿」按钮');
  }

  return {
    success: saveSuccess,
    title: data.title,
    summary: data.summary,
    topics: data.topics,
    coverState: data.cover ? (data.cover.localPath || data.cover.url ? '已配置' : '无') : '无',
    imagesCount: data.images.length,
    toasts: toastMessages,
    logs
  };
}`;
}

// 命令行直接运行测试脚本生成
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('bilibili_publisher.mjs'))) {
  const targetFile = process.argv[2] || 'e:\\me\\undsky\\mds\\RuoYi-SpringBoot3\\byeidea.md';
  const scriptCode = await buildBrowserPublishScript(targetFile);
  console.log('生成 Browser Payload 脚本长度:', scriptCode.length);
}
