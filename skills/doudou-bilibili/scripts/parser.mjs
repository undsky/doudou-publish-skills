import fs from 'node:fs';
import path from 'node:path';
import { Marked } from './marked.esm.js';

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
 * 提取话题标签（不再做关键词规则映射）
 * @param {string} content
 * @param {string} title
 * @returns {string[]}
 */
export function extractTopics(_content, _title = '') {
  return [];
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
      const list = Array.isArray(manifest.files) ? manifest.files : (Array.isArray(manifest.assets) ? manifest.assets : []);
      if (list.length > 0) {
        const coverAssets = list.filter(a => {
          const pathStr = (a.local_path || a.original_name || a.slug || a.cdn_url || '').toLowerCase();
          return a.type === 'cover' || pathStr.includes('cover');
        });

        const mainCover = coverAssets.find(a => {
          const s = ((a.local_path || '') + ' ' + (a.original_name || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
          return s.includes('16:9') || s.includes('16x9') || s.includes('16_9');
        }) || coverAssets.find(a => {
          const s = ((a.local_path || '') + ' ' + (a.original_name || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
          return s.includes('2.35') || s.includes('main');
        }) || coverAssets.find(a => {
          const s = ((a.local_path || '') + ' ' + (a.original_name || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
          return s.includes('1:1') || s.includes('1x1');
        }) || coverAssets[0];

        if (mainCover) {
          const relPath = mainCover.local_path || mainCover.original_name;
          let localFullPath = relPath ? (path.isAbsolute(relPath) ? relPath : path.resolve(artifactDir, relPath)) : undefined;
          let base64Data = null;
          let mimeType = mainCover.mime_type || 'image/png';
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
 * 将 Markdown 转换为适配 Bilibili TipTap/Sunflower 编辑器的 HTML 并提取所有需上传的图片（基于 marked）
 * @param {string} markdown 
 * @param {string} baseDir 
 * @returns {{ html: string, images: Array<{ id: string, placeholder: string, alt: string, src: string, type: 'cdn'|'local', base64?: string, mimeType?: string }> }}
 */
export function convertMarkdownToBilibiliHtml(markdown, baseDir) {
  const images = [];
  let imageCounter = 0;

  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const level = Math.min(Math.max(depth, 2), 4);
      return `<h${level} data-eva3-scoped=""><span data-eva3-scoped="">${text}</span></h${level}>\n`;
    },

    table({ header, rows }) {
      let headerHtml = '';
      if (header && header.length > 0) {
        headerHtml = '<tr data-eva3-scoped="">\n' +
          header.map(cell => {
            const align = cell.align ? `style="text-align: ${cell.align};"` : '';
            return `  <th data-eva3-scoped="" ${align}>${this.parser.parseInline(cell.tokens)}</th>\n`;
          }).join('') +
          '</tr>\n';
      }

      let bodyHtml = '';
      if (rows && rows.length > 0) {
        bodyHtml = rows.map(row => {
          const cellsHtml = row.map(cell => {
            const align = cell.align ? `style="text-align: ${cell.align};"` : '';
            return `  <td data-eva3-scoped="" ${align}>${this.parser.parseInline(cell.tokens)}</td>\n`;
          }).join('');
          return `<tr data-eva3-scoped="">\n${cellsHtml}</tr>\n`;
        }).join('');
      }

      return `<table data-eva3-scoped="" border="1">\n<thead>\n${headerHtml}</thead>\n<tbody>\n${bodyHtml}</tbody>\n</table>\n`;
    },

    codespan({ text }) {
      return `<code data-eva3-scoped="">${text}</code>`;
    },

    code({ text, lang }) {
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre data-eva3-scoped=""><code>${escaped}</code></pre>\n`;
    },

    image({ href, title, text }) {
      const alt = text || '图片';
      const imgSrc = href.trim();
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
      return `${placeholder}\n`;
    },

    list({ ordered, items }) {
      const tag = ordered ? 'ol' : 'ul';
      const styleType = ordered ? 'decimal' : 'disc';
      const body = items.map(item => {
        // 紧凑列表项的首段是裸内联 token，需补 <p> 才符合 TipTap 结构；
        // 其后可能跟嵌套列表/代码块等块级 token，必须走 parse 而非 parseInline
        const splitAt = item.tokens.findIndex(t => t.type !== 'text' && t.type !== 'space');
        const leading = splitAt === -1 ? item.tokens : item.tokens.slice(0, splitAt);
        const rest = splitAt === -1 ? [] : item.tokens.slice(splitAt);

        let content = '';
        if (leading.length > 0) {
          const inlineHtml = leading.map(t => t.tokens ? this.parser.parseInline(t.tokens) : (t.text || '')).join('');
          content += `<p data-eva3-scoped="">${inlineHtml}</p>`;
        }
        if (rest.length > 0) content += this.parser.parse(rest);

        return `<li data-eva3-scoped="">${content}</li>\n`;
      }).join('');
      return `<${tag} data-eva3-scoped="" level="1" list-style-type="${styleType}" style="list-style-type: ${styleType};">\n${body}</${tag}>\n`;
    },

    blockquote({ tokens }) {
      const text = this.parser.parse(tokens);
      return `<blockquote class="eva3-blockquote" data-eva3-scoped=""><p data-eva3-scoped="">${text}</p></blockquote>\n`;
    },

    paragraph({ tokens }) {
      return `<p data-eva3-scoped="">${this.parser.parseInline(tokens)}</p>\n`;
    },

    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}" target="_blank"${titleAttr}>${text}</a>`;
    },

    hr() {
      return '<hr data-eva3-scoped="" />\n';
    }
  };

  const customMarked = new Marked({
    renderer,
    gfm: true,
    breaks: true
  });

  const html = customMarked.parse(markdown);
  return {
    html,
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
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node parser.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const result = await parseArticle(targetFile);
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
