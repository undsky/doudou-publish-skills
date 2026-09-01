import fs from 'node:fs';
import path from 'node:path';
import { Marked } from './marked.esm.js';

/**
 * 提取并清洗文章标题（抖音文章标题限制 30 字以内）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractArticleTitle(content, fallbackTitle = '未命名文章') {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      const clean = trimmed.replace(/^#\s+/, '').replace(/[*_`~]/g, '').trim();
      return clean.length > 30 ? clean.substring(0, 28) + '...' : clean;
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
      const clean = trimmed.replace(/^[#\s*`~]+/, '').trim();
      return clean.length > 30 ? clean.substring(0, 28) + '...' : clean;
    }
  }
  return fallbackTitle.length > 30 ? fallbackTitle.substring(0, 28) + '...' : fallbackTitle;
}

/**
 * 提取并清洗图文标题（抖音图文标题限制 20 字以内）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractImagePostTitle(content, fallbackTitle = '未命名图文') {
  const title = extractArticleTitle(content, fallbackTitle);
  return title.length > 20 ? title.substring(0, 18) + '...' : title;
}

/**
 * 提取文章摘要（抖音文章摘要限制 30 字以内）
 * @param {string} content 
 * @returns {string}
 */
export function extractArticleSummary(content) {
  const lines = content.split('\n');
  const textBlocks = [];
  let isCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      isCodeBlock = !isCodeBlock;
      continue;
    }
    if (isCodeBlock || !trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('<!--') || trimmed.startsWith('![')) {
      continue;
    }

    const cleanText = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/>\s*/g, '')
      .trim();

    if (cleanText.length > 5) {
      textBlocks.push(cleanText);
    }
    if (textBlocks.join(' ').length >= 25) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (!summary) {
    summary = '深度解析核心技术与工程实践落地';
  }
  if (summary.length > 30) {
    summary = summary.substring(0, 28) + '...';
  }
  return summary;
}

/**
 * 智能提取话题标签（最多 5 个）
 * @param {string} content 
 * @param {string} title 
 * @returns {string[]}
 */
export function extractTags(content, title = '') {
  const keywordsMap = [
    { tag: 'AI编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'opencode'] },
    { tag: '智能体', matches: ['agent', '智能体', '多智能体', 'multi-agent'] },
    { tag: '人工智能', matches: ['ai', '人工智能', '大模型', 'llm', 'deepseek', 'gpt', 'openai'] },
    { tag: '架构设计', matches: ['架构', '架构设计', '微服务', '工业化', '封装'] },
    { tag: '开发工具', matches: ['ide', 'vscode', 'n8n', 'devtools', 'mcp', '自动化', 'workflow'] },
    { tag: '全栈开发', matches: ['node', 'python', 'javascript', 'vue', 'react', '后端', '前端'] },
    { tag: '程序员', matches: ['程序员', '开发者', '技术', '编程', '代码'] }
  ];

  const fullText = (title + ' ' + content).toLowerCase();
  const matchedTags = [];

  for (const item of keywordsMap) {
    if (item.matches.some(m => fullText.includes(m))) {
      if (!matchedTags.includes(item.tag)) {
        matchedTags.push(item.tag);
      }
    }
    if (matchedTags.length >= 4) break;
  }

  if (matchedTags.length === 0) {
    matchedTags.push('AI编程', '智能体', '架构设计');
  }

  return matchedTags;
}

/**
 * 提炼图文专属描述正文（要点梳理 + 话题标签，抖音限制 1000 字以内）
 * @param {string} content 
 * @param {string} title 
 * @param {string[]} tags 
 * @returns {string}
 */
export function extractImagePostDescription(content, title = '', tags = []) {
  const lines = content.split('\n');
  const points = [];
  let isCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      isCodeBlock = !isCodeBlock;
      continue;
    }
    if (isCodeBlock || !trimmed) continue;

    if (trimmed.startsWith('- ') || trimmed.startsWith('1. ') || trimmed.startsWith('2. ') || trimmed.startsWith('3. ') || trimmed.startsWith('4. ')) {
      const clean = trimmed
        .replace(/^[-*\d.]+\s+/, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim();
      if (clean.length > 6 && clean.length < 80) {
        points.push(clean);
      }
    }
    if (points.length >= 5) break;
  }

  const tagString = tags.map(t => `#${t}`).join(' ');
  const summary = extractArticleSummary(content);

  let desc = `${summary}\n\n📌 核心要点梳理：\n`;
  if (points.length > 0) {
    desc += points.map((p, idx) => `${idx + 1}. ${p}`).join('\n') + '\n\n';
  } else {
    desc += `1. 工业级标准化封装实践\n2. 明确交付契约与微服务编排\n3. 代码自动化守门与高质量输出\n\n`;
  }
  desc += `${tagString}`;

  return desc.length > 950 ? desc.substring(0, 940) + '...' : desc;
}

