import fs from 'node:fs';
import path from 'node:path';
import { Marked } from './marked.esm.js';

/**
 * 提取并清洗文章标题（头条号图文文章标题限制 5～30 字）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractArticleTitle(content, fallbackTitle = '未命名文章') {
  const lines = content.split('\n');
  let rawTitle = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      rawTitle = trimmed.replace(/^#\s+/, '');
      break;
    }
  }

  if (!rawTitle) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
        rawTitle = trimmed.replace(/^[#\s*`~]+/, '');
        break;
      }
    }
  }

  if (!rawTitle) {
    rawTitle = fallbackTitle;
  }

  // 清洗 Markdown 格式符号
  let cleanTitle = rawTitle
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^[#\s]+/, '')
    .trim();

  // 头条标题限制 5~30 个字（若超过 30 字则智能截断）
  if (cleanTitle.length > 30) {
    cleanTitle = cleanTitle.substring(0, 30);
  } else if (cleanTitle.length < 5) {
    cleanTitle = cleanTitle.padEnd(5, '！');
  }

  return cleanTitle;
}

/**
 * 提取文章纯文本摘要（100 字以内）
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
    if (textBlocks.join(' ').length >= 80) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (!summary) {
    summary = '深度解析核心技术与工程落地实践，探索高质量智能体与自媒体自动化交付流程。';
  }
  if (summary.length > 100) {
    summary = summary.substring(0, 98) + '...';
  }
  return summary;
}

/**
 * 将 Markdown 转换为头条 ProseMirror 兼容的高质量语义 HTML（基于 marked）
 * @param {string} markdown 
 * @returns {string}
 */
export function markdownToSemanticHtml(markdown) {
  let isFirstH1Skipped = false;

  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      if (depth === 1 && !isFirstH1Skipped) {
        isFirstH1Skipped = true;
        return '';
      }
      const tag = depth === 1 ? 'h2' : `h${depth}`;
      return `<${tag}>${text}</${tag}>\n`;
    },

    table({ header, rows }) {
      let headerHtml = '';
      if (header && header.length > 0) {
        headerHtml = '<tr style="background: #f7f8fa;">\n' +
          header.map(cell => {
            const align = cell.align ? `text-align: ${cell.align};` : 'text-align: left;';
            return `  <th style="border: 1px solid #e2e4e8; padding: 8px 12px; ${align} font-weight: 600;">${this.parser.parseInline(cell.tokens)}</th>\n`;
          }).join('') +
          '</tr>\n';
      }

      let bodyHtml = '';
      if (rows && rows.length > 0) {
        bodyHtml = rows.map((row, rIdx) => {
          const bg = rIdx % 2 === 1 ? 'background: #fafbfc;' : 'background: #ffffff;';
          const cellsHtml = row.map(cell => {
            const align = cell.align ? `text-align: ${cell.align};` : 'text-align: left;';
            return `  <td style="border: 1px solid #e2e4e8; padding: 8px 12px; ${align}">${this.parser.parseInline(cell.tokens)}</td>\n`;
          }).join('');
          return `<tr style="${bg}">\n${cellsHtml}</tr>\n`;
        }).join('');
      }

      return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; border: 1px solid #e2e4e8;">\n<thead>\n${headerHtml}</thead>\n<tbody>\n${bodyHtml}</tbody>\n</table>\n`;
    },

    codespan({ text }) {
      return `<code style="background-color: #f2f3f5; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${text}</code>`;
    },

    code({ text, lang }) {
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const langClass = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${langClass}>${escaped}</code></pre>\n`;
    },

    image({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${href}" alt="${text}"${titleAttr} style="max-width: 100%; border-radius: 6px;" />`;
    },

    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}" target="_blank"${titleAttr}>${text}</a>`;
    },

    hr() {
      return '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />\n';
    }
  };

  const markedInstance = new Marked({
    renderer,
    gfm: true,
    breaks: true
  });

  return markedInstance.parse(markdown);
}

/**
 * 解析排版正文 HTML
 * 优先读取同名目录下 `[article_name]_cdn.md` 或结合 `cdn_manifest.json` 转换为头条标准语义富文本 HTML
 * @param {string} markdownFilePath 
 * @returns {{ type: string, filePath: string, htmlContent: string }}
 */
