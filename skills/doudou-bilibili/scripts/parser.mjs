import fs from 'node:fs';
import path from 'node:path';

/**
 * 提取 Markdown 标题（B站专栏标题上限50字，建议30字以内）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractTitle(content, fallbackTitle = '未命名文章') {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      const t = trimmed.replace(/^#\s+/, '').trim();
      return cleanMarkdownText(t);
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
      const t = trimmed.replace(/^[#\s*`]+/, '').trim();
      return cleanMarkdownText(t);
    }
  }
  return fallbackTitle;
}

/**
 * 清洗 Markdown 特殊格式字符
 * @param {string} text 
 * @returns {string}
 */
export function cleanMarkdownText(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/>\s*/g, '')
    .trim();
}

/**
 * 从正文中提炼纯文本摘要（60~120字）
 * @param {string} content 
 * @returns {string}
 */
export function extractSummary(content) {
  const lines = content.split('\n');
  const textBlocks = [];
  let isCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      isCodeBlock = !isCodeBlock;
      continue;
    }
    if (isCodeBlock) continue;
    if (!trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('<!--') || trimmed.startsWith('![')) {
      continue;
    }

    const cleanText = cleanMarkdownText(trimmed);
    if (cleanText.length > 10) {
      textBlocks.push(cleanText);
    }
    if (textBlocks.join(' ').length >= 80) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (summary.length > 120) {
    summary = summary.substring(0, 117) + '...';
  }
  return summary || '本文分享了深度技术实践与架构解析，欢迎阅读与交流。';
}

/**
 * 提取话题标签关键词
 * @param {string} content 
 * @param {string} title 
 * @returns {string[]}
 */
export function extractTopics(content, title = '') {
  const keywordsMap = [
    { topic: 'AI编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'opencode', 'cursor', 'antigravity', 'vibe coding'] },
    { topic: '人工智能', matches: ['ai', '人工智能', '大模型', 'llm', 'deepseek', 'gpt', 'openai'] },
    { topic: '程序员', matches: ['程序员', '开发', '代码', '架构', '技术', '后端', '前端'] },
    { topic: 'SpringBoot', matches: ['springboot', 'spring boot', 'spring', 'java', 'ruoyi', '若依'] },
    { topic: '独立开发', matches: ['独立开发', '全栈', '出海', '商业化', '产品'] },
    { topic: 'Docker', matches: ['docker', '容器', 'docker-compose', 'k8s'] },
    { topic: '开发工具', matches: ['ide', 'vscode', 'idea', 'jetbrains', 'devtools', '效率工具'] }
  ];

  const fullText = (title + ' ' + content).toLowerCase();
  const matched = [];

  for (const item of keywordsMap) {
    if (item.matches.some(m => fullText.includes(m))) {
      if (!matched.includes(item.topic)) {
        matched.push(item.topic);
      }
    }
    if (matched.length >= 3) break;
  }

  if (matched.length === 0) {
    matched.push('程序员', 'AI编程');
  }

  return matched;
}

/**
 * 解析封面图资产（遵循 doudou-markdown-skill 规约）
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ type: 'cdn'|'local'|'none', url?: string, localPath?: string, base64?: string, mimeType?: string }}
 */
export function resolveCoverImage(markdownFilePath, content) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const stem = path.basename(absPath, ext);
  const artifactDir = path.join(dir, stem);

  // 1. 优先从同名目录的 cdn_manifest.json 查找
  const manifestPath = path.join(artifactDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (Array.isArray(manifest.assets)) {
        const coverAssets = manifest.assets.filter(a => a.type === 'cover');
        const mainCover = coverAssets.find(a => a.aspect_ratio === '16:9' || a.slug?.includes('16x9') || a.slug?.includes('16_9'))
          || coverAssets.find(a => a.aspect_ratio === '2.35:1' || a.slug?.includes('2.35') || a.slug?.includes('main'))
          || coverAssets.find(a => a.aspect_ratio === '1:1' || a.slug?.includes('1x1'))
          || coverAssets[0];

        if (mainCover) {
          let localFullPath = mainCover.local_path ? path.resolve(artifactDir, mainCover.local_path) : undefined;
          let base64Data = null;
          let mimeType = 'image/jpeg';
          if (localFullPath && fs.existsSync(localFullPath)) {
            const extName = path.extname(localFullPath).toLowerCase().replace('.', '');
            mimeType = extName === 'png' ? 'image/png' : 'image/jpeg';
            base64Data = fs.readFileSync(localFullPath).toString('base64');
          }
          return {
            type: base64Data ? 'local' : 'cdn',
            url: mainCover.cdn_url,
            localPath: localFullPath,
            base64: base64Data || undefined,
            mimeType
          };
        }
      }
    } catch (e) {
      // 忽略解析错误
    }
  }

  // 2. 从同名目录的 cover/images 查找本地图片
  const coverImagesDir = path.join(artifactDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir) && fs.statSync(coverImagesDir).isDirectory()) {
    const files = fs.readdirSync(coverImagesDir);
    const validExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const imageFiles = files.filter(f => validExts.includes(path.extname(f).toLowerCase()) && !f.includes('yuantu'));

    // 优先选择 16x9、2.35x1、cover.png、main
    const targetFile = imageFiles.find(f => f.includes('16x9') || f.includes('16_9'))
      || imageFiles.find(f => f.includes('2.35') || f.includes('main') || f.includes('cover'))
      || imageFiles.find(f => f.includes('1x1'))
      || imageFiles[0];

    if (targetFile) {
      const fullLocalPath = path.join(coverImagesDir, targetFile);
      const extName = path.extname(targetFile).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : 'image/jpeg';
      const buffer = fs.readFileSync(fullLocalPath);
      return {
        type: 'local',
        localPath: fullLocalPath,
        base64: buffer.toString('base64'),
        mimeType
      };
    }
  }

  // 3. 检查正文开头的网络/本地图片
  const topLines = content.split('\n').slice(0, 10).join('\n');
  const topImgMatch = topLines.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (topImgMatch && topImgMatch[1]) {
    return {
      type: 'cdn',
      url: topImgMatch[1]
    };
  }

  // 4. 从 Markdown 正文任意位置提取第一张网络图片
  const imgMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (imgMatch && imgMatch[1]) {
    return {
      type: 'cdn',
      url: imgMatch[1]
    };
  }

  // 5. 本地相对路径图片
  const localImgMatch = content.match(/!\[.*?\]\(([^)]+)\)/);
  if (localImgMatch && localImgMatch[1] && !localImgMatch[1].startsWith('http')) {
    const fullImgPath = path.resolve(dir, localImgMatch[1]);
    if (fs.existsSync(fullImgPath)) {
      const extName = path.extname(fullImgPath).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : 'image/jpeg';
      const buffer = fs.readFileSync(fullImgPath);
      return {
        type: 'local',
        localPath: fullImgPath,
        base64: buffer.toString('base64'),
        mimeType
      };
    }
  }

  return { type: 'none' };
}

