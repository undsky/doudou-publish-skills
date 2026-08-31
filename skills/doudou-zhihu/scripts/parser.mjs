import fs from 'node:fs';
import path from 'node:path';

/**
 * 提取 Markdown 标题
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractTitle(content, fallbackTitle = '未命名文章') {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.replace(/^#\s+/, '').trim();
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
      return trimmed.replace(/^[#\s*`]+/, '').trim();
    }
  }
  return fallbackTitle;
}

/**
 * 从正文中提炼 80~150 字纯文本摘要
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

    // 移除 markdown 链接、加粗与引用等符号
    const cleanText = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/>\s*/g, '')
      .trim();

    if (cleanText.length > 10) {
      textBlocks.push(cleanText);
    }
    if (textBlocks.join(' ').length >= 120) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (summary.length > 150) {
    summary = summary.substring(0, 145) + '...';
  }
  return summary || '本文分享了深度技术实践与架构解析，欢迎阅读与交流。';
}

/**
 * 智能推断 1~3 个知乎官方高频话题关键词
 * @param {string} content 
 * @param {string} title 
 * @returns {string[]}
 */
export function extractTopics(content, title = '') {
  const keywordsMap = [
    { topic: '人工智能', matches: ['ai', '人工智能', '大模型', 'llm', 'deepseek', 'gpt', 'openai', 'claude'] },
    { topic: '智能体', matches: ['agent', '智能体', '多智能体', 'multi-agent', 'opencode'] },
    { topic: 'AI 编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'cursor', 'copilot'] },
    { topic: 'AIGC', matches: ['aigc', '生成式ai', 'stable diffusion', 'midjourney'] },
    { topic: 'Docker', matches: ['docker', '容器', 'docker-compose', 'alpine', 'k8s', 'kubernetes'] },
    { topic: '前端开发', matches: ['前端', 'javascript', 'typescript', 'vue', 'react', 'css', 'html', 'node.js'] },
    { topic: '后端开发', matches: ['后端', 'java', 'springboot', 'go', 'golang', 'python', 'mysql', 'redis'] },
    { topic: '软件架构', matches: ['架构', '架构设计', '微服务', '系统设计', '工业化'] },
    { topic: '自动化', matches: ['自动化', 'automation', 'n8n', 'workflow', 'mcp', 'dify'] },
    { topic: '程序员', matches: ['程序员', '开发者', '工程师', '开源', '代码'] }
  ];

  const fullText = (title + ' ' + content).toLowerCase();
  const matchedTopics = [];

  for (const item of keywordsMap) {
    if (item.matches.some(m => fullText.includes(m))) {
      if (!matchedTopics.includes(item.topic)) {
        matchedTopics.push(item.topic);
      }
    }
    if (matchedTopics.length >= 3) break;
  }

  if (matchedTopics.length === 0) {
    matchedTopics.push('人工智能', '程序员');
  }

  return matchedTopics;
}

/**
 * 解析封面图资产（遵循 doudou-markdown-skill 规约）
 * 优先级：
 * 1. 同名目录 cdn_manifest.json 中类型为 cover 的条目（优先 2.35:1 宽屏主封面、16:9 封面、1:1 方形封面，存在本地文件时优先读取 base64）
 * 2. 同名目录 cover/images/ 下的本地封面（cover-main-2.35x1.png / 16x9 / 1x1）
 * 3. 同名目录 xhs_images/images/ 下的第一张封面卡片（01-cover.png）
 * 4. 正文前 10 行内的封面图（网络或本地图片）
 * 5. 正文中提取的第一张网络或本地图片
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, type: 'local'|'cdn'|'none', url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string }}
 */
export function resolveCoverImage(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const stem = path.basename(absPath, ext);
  const artifactDir = path.join(dir, stem);

  // 构建 manifest 快速映射表
  let manifestMap = {};
  let manifestAssets = [];
  const manifestPath = path.join(artifactDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : (Array.isArray(manifest.files) ? manifest.files : []);
      for (const asset of manifestAssets) {
        if (asset.local_path && asset.cdn_url) {
          manifestMap[path.resolve(artifactDir, asset.local_path)] = asset.cdn_url;
          manifestMap[path.resolve(dir, asset.local_path)] = asset.cdn_url;
          manifestMap[path.basename(asset.local_path)] = asset.cdn_url;
        }
      }
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 异常:', e.message);
    }
  }

  // 1. 优先从同名目录的 cdn_manifest.json 查找
  if (manifestAssets.length > 0) {
    const coverAssets = manifestAssets.filter(a => {
      const pathStr = (a.local_path || a.slug || a.original_name || a.cdn_url || '').toLowerCase();
      return a.type === 'cover' || pathStr.includes('cover');
    });

    if (coverAssets.length > 0) {
      const mainCover = coverAssets.find(a => {
        const s = ((a.local_path || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
        return s.includes('2.35') || s.includes('main');
      }) || coverAssets.find(a => {
        const s = ((a.local_path || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
        return s.includes('16:9') || s.includes('16x9');
      }) || coverAssets.find(a => {
        const s = ((a.local_path || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
        return s.includes('1:1') || s.includes('1x1');
      }) || coverAssets[0];

      if (mainCover) {
        const relPath = mainCover.local_path || mainCover.original_name || mainCover.path;
        let localFullPath = undefined;
        if (relPath) {
          if (path.isAbsolute(relPath) && fs.existsSync(relPath)) {
            localFullPath = relPath;
          } else if (fs.existsSync(path.resolve(artifactDir, relPath))) {
            localFullPath = path.resolve(artifactDir, relPath);
          } else if (fs.existsSync(path.resolve(dir, relPath))) {
            localFullPath = path.resolve(dir, relPath);
          }
        }

        let base64Data = null;
        let mimeType = mainCover.mime_type || 'image/jpeg';
        if (localFullPath && fs.existsSync(localFullPath)) {
          const extName = path.extname(localFullPath).toLowerCase().replace('.', '');
          mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
          base64Data = fs.readFileSync(localFullPath).toString('base64');
        }

        const fileName = localFullPath ? path.basename(localFullPath) : (mainCover.slug ? `${mainCover.slug}.png` : 'cover.png');

        return {
          hasCover: true,
          type: base64Data ? 'local' : (mainCover.cdn_url ? 'cdn' : 'none'),
          url: mainCover.cdn_url,
          localPath: localFullPath,
          base64: base64Data || undefined,
          mimeType,
          fileName
        };
      }
    }
  }

  // 2. 从同名目录的 cover/images 查找本地图片
  const coverImagesDir = path.join(artifactDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir) && fs.statSync(coverImagesDir).isDirectory()) {
    const files = fs.readdirSync(coverImagesDir);
    const validExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const imageFiles = files.filter(f => validExts.includes(path.extname(f).toLowerCase()) && !f.includes('yuantu'));

    const candidates = [
      imageFiles.find(f => f.includes('2.35x1') || f.includes('2.35:1') || f.includes('cover-main') || f.includes('main')),
      imageFiles.find(f => f.includes('16x9') || f.includes('16:9')),
      imageFiles.find(f => f.includes('square-1x1') || f.includes('1x1')),
      imageFiles.find(f => f.includes('cover')),
      imageFiles[0]
    ].filter(Boolean);

    if (candidates.length > 0) {
      const targetFile = candidates[0];
      const fullLocalPath = path.join(coverImagesDir, targetFile);
      const extName = path.extname(targetFile).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
      const buffer = fs.readFileSync(fullLocalPath);
      const cdnUrl = manifestMap[fullLocalPath] || manifestMap[targetFile] || undefined;

      return {
        hasCover: true,
        type: 'local',
        url: cdnUrl,
        localPath: fullLocalPath,
        base64: buffer.toString('base64'),
        mimeType,
        fileName: targetFile
      };
    }
  }

  // 3. 备选：读取 xhs_images/images/ 下的第一张封面卡片（如 01-cover.png）
  const xhsImagesDir = path.join(artifactDir, 'xhs_images', 'images');
  if (fs.existsSync(xhsImagesDir)) {
    const allFiles = fs.readdirSync(xhsImagesDir)
      .filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const coverCard = allFiles.find(f => f.includes('01-cover') || f.includes('cover') || f.startsWith('01')) || allFiles[0];

    if (coverCard) {
      const localPath = path.join(xhsImagesDir, coverCard);
      const buf = fs.readFileSync(localPath);
      const extName = path.extname(coverCard).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
      const cdnUrl = manifestMap[localPath] || manifestMap[coverCard] || undefined;
      return {
        hasCover: true,
        type: 'local',
        url: cdnUrl,
        localPath,
        base64: buf.toString('base64'),
        mimeType,
        fileName: coverCard
      };
    }
  }

  // 4. 检查正文前 10 行是否有封面图链接（网络或本地）
  const topLines = (content || '').split('\n').slice(0, 10).join('\n');
  const topImgMatch = topLines.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (topImgMatch && topImgMatch[1]) {
    return {
      hasCover: true,
      type: 'cdn',
      url: topImgMatch[1],
      fileName: 'cover_top.png',
      mimeType: 'image/jpeg'
    };
  }

  const topLocalMatch = topLines.match(/!\[.*?\]\(([^)]+)\)/);
  if (topLocalMatch && topLocalMatch[1] && !topLocalMatch[1].startsWith('http')) {
    const localRel = topLocalMatch[1];
    const fullImgPath = path.resolve(dir, localRel);
    if (fs.existsSync(fullImgPath)) {
      const extName = path.extname(fullImgPath).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
      const buffer = fs.readFileSync(fullImgPath);
      return {
        hasCover: true,
        type: 'local',
        localPath: fullImgPath,
        base64: buffer.toString('base64'),
        mimeType,
        fileName: path.basename(fullImgPath)
      };
    }
  }

  // 5. 从 Markdown 正文任意位置提取第一张图片
  const imgMatch = (content || '').match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (imgMatch && imgMatch[1]) {
    return {
      hasCover: true,
      type: 'cdn',
      url: imgMatch[1],
      fileName: 'cover_from_content.png',
      mimeType: 'image/jpeg'
    };
  }

  const localImgMatch = (content || '').match(/!\[.*?\]\(([^)]+)\)/);
  if (localImgMatch && localImgMatch[1] && !localImgMatch[1].startsWith('http')) {
    const localRel = localImgMatch[1];
    const fullImgPath = path.resolve(dir, localRel);
    if (fs.existsSync(fullImgPath)) {
      const extName = path.extname(fullImgPath).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
      const buffer = fs.readFileSync(fullImgPath);
      return {
        hasCover: true,
        type: 'local',
        localPath: fullImgPath,
        base64: buffer.toString('base64'),
        mimeType,
        fileName: path.basename(fullImgPath)
      };
    }
  }

  return { hasCover: false, type: 'none' };
}

/**
 * 将 Markdown 转换为知乎 Draft.js 编辑器剪贴板兼容的高质量 HTML
 * @param {string} md 
 * @returns {string} HTML 字符串
 */
export function markdownToHtml(md) {
  const lines = md.split('\n');
  const htmlParts = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent = [];
  let inList = false;
  let listType = 'ul';

  function closeList() {
    if (inList) {
      htmlParts.push(`</${listType}>`);
      inList = false;
    }
  }

  function formatInline(text) {
    let out = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 加粗 **text** 或 __text__
    out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // 斜体 *text* 或 _text_
    out = out.replace(/\*(.*?)\*/g, '<em>$1</em>');
    out = out.replace(/_(.*?)_/g, '<em>$1</em>');

    // 行内代码 `code`
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 图片 ![alt](url)
    out = out.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />');

    // 链接 [text](url)
    out = out.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    return out;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. 代码块处理
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        closeList();
        const codeText = codeBlockContent.join('\n')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        htmlParts.push(`<pre><code class="language-${codeBlockLang}">${codeText}</code></pre>`);
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = '';
      } else {
        closeList();
        inCodeBlock = true;
        codeBlockLang = trimmed.replace(/^```/, '').trim();
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(rawLine);
      continue;
    }

    // 空行
    if (!trimmed) {
      closeList();
      continue;
    }

    // 分割线
    if (/^[-*_]{3,}$/.test(trimmed)) {
      closeList();
      htmlParts.push('<hr />');
      continue;
    }

    // 标题 (知乎最高层级主要支持 H2, H3 等)
    if (trimmed.startsWith('### ')) {
      closeList();
      htmlParts.push(`<h3>${formatInline(trimmed.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeList();
      htmlParts.push(`<h2>${formatInline(trimmed.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeList();
      htmlParts.push(`<h2>${formatInline(trimmed.replace(/^#\s+/, ''))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('#### ')) {
      closeList();
      htmlParts.push(`<h3>${formatInline(trimmed.replace(/^####\s+/, ''))}</h3>`);
      continue;
    }

    // 引用块
    if (trimmed.startsWith('>')) {
      closeList();
      const quoteText = formatInline(trimmed.replace(/^>\s*/, ''));
      htmlParts.push(`<blockquote><p>${quoteText}</p></blockquote>`);
      continue;
    }

    // 无序列表
    if (/^[-*+]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        closeList();
        htmlParts.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      const itemText = formatInline(trimmed.replace(/^[-*+]\s+/, ''));
      htmlParts.push(`<li>${itemText}</li>`);
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        closeList();
        htmlParts.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      const itemText = formatInline(trimmed.replace(/^\d+\.\s+/, ''));
      htmlParts.push(`<li>${itemText}</li>`);
      continue;
    }

    // 纯图片行
    if (/^!\[(.*?)\]\((.*?)\)$/.test(trimmed)) {
      closeList();
      const match = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
      htmlParts.push(`<p><img src="${match[2]}" alt="${match[1]}" /></p>`);
      continue;
    }

    // 普通段落
    closeList();
    htmlParts.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeList();
  return htmlParts.join('\n');
}

/**
 * 解析 Markdown 及其关联资产
 * @param {string} filePath 
 */
export function parseArticle(filePath) {
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

  // 格式化正文：去除首行的顶级大标题（避免知乎编辑器标题与正文重复），保留其余部分
  let bodyContent = content.trim();
  const firstLine = bodyContent.split('\n')[0].trim();
  if (firstLine.startsWith('# ') && firstLine.replace(/^#\s+/, '').trim() === title) {
    bodyContent = bodyContent.substring(firstLine.length).trim();
  }

  // 预转译为知乎 Draft.js 剪贴板兼容富文本 HTML
  const htmlContent = markdownToHtml(bodyContent);

  return {
    markdownFilePath: absPath,
    filePath: absPath,
    stem,
    title,
    articleTitle: title,
    summary,
    articleSummary: summary,
    topics,
    tags: topics,
    cover,
    isCdnVersion,
    bodyContent,
    htmlContent,
    rawContent
  };
}

/**
 * 全面解析 Markdown 文件及其关联资产（兼容易与其他 skill 统一调用的签名）
 * @param {string} filePath 
 * @param {string} author 
 */
export function parseAllAssets(filePath, author = 'undsky') {
  const result = parseArticle(filePath);
  return {
    ...result,
    author
  };
}

// 命令行直接运行测试
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('parser.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node parser.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const result = parseArticle(targetFile);
  console.log(JSON.stringify({
    title: result.title,
    summary: result.summary,
    topics: result.topics,
    cover: {
      hasCover: result.cover.hasCover,
      type: result.cover.type,
      url: result.cover.url,
      localPath: result.cover.localPath,
      hasBase64: !!result.cover.base64,
      fileName: result.cover.fileName
    },
    isCdnVersion: result.isCdnVersion,
    bodyLength: result.bodyContent.length,
    htmlLength: result.htmlContent.length
  }, null, 2));
}

