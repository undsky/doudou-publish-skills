import fs from 'node:fs';
import path from 'node:path';
import { resolveCoverFromManifest, inferTags } from './asset_resolver.mjs';
import { Marked } from './marked.esm.js';

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
  return summary || '';
}

/**
 * 解析封面图资产
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
  //    统一走 asset_resolver。原逻辑的 cover/ 路径识别本身没问题，但无论如何都读本地图
  //    转 base64（claw163 实测 764KB），而知乎发布器有 `cover.base64 || cover.url` 双分支，
  //    直接给 CDN 直链即可，避免注入载荷被撑爆。
  const fromManifest = resolveCoverFromManifest(artifactDir);
  if (fromManifest) return fromManifest;

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
 * 将 Markdown 转换为知乎 Draft.js 编辑器剪贴板兼容的高质量 HTML（基于 marked）
 * @param {string} md 
 * @returns {string} HTML 字符串
 */
export function markdownToHtml(md) {
  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const tag = depth === 1 ? 'h2' : `h${depth}`;
      return `<${tag}>${text}</${tag}>\n`;
    },

    table({ header, rows }) {
      let headerHtml = '';
      if (header && header.length > 0) {
        headerHtml = '<tr>\n' +
          header.map(cell => {
            const align = cell.align ? `align="${cell.align}"` : '';
            return `  <th ${align}>${this.parser.parseInline(cell.tokens)}</th>\n`;
          }).join('') +
          '</tr>\n';
      }

      let bodyHtml = '';
      if (rows && rows.length > 0) {
        bodyHtml = rows.map(row => {
          const cellsHtml = row.map(cell => {
            const align = cell.align ? `align="${cell.align}"` : '';
            return `  <td ${align}>${this.parser.parseInline(cell.tokens)}</td>\n`;
          }).join('');
          return `<tr>\n${cellsHtml}</tr>\n`;
        }).join('');
      }

      return `<table border="1">\n<thead>\n${headerHtml}</thead>\n<tbody>\n${bodyHtml}</tbody>\n</table>\n`;
    },

    codespan({ text }) {
      return `<code>${text}</code>`;
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
      return `<p><img src="${href}" alt="${text}"${titleAttr} /></p>\n`;
    },

    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
    },

    hr() {
      return '<hr />\n';
    }
  };

  const customMarked = new Marked({
    renderer,
    gfm: true,
    breaks: true
  });

  return customMarked.parse(md);
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
  // 由 asset_resolver.inferTags 从标题与正文推断（上限 3）。
  // 旧实现固定为空数组，导致下游标签/话题分支被 length > 0 判空整段跳过。
  const topics = inferTags(rawContent, title, 3);
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