/**
 * 将 Markdown 转换为适配 Bilibili TipTap/Sunflower 编辑器的 HTML 并提取所有需上传的图片
 * @param {string} markdown 
 * @param {string} baseDir 
 * @returns {{ html: string, images: Array<{ id: string, placeholder: string, alt: string, src: string, type: 'cdn'|'local', base64?: string, mimeType?: string }> }}
 */
export function convertMarkdownToBilibiliHtml(markdown, baseDir) {
  const lines = markdown.split('\n');
  const images = [];
  let imageCounter = 0;

  const htmlChunks = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeBuffer = [];
  let inList = false;
  let listType = 'ul'; // 'ul' or 'ol'
  let inBlockquote = false;
  let blockquoteBuffer = [];

  function flushList() {
    if (inList) {
      htmlChunks.push(`</${listType}>`);
      inList = false;
    }
  }

  function flushBlockquote() {
    if (inBlockquote) {
      const bqHtml = blockquoteBuffer.map(inlineFormat).join('<br>');
      htmlChunks.push(`<blockquote class="eva3-blockquote" data-eva3-scoped=""><p data-eva3-scoped="">${bqHtml}</p></blockquote>`);
      blockquoteBuffer = [];
      inBlockquote = false;
    }
  }

  function inlineFormat(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. 代码块处理
    if (trimmed.startsWith('```')) {
      flushList();
      flushBlockquote();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = trimmed.replace(/^```/, '').trim();
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        const codeText = codeBuffer.join('\n')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        htmlChunks.push(`<pre data-eva3-scoped=""><code>${codeText}</code></pre>`);
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // 2. 空行
    if (!trimmed) {
      flushList();
      flushBlockquote();
      continue;
    }

    // 3. 引用块
    if (trimmed.startsWith('>')) {
      flushList();
      inBlockquote = true;
      blockquoteBuffer.push(trimmed.replace(/^>\s*/, ''));
      continue;
    } else {
      flushBlockquote();
    }

    // 4. 标题 (H1-H6)
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      flushList();
      const level = Math.min(Math.max(headerMatch[1].length, 2), 4); // B站一般主要支持 H2, H3, H4
      const text = inlineFormat(headerMatch[2]);
      htmlChunks.push(`<h${level} data-eva3-scoped=""><span data-eva3-scoped="">${text}</span></h${level}>`);
      continue;
    }

    // 5. 分割线
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList();
      htmlChunks.push('<hr data-eva3-scoped="" />');
      continue;
    }

    // 6. 图片识别与占位替换: ![alt](src)
    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      flushList();
      const alt = imgMatch[1] || '图片';
      const imgSrc = imgMatch[2].trim();
      imageCounter++;
      const imageId = `bili_img_${imageCounter}`;
      const placeholder = `__BILI_IMG_PLACEHOLDER_${imageId}__`;

      let imgInfo = {
        id: imageId,
        placeholder,
        alt,
        src: imgSrc,
        type: 'cdn'
      };

      if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
        imgInfo.type = 'cdn';
      } else {
        // 本地图片
        const localImgPath = path.resolve(baseDir, imgSrc);
        if (fs.existsSync(localImgPath)) {
          const extName = path.extname(localImgPath).toLowerCase().replace('.', '');
          const mimeType = extName === 'png' ? 'image/png' : 'image/jpeg';
          const buffer = fs.readFileSync(localImgPath);
          imgInfo.type = 'local';
          imgInfo.localPath = localImgPath;
          imgInfo.base64 = buffer.toString('base64');
          imgInfo.mimeType = mimeType;
        }
      }

      images.push(imgInfo);
      htmlChunks.push(placeholder);
      continue;
    }

    // 7. 无序列表
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        flushList();
        htmlChunks.push('<ul data-eva3-scoped="" level="1" list-style-type="disc" style="list-style-type: disc;">');
        inList = true;
        listType = 'ul';
      }
      const itemText = inlineFormat(ulMatch[1]);
      htmlChunks.push(`<li data-eva3-scoped=""><p data-eva3-scoped="">${itemText}</p></li>`);
      continue;
    }

    // 8. 有序列表
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        flushList();
        htmlChunks.push('<ol data-eva3-scoped="" level="1" list-style-type="decimal" style="list-style-type: decimal;">');
        inList = true;
        listType = 'ol';
      }
      const itemText = inlineFormat(olMatch[2]);
      htmlChunks.push(`<li data-eva3-scoped=""><p data-eva3-scoped="">${itemText}</p></li>`);
      continue;
    }

    flushList();

    // 9. 普通段落
    const pText = inlineFormat(trimmed);
    htmlChunks.push(`<p data-eva3-scoped="">${pText}</p>`);
  }

  flushList();
  flushBlockquote();

  return {
    html: htmlChunks.join('\n'),
    images
  };
}

/**
 * 完整解析 Markdown 及其关联资产（异步支持网络图片预拉取为 Base64）
 * @param {string} filePath 
 */
export async function parseArticle(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const stem = path.basename(absPath, ext);
  const rawContent = fs.readFileSync(absPath, 'utf8');

  // 优先读取同名目录下 _cdn.md 版本的正文
  const cdnMdPath = path.join(dir, stem, `${stem}_cdn.md`);
  let content = rawContent;
  let isCdnVersion = false;

  if (fs.existsSync(cdnMdPath)) {
    content = fs.readFileSync(cdnMdPath, 'utf8');
    isCdnVersion = true;
  }

  const title = extractTitle(rawContent, stem);
  const summary = extractSummary(content);
  const topics = extractTopics(content, title);
  const cover = resolveCoverImage(absPath, rawContent);

  // 若封面是远程 URL 且无 Base64，Node 端预拉取
  if (cover.type === 'cdn' && cover.url && !cover.base64) {
    try {
      const resp = await fetch(cover.url);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        cover.base64 = buf.toString('base64');
        const cType = resp.headers.get('content-type') || 'image/png';
        cover.mimeType = cType.split(';')[0];
      }
    } catch (e) {
      // 忽略拉取失败
    }
  }

  // 格式化正文：去除首行的顶级大标题（避免B站编辑器标题与正文重复）
  let bodyContent = content.trim();
  const lines = bodyContent.split('\n');
  if (lines[0].trim().startsWith('# ')) {
    bodyContent = lines.slice(1).join('\n').trim();
  }

  const { html, images } = convertMarkdownToBilibiliHtml(bodyContent, dir);

  // 对所有未含 Base64 的正文配图，在 Node 端预拉取转为 Base64
  for (const img of images) {
    if (!img.base64 && img.src && img.src.startsWith('http')) {
      try {
        const resp = await fetch(img.src);
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          img.base64 = buf.toString('base64');
          const cType = resp.headers.get('content-type') || 'image/png';
          img.mimeType = cType.split(';')[0];
        }
      } catch (e) {
        // 忽略拉取失败
      }
    }
  }

  return {
    filePath: absPath,
    stem,
    title,
    summary,
    topics,
    cover,
    isCdnVersion,
    rawContent,
    html,
    images
  };
}

// 命令行直接测试
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('parser.mjs'))) {
  const targetFile = process.argv[2] || 'e:\\me\\undsky\\mds\\RuoYi-SpringBoot3\\byeidea.md';
  const result = parseArticle(targetFile);
  console.log(JSON.stringify({
    title: result.title,
    summary: result.summary,
    topics: result.topics,
    cover: {
      type: result.cover.type,
      url: result.cover.url,
      localPath: result.cover.localPath,
      hasBase64: !!result.cover.base64
    },
    imagesCount: result.images.length,
    images: result.images.map(img => ({ id: img.id, src: img.src, type: img.type, hasBase64: !!img.base64 })),
    htmlSnippet: result.html.substring(0, 300)
  }, null, 2));
}
