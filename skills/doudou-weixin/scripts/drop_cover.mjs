import fs from 'node:fs';

const { base64 } = JSON.parse(fs.readFileSync('./scripts/temp_cover_b64.json', 'utf-8'));

const code = `async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const base64Data = "${base64}".split(',')[1];
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/png' });
  const file = new File([blob], 'cover-main-2.35x1.png', { type: 'image/png' });

  const dt = new DataTransfer();
  dt.items.add(file);

  // 1. 寻找 drop 接收目标
  const dropTargets = Array.from(document.querySelectorAll('.image_upload_dnd_wrp_mask, .image_upload_dnd_wrp_container, .weui-desktop-img-picker, .weui-desktop-dialog__bd, #js_cover_area, .cover_drop_inner_wrp'));

  let triggered = [];
  for (const target of dropTargets) {
    if (target) {
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      triggered.push(target.className);
    }
  }

  await sleep(2500);

  // 2. 检查是否有图片项出现
  const dialog = Array.from(document.querySelectorAll('.weui-desktop-dialog')).find(d => d.innerText.includes('选择图片'));
  const imgItems = dialog ? Array.from(dialog.querySelectorAll('.weui-desktop-img-picker__item, .img_item, li[class*="img"], .weui-desktop-img-picker__list img')) : [];

  return {
    triggeredCount: triggered.length,
    triggered,
    imgFound: imgItems.length
  };
};`;

fs.writeFileSync('./scripts/eval_drop_cover.js', code);
console.log('Drop script written.');
