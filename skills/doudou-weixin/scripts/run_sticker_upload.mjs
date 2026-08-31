import fs from 'node:fs';
import path from 'node:path';
import { parseAllAssets } from './parser.mjs';

const targetFile = '/Users/jyx/project/undsky/mds/AICoding/ddagent.md';
const meta = parseAllAssets(targetFile);

console.log(`[Sticker Script Builder] 正在构建 ${meta.title} 的贴图上传脚本`);
console.log(`- 贴图卡片数量: ${meta.stickerImages.length}`);

// 生成注入代码：由于贴图数量 5 张，我们生成一个分步调用的步骤文件
meta.stickerImages.forEach((img, idx) => {
  const injectCode = `() => {
    window.__stickerImages = window.__stickerImages || [];
    window.__stickerImages[${idx}] = {
      name: ${JSON.stringify(img.name)},
      mimeType: ${JSON.stringify(img.mimeType)},
      base64: ${JSON.stringify(img.base64)}
    };
    return { index: ${idx}, name: "${img.name}", total: window.__stickerImages.filter(Boolean).length };
  }`;
  fs.writeFileSync(`./scripts/step_img_${idx}.js`, injectCode);
});

// 生成最后的主执行脚本
const finishCode = `async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.random() * 200));

  const meta = {
    title: "${meta.title.length > 20 ? meta.title.substring(0, 18) + '...' : meta.title}",
    description: ${JSON.stringify(meta.stickerDesc)},
    stickerImages: window.__stickerImages || []
  };

  console.log('[doudou-weixin] 贴图图片就绪，数量:', meta.stickerImages.length);

  // 1. 批量上传贴图卡片
  if (meta.stickerImages && meta.stickerImages.length > 0) {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const targetInput = fileInputs.find(i => i.accept?.includes('image/png') || i.accept?.includes('image/jpeg') || i.accept?.includes('image/bmp')) || fileInputs[1] || fileInputs[0];

    if (targetInput) {
      const dt = new DataTransfer();
      for (const item of meta.stickerImages) {
        if (!item) continue;
        const base64Data = item.base64.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: item.mimeType || 'image/png' });
        const file = new File([blob], item.name, { type: item.mimeType || 'image/png' });
        dt.items.add(file);
      }

      targetInput.files = dt.files;
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[doudou-weixin] 已触发贴图图片上传事件');
      await sleep(2500);
    }
  }

  // 2. 拟真输入标题
  const titleHidden = document.querySelector('#title');
  if (titleHidden) {
    titleHidden.value = meta.title;
    titleHidden.dispatchEvent(new Event('input', { bubbles: true }));
    titleHidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const pms = Array.from(document.querySelectorAll('.ProseMirror'));
  const titlePm = pms[0];
  if (titlePm) {
    titlePm.focus();
    await sleep(250);
    titlePm.innerHTML = '<p>' + meta.title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    titlePm.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await sleep(400);

  // 3. 拟真输入描述正文
  const descPm = pms[1] || pms[pms.length - 1];
  if (descPm) {
    descPm.focus();
    await sleep(300);
    const paragraphs = meta.description.split('\\n\\n').map(p => '<p>' + p.replace(/\\n/g, '<br>') + '</p>').join('');
    descPm.innerHTML = paragraphs;
    descPm.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await sleep(600);

  // 4. 模拟自然视口滚动检查
  window.scrollTo({ top: 300, behavior: 'smooth' });
  await sleep(500);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(400);

  // 5. 拟真悬停并点击「保存为草稿」
  const submitBtn = document.querySelector('#js_submit button') || document.querySelector('#js_submit') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '保存为草稿');
  if (!submitBtn) {
    return { success: false, error: '未找到保存草稿按钮' };
  }

  submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  submitBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  submitBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(400);
  submitBtn.click();

  // 6. 等待保存反馈
  await sleep(2500);

  const finalUrl = location.href;
  const matchDraft = finalUrl.match(/appmsgid=(\\d+)/);
  const appmsgid = matchDraft ? matchDraft[1] : null;

  return {
    success: true,
    type: 'sticker',
    appmsgid,
    title: meta.title,
    cardCount: meta.stickerImages.length,
    url: finalUrl
  };
};`;

fs.writeFileSync('./scripts/step_finish.js', finishCode);
console.log('所有步骤构建完成！');