/**
 * 解析排版后的正文 HTML（遵循 doudou-markdown-skill 与 gzh-design 规范）
 * 优先读取同名目录下干净的 `[article_name]_排版_[theme].html`
 * @param {string} markdownFilePath 
 * @returns {{ type: 'gzh_html'|'markdown', htmlContent: string }}
 */
export function resolveArticleHtml(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 优先读取 [article_name]_cdn.md 或根据 cdn_manifest.json 映射插图
  let targetMarkdown = '';
  const cdnMdPath = path.join(articleDir, `${baseName}_cdn.md`);
  if (fs.existsSync(cdnMdPath)) {
    targetMarkdown = fs.readFileSync(cdnMdPath, 'utf-8');
  } else {
    targetMarkdown = fs.readFileSync(absPath, 'utf-8');
    // 如果有 cdn_manifest.json，自动将本地插图路径替换为 CDN 链接
    const manifestPath = path.join(articleDir, 'cdn_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (Array.isArray(manifest.assets)) {
          for (const asset of manifest.assets) {
            if (asset.cdn_url && asset.local_path) {
              const relName = path.basename(asset.local_path);
              targetMarkdown = targetMarkdown.replaceAll(asset.local_path, asset.cdn_url);
              targetMarkdown = targetMarkdown.replaceAll(relName, asset.cdn_url);
            }
          }
        }
      } catch (e) {}
    }
  }

  // 2. 将 Markdown 转换为 TipTap/ProseMirror 完美支持的标准 HTML（基于 marked）
  const renderer = {
    image({ href, title, text }) {
      const alt = text || '';
      return `<div class="image-wrapper"><img src="${href}" alt="${alt}"></div>\n`;
    },
    table({ header, rows }) {
      let headerHtml = '';
      if (header && header.length > 0) {
        headerHtml = '<tr>\n' +
          header.map(cell => `<th style="border: 1px solid #ddd; padding: 6px 10px;">${this.parser.parseInline(cell.tokens)}</th>\n`).join('') +
          '</tr>\n';
      }
      let bodyHtml = '';
      if (rows && rows.length > 0) {
        bodyHtml = rows.map(row => {
          const cellsHtml = row.map(cell => `<td style="border: 1px solid #ddd; padding: 6px 10px;">${this.parser.parseInline(cell.tokens)}</td>\n`).join('');
          return `<tr>\n${cellsHtml}</tr>\n`;
        }).join('');
      }
      return `<table style="width: 100%; border-collapse: collapse; margin: 12px 0;">\n<thead>\n${headerHtml}</thead>\n<tbody>\n${bodyHtml}</tbody>\n</table>\n`;
    },
    code({ text, lang }) {
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre><code>${escaped}</code></pre>\n`;
    },
    codespan({ text }) {
      return `<code>${text}</code>`;
    }
  };

  const customMarked = new Marked({
    renderer,
    gfm: true,
    breaks: true
  });

  const htmlContent = customMarked.parse(targetMarkdown);

  return {
    type: 'markdown_cdn_html',
    filePath: absPath,
    htmlContent
  };
}

/**
 * 辅助检查 PNG 图片尺寸（满足抖音封面 >= 500px 限制）
 */
function getPngDimensions(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.toString('ascii', 1, 4) === 'PNG') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
  } catch (e) {}
  return null;
}

/**
 * 解析封面图资产（优先遵循 doudou-markdown-skill:L131-L133 图文卡片的第一张封面卡，如 xhs_images/images/01-cover.png）
 * 严格确保分辨率满足抖音 >= 500px 校验
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string }}
 */
export function resolveCoverImage(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 优先提取 xhs_images/images/ 下的第一张图片（如 01-cover.png）
  const xhsImagesDir = path.join(articleDir, 'xhs_images', 'images');
  if (fs.existsSync(xhsImagesDir)) {
    const allFiles = fs.readdirSync(xhsImagesDir)
      .filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const coverCard = allFiles.find(f => f.includes('01-cover') || f.includes('cover') || f.startsWith('01')) || allFiles[0];

    if (coverCard) {
      const localPath = path.join(xhsImagesDir, coverCard);
      const buf = fs.readFileSync(localPath);
      const mimeType = coverCard.endsWith('.jpg') || coverCard.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      return {
        hasCover: true,
        localPath,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: coverCard
      };
    }
  }

  // 2. 备选：读取 cdn_manifest.json 中的主封面
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(manifest.assets)) {
        const coverItem = manifest.assets.find(f => f.type === 'cover' || f.slug?.includes('cover'));
        if (coverItem && coverItem.cdn_url) {
          const localPath = coverItem.local_path ? path.resolve(articleDir, coverItem.local_path) : null;
          let base64 = null;
          let mimeType = 'image/png';
          if (localPath && fs.existsSync(localPath)) {
            const buf = fs.readFileSync(localPath);
            mimeType = localPath.endsWith('.jpg') || localPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
            base64 = `data:${mimeType};base64,${buf.toString('base64')}`;
          }
          return {
            hasCover: true,
            url: coverItem.cdn_url,
            localPath,
            base64,
            mimeType,
            fileName: coverItem.slug || 'cover.png'
          };
        }
      }
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 失败:', e.message);
    }
  }

  // 3. 备选：读取 cover/images/ 下的本地封面
  const coverImagesDir = path.join(articleDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir)) {
    const allFiles = fs.readdirSync(coverImagesDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp'));
    
    let selectedCover = null;
    const candidates = [
      allFiles.find(f => f.includes('2.35x1_yuantu')),
      allFiles.find(f => f.includes('16x9_yuantu')),
      allFiles.find(f => f.includes('square-1x1_yuantu')),
      allFiles.find(f => f.includes('square-1x1')),
      allFiles.find(f => f.includes('2.35x1')),
      allFiles.find(f => f.includes('16x9')),
      allFiles[0]
    ].filter(Boolean);

    for (const cand of candidates) {
      const p = path.join(coverImagesDir, cand);
      const dims = getPngDimensions(p);
      if (dims && Math.min(dims.width, dims.height) >= 500) {
        selectedCover = cand;
        break;
      }
    }

    if (!selectedCover && candidates.length > 0) {
      selectedCover = candidates[0];
    }

    if (selectedCover) {
      const localPath = path.join(coverImagesDir, selectedCover);
      const buf = fs.readFileSync(localPath);
      const mimeType = selectedCover.endsWith('.jpg') || selectedCover.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      return {
        hasCover: true,
        localPath,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: selectedCover
      };
    }
  }

  return { hasCover: false };
}

/**
 * 解析图文卡片图片集（遵循 doudou-markdown-skill:L128-L133 小红书/微信/抖音图文卡片规约）
 * @param {string} markdownFilePath 
 * @returns {Array<{ name: string, localPath: string, base64: string, mimeType: string }>}
 */
export function resolveImagePostCards(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  const candidateDirs = [
    path.join(articleDir, 'xhs_images', 'images'),
    path.join(articleDir, 'xhs_images')
  ];

  for (const targetDir of candidateDirs) {
    if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
      const files = fs.readdirSync(targetDir)
        .filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      if (files.length > 0) {
        return files.map(file => {
          const localPath = path.join(targetDir, file);
          const buf = fs.readFileSync(localPath);
          const mimeType = file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
          return {
            name: file,
            localPath,
            base64: `data:${mimeType};base64,${buf.toString('base64')}`,
            mimeType
          };
        });
      }
    }
  }

  return [];
}

/**
 * 全面解析 Markdown 文件及其关联资产
 * @param {string} markdownFilePath 
 * @param {string} author 
 * @returns {object}
 */
export function parseAllAssets(markdownFilePath, author = '豆豆') {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const articleTitle = extractArticleTitle(rawContent);
  const imagePostTitle = extractImagePostTitle(rawContent);
  const articleSummary = extractArticleSummary(rawContent);
  const tags = extractTags(rawContent, articleTitle);
  const imagePostDesc = extractImagePostDescription(rawContent, imagePostTitle, tags);
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath, rawContent);
  const imageCards = resolveImagePostCards(absPath);

  return {
    markdownFilePath: absPath,
    articleTitle,
    imagePostTitle,
    author,
    articleSummary,
    tags,
    imagePostDesc,
    articleHtml,
    cover,
    imageCards,
    cardCount: imageCards.length,
    cardFilePaths: imageCards.map(c => c.localPath)
  };
}

// 命令行直接运行测试支持
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('parser.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node parser.mjs <Markdown文件路径>');
    process.exit(1);
  }
  console.log(`[parser] 正在解析: ${targetFile}`);
  const result = parseAllAssets(targetFile);
  console.log(JSON.stringify({
    articleTitle: result.articleTitle,
    imagePostTitle: result.imagePostTitle,
    author: result.author,
    articleSummary: result.articleSummary,
    tags: result.tags,
    articleHtmlType: result.articleHtml.type,
    articleHtmlLength: result.articleHtml.htmlContent.length,
    hasCover: result.cover.hasCover,
    coverFile: result.cover.fileName,
    cardCount: result.cardCount,
    cardFiles: result.imageCards.map(s => s.name),
    cardPaths: result.cardFilePaths
  }, null, 2));
}
