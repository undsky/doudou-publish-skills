import fs from 'node:fs';

const html = fs.readFileSync('/Users/jyx/project/undsky/mds/AICoding/ddagent/ddagent_排版_摸鱼绿(moyu-green).html', 'utf-8');

// 将 html 拆分成 2 个小段，每段约 14KB
const mid = Math.floor(html.length / 2);
const chunk1 = html.substring(0, mid);
const chunk2 = html.substring(mid);

fs.writeFileSync('./scripts/chunk_1.js', `() => {
  window.__fullHtmlChunk1 = ${JSON.stringify(chunk1)};
  return { len1: window.__fullHtmlChunk1.length };
}`);

fs.writeFileSync('./scripts/chunk_2.js', `() => {
  window.__fullHtmlChunk2 = ${JSON.stringify(chunk2)};
  const fullHtml = window.__fullHtmlChunk1 + window.__fullHtmlChunk2;
  
  const bodyPm = document.querySelector(".rich_media_content .ProseMirror");
  if (!bodyPm) return { error: "未找到 ProseMirror" };

  bodyPm.focus();

  let pasted = false;
  try {
    const dt = new DataTransfer();
    dt.setData("text/html", fullHtml);
    dt.setData("text/plain", "智能体工业化封装实战指南");
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    bodyPm.dispatchEvent(pasteEvent);
    pasted = true;
  } catch (e) {
    console.error(e);
  }

  // 兜底直接 innerHTML
  if (bodyPm.innerText.trim().length < 500) {
    bodyPm.innerHTML = fullHtml;
    bodyPm.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return {
    pasted,
    textLength: bodyPm.innerText.length,
    htmlLength: bodyPm.innerHTML.length,
    imgCount: bodyPm.querySelectorAll("img").length
  };
}`);

console.log('Chunk scripts created.');