export function resolveArticleHtml(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 获取带有 CDN 链接的 Markdown 文本
  let targetMarkdown = '';
  const cdnMdPath = path.join(articleDir, `${baseName}_cdn.md`);
  if (fs.existsSync(cdnMdPath)) {
    targetMarkdown = fs.readFileSync(cdnMdPath, 'utf-8');
  } else {
    targetMarkdown = fs.readFileSync(absPath, 'utf-8');
    // 如果存在 cdn_manifest.json，自动将本地插图路径替换为公开 CDN URL
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
      } catch (e) {
        console.warn('[parser] 读取 cdn_manifest.json 异常:', e.message);
      }
    }
  }

  // 2. 将 Markdown 转换为头条 ProseMirror 兼容的标准语义 HTML
  const htmlContent = markdownToSemanticHtml(targetMarkdown);

  return {
    type: 'markdown_semantic_html',
    filePath: absPath,
    htmlContent
  };
}

/**
 * 解析封面图资产（遵循 doudou-markdown-skill 规约）
 * 优先级：
 * 1. 同名目录 xhs_images/images/ 下第一张封面卡（01-cover.png）
 * 2. cdn_manifest.json 中类型为 cover 的条目
 * 3. 同名目录 cover/images/ 下的本地封面（cover-main-2.35x1.png / 16x9 / 1x1）
 * 4. 正文首图
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string }}
 */
export function resolveCoverImage(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 优先读取 cover/images/ 下的本地封面
  const coverImagesDir = path.join(articleDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir)) {
    const allFiles = fs.readdirSync(coverImagesDir).filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp')));
    const candidates = [
      allFiles.find(f => f.includes('2.35x1') || f.includes('2.35:1') || f.includes('cover-main')),
      allFiles.find(f => f.includes('16x9') || f.includes('16:9')),
      allFiles.find(f => f.includes('square-1x1') || f.includes('1x1')),
      allFiles.find(f => f.includes('cover')),
      allFiles[0]
    ].filter(Boolean);

    if (candidates.length > 0) {
      const selected = candidates[0];
      const localPath = path.join(coverImagesDir, selected);
      const buf = fs.readFileSync(localPath);
      const mimeType = selected.endsWith('.jpg') || selected.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      return {
        hasCover: true,
        localPath,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: selected
      };
    }
  }

  // 2. 备选：读取 cdn_manifest.json 中的封面条目（type 为 cover）
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(manifest.assets)) {
        const coverItem = manifest.assets.find(f => f.type === 'cover' && (f.slug?.includes('2.35x1') || f.slug?.includes('16x9') || f.slug?.includes('main'))) ||
                          manifest.assets.find(f => f.type === 'cover');
        if (coverItem) {
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
            fileName: coverItem.slug ? `${coverItem.slug}.png` : 'cover.png'
          };
        }
      }
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 失败:', e.message);
    }
  }

  // 3. 备选：读取 xhs_images/images/ 下的第一张封面卡片（如 01-cover.png）
  const xhsImagesDir = path.join(articleDir, 'xhs_images', 'images');
  if (fs.existsSync(xhsImagesDir)) {
    const allFiles = fs.readdirSync(xhsImagesDir)
      .filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp')))
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

  // 4. 从正文中提取首张图片
  const imgMatch = content.match(/!\[([^\]]*)\]\(([^)]+)\)/);
  if (imgMatch) {
    const imgSrc = imgMatch[2];
    if (imgSrc.startsWith('http')) {
      return {
        hasCover: true,
        url: imgSrc,
        fileName: 'cover_from_content.png'
      };
    }
  }

  return { hasCover: false };
}

/**
 * 全面解析 Markdown 文件及其关联资产
 * @param {string} markdownFilePath 
 * @param {string} author 
 * @returns {object}
 */
export function parseAllAssets(markdownFilePath, author = 'undsky') {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const articleTitle = extractArticleTitle(rawContent);
  const articleSummary = extractArticleSummary(rawContent);
  const tags = [];
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath, rawContent);

  return {
    markdownFilePath: absPath,
    articleTitle,
    author,
    articleSummary,
    tags,
    articleHtml,
    cover
  };
}

// 命令行直接测试
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
    titleLength: result.articleTitle.length,
    author: result.author,
    articleSummary: result.articleSummary,
    tags: result.tags,
    articleHtmlType: result.articleHtml.type,
    articleHtmlLength: result.articleHtml.htmlContent.length,
    hasCover: result.cover.hasCover,
    coverFile: result.cover.fileName,
    coverLocalPath: result.cover.localPath
  }, null, 2));
}
