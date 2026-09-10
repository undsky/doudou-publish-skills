import fs from 'node:fs';
import path from 'node:path';
import { resolveCoverFromManifest, inferTags, readManifestItems, isCoverItem } from './asset_resolver.mjs';
import { Marked } from './marked.esm.js';

/**
 * 企鹅号支持的发布模态定义（按推荐执行顺序排列）
 * 顺序原因：视频上传与就绪耗时较长优先启动，长文图文随后执行
 */
export const PUBLISH_MODES = [
  { mode: 'video', label: '视频', aliases: ['video', '视频', '短视频', '视频作品'] },
  { mode: 'article', label: '长文图文', aliases: ['article', '文章', '长文', '图文', '长文图文', '图文文章'] }
];

/**
 * 将用户自然语言指定的模态归一化为标准模态名数组
 * 返回空数组代表「用户未明确指定」，调用方应回退为发布全部可用模态
 * @param {string|string[]|null|undefined} requested
 * @returns {string[]}
 */
export function normalizeRequestedModes(requested) {
  if (!requested) return [];
  const rawList = Array.isArray(requested)
    ? requested
    : String(requested).split(/[\s,，、+/|和与及]+/);
  const picked = [];
  for (const raw of rawList) {
    const key = String(raw).trim().toLowerCase().replace(/[\s_-]/g, '');
    if (!key) continue;
    const hit = PUBLISH_MODES.find(m => m.aliases.some(a => a.toLowerCase().replace(/[\s_-]/g, '') === key));
    if (hit && !picked.includes(hit.mode)) picked.push(hit.mode);
  }
  return PUBLISH_MODES.filter(m => picked.includes(m.mode)).map(m => m.mode);
}

/**
 * 清洗标题格式符号
 * @param {string} str 
 * @returns {string}
 */
export function cleanTitleText(str) {
  if (!str) return '';
  return str
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^[#\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 提取原始标题
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractRawTitle(content, fallbackTitle = '未命名文章') {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return cleanTitleText(trimmed.replace(/^#\s+/, ''));
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
      return cleanTitleText(trimmed.replace(/^[#\s*`~]+/, ''));
    }
  }
  return fallbackTitle;
}

/**
 * 提取并清洗文章标题（企鹅号限制 5～64 字）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @param {string|null} overrideTitle AI 提炼或用户指定的新标题
 * @returns {string}
 */
export function extractArticleTitle(content, fallbackTitle = '未命名文章', overrideTitle = null) {
  if (overrideTitle && typeof overrideTitle === 'string' && overrideTitle.trim()) {
    let t = cleanTitleText(overrideTitle);
    if (t.length > 64) t = t.substring(0, 64);
    if (t.length < 5) t = t.padEnd(5, '！');
    return t;
  }
  let cleanTitle = extractRawTitle(content, fallbackTitle);

  // 企鹅号标题限制 5~64 个字（若超过 64 字则智能截断）
  if (cleanTitle.length > 64) {
    cleanTitle = cleanTitle.substring(0, 64);
  } else if (cleanTitle.length < 5) {
    cleanTitle = cleanTitle.padEnd(5, '！');
  }

  return cleanTitle;
}

/**
 * 提取企鹅号视频标题（限制 5~64 字）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @param {string} manifestTitle 
 * @param {string|null} overrideTitle 
 * @returns {string}
 */
export function extractVideoTitle(content, fallbackTitle = '未命名视频', manifestTitle = '', overrideTitle = null) {
  if (overrideTitle && typeof overrideTitle === 'string' && overrideTitle.trim()) {
    let t = cleanTitleText(overrideTitle);
    if (t.length > 64) t = t.substring(0, 64);
    if (t.length < 5) t = t.padEnd(5, '！');
    return t;
  }
  let target = manifestTitle || extractRawTitle(content, fallbackTitle);
  let t = cleanTitleText(target);
  if (t.length > 64) t = t.substring(0, 64);
  if (t.length < 5) t = t.padEnd(5, '！');
  return t;
}

/**
 * 提取文章纯文本摘要（100 字以内）
 * @param {string} content 
 * @param {string} fallbackTitle
 * @returns {string}
 */
export function extractArticleSummary(content, fallbackTitle = '') {
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
    // 无可提取正文时，从文章自身派生摘要（标题 + 首个有效文本行），不注入与内容无关的固定文案
    const firstMeaningful = content.split('\n')
      .map(l => l.trim().replace(/^[#>*\-\d.\s]+/, '').replace(/[*_`~]/g, '').trim())
      .find(l => l.length > 0 && !l.startsWith('!['));
    const parts = [fallbackTitle, firstMeaningful].filter(Boolean);
    summary = [...new Set(parts)].join(' ').trim();
  }
  if (summary.length > 100) {
    summary = summary.substring(0, 98) + '...';
  }
  return summary;
}

/**
 * 提取视频专属多行简介（干货整理，不添加标签，限制 1000 字）
 * @param {string} content 
 * @param {string} title 
 * @returns {string}
 */
export function extractVideoDescription(content, title = '') {
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

  const summary = extractArticleSummary(content, title);
  let desc = `💡 ${summary}\n\n`;
  if (points.length > 0) {
    desc += `🔥 核心要点整理：\n` + points.map((p, idx) => `0${idx + 1} ${p}`).join('\n') + '\n\n';
  }
  desc += `✨ 欢迎关注交流与探讨！`;

  return desc.length > 950 ? desc.substring(0, 940) + '...' : desc;
}

/**
 * 将 Markdown 转换为企鹅号 ExEditor 兼容的高质量语义 HTML（基于 marked）
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
        .replace(/>/g, '&gt;')
        .replace(/ /g, '&nbsp;')
        .replace(/\n/g, '<br>');
      return `<blockquote style="background: #f6f8fa; border-left: 4px solid #0077ff; padding: 12px 16px; margin: 14px 0; font-family: Consolas, 'Courier New', monospace; font-size: 13px; line-height: 1.6;"><p style="font-family: Consolas, 'Courier New', monospace; margin: 0; color: #24292e;">${escaped}</p></blockquote>\n`;
    },

    image({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<p style="text-align: center;"><img src="${href}" alt="${text}"${titleAttr} style="max-width: 100%; border-radius: 6px;" /></p>\n`;
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
 * 将 Markdown 中的本地图片引用替换为 CDN 链接
 * @param {string} markdown
 * @param {Array<{ cdn_url?: string, local_path?: string }>} assets
 * @returns {string}
 */
export function replaceLocalAssetsWithCdn(markdown, assets) {
  if (!markdown || !Array.isArray(assets) || assets.length === 0) return markdown;

  const byPath = new Map();
  const byName = new Map();
  for (const asset of assets) {
    if (!asset || !asset.cdn_url || !asset.local_path) continue;
    const normalized = asset.local_path.replace(/\\/g, '/');
    byPath.set(normalized, asset.cdn_url);
    byPath.set(`./${normalized}`, asset.cdn_url);
    const relName = path.basename(normalized);
    if (!byName.has(relName)) byName.set(relName, asset.cdn_url);
  }
  if (byPath.size === 0) return markdown;

  const lookup = (target) => {
    const clean = target.trim().replace(/^<|>$/g, '').replace(/\\/g, '/');
    if (/^(https?:)?\/\//.test(clean) || clean.startsWith('data:')) return null;
    const bare = clean.split(/[?#]/)[0];
    return byPath.get(bare) || byPath.get(bare.replace(/^\.\//, '')) || byName.get(path.basename(bare)) || null;
  };

  // 1. Markdown 图片与链接
  let result = markdown.replace(/(!?\[[^\]]*\]\()([^)\s]+)([^)]*\))/g, (full, prefix, target, suffix) => {
    const cdn = lookup(target);
    return cdn ? `${prefix}${cdn}${suffix}` : full;
  });

  // 2. 内联 HTML 的 src 属性
  result = result.replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi, (full, prefix, quote, target) => {
    const cdn = lookup(target);
    return cdn ? `${prefix}${quote}${cdn}${quote}` : full;
  });

  return result;
}

/**
 * 解析排版正文 HTML
 * @param {string} markdownFilePath 
 * @returns {{ type: string, filePath: string, htmlContent: string }}
 */
export function resolveArticleHtml(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  let targetMarkdown = '';
  const cdnMdPath = path.join(articleDir, `${baseName}_cdn.md`);
  if (fs.existsSync(cdnMdPath)) {
    targetMarkdown = fs.readFileSync(cdnMdPath, 'utf-8');
  } else {
    targetMarkdown = fs.readFileSync(absPath, 'utf-8');
    const manifestPath = path.join(articleDir, 'cdn_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (Array.isArray(manifest.assets)) {
          targetMarkdown = replaceLocalAssetsWithCdn(targetMarkdown, manifest.assets);
        }
      } catch (e) {
        console.warn('[parser] 读取 cdn_manifest.json 异常:', e.message);
      }
    }
  }

  const htmlContent = markdownToSemanticHtml(targetMarkdown);

  return {
    type: 'semantic_html',
    filePath: cdnMdPath,
    htmlContent
  };
}

/**
 * 智能获取文章封面图资产
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string, cdnUrl?: string }}
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
      
      let cdnUrl = '';
      const manifestPath = path.join(articleDir, 'cdn_manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const list = Array.isArray(manifest) ? manifest : (manifest.files || manifest.assets || []);
          const matched = list.find(f => {
            const lp = f.local_path || f.localPath || '';
            return lp.endsWith(selected) || path.basename(lp) === selected || f.original_name === selected;
          });
          if (matched && (matched.cdn_url || matched.cdnUrl || matched.url)) {
            cdnUrl = matched.cdn_url || matched.cdnUrl || matched.url;
          }
        } catch (e) {}
      }

      return {
        hasCover: true,
        type: cdnUrl ? 'cdn' : 'local',
        localPath,
        cdnUrl: cdnUrl || undefined,
        url: cdnUrl || undefined,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: selected
      };
    }
  }

  // 2. 备选：读取 cdn_manifest.json 中的封面条目
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const fromManifest = resolveCoverFromManifest(articleDir, { preferBase64: true });
      if (fromManifest) return fromManifest;
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 失败:', e.message);
    }
  }

  // 3. 备选：读取 xhs_images/images/ 下的第一张封面卡片
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
        type: 'local',
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
 * 为企鹅号视频解析专属 16:9 高清封面
 * 优先级：
 * 1. cover/images/ 目录下 16:9 高清封面：首选 cover-16x9.png（排除 _thumb / _yuantu）
 * 2. cover/images/ 目录下主封面高清图：次选 cover.png
 * 3. cover/ 根目录下的 16:9 高清原图
 * 4. cdn_manifest.json 中匹配 16:9 封面
 * 5. 回退至通用封面解析
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string, cdnUrl?: string }}
 */
export function resolveVideoCoverImage(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  const is16x9 = (name) => /16x9|16-9|16_9|16:9/i.test(name);
  const isThumb = (name) => /_thumb|thumb|_yuantu/i.test(name);

  const makeResult = (filePath, fileName) => {
    const buf = fs.readFileSync(filePath);
    const mimeType = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    let cdnUrl = '';
    const manifestPath = path.join(articleDir, 'cdn_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const list = Array.isArray(manifest) ? manifest : (manifest.files || manifest.assets || []);
        const matched = list.find(f => {
          const lp = f.local_path || f.localPath || '';
          return lp.endsWith(fileName) || path.basename(lp) === fileName || f.original_name === fileName;
        });
        if (matched && (matched.cdn_url || matched.cdnUrl || matched.url)) {
          cdnUrl = matched.cdn_url || matched.cdnUrl || matched.url;
        }
      } catch (e) {}
    }
    return {
      hasCover: true,
      type: cdnUrl ? 'cdn' : 'local',
      localPath: filePath,
      cdnUrl: cdnUrl || undefined,
      url: cdnUrl || undefined,
      base64: `data:${mimeType};base64,${buf.toString('base64')}`,
      mimeType,
      fileName
    };
  };

  // 1. 扫描 cover/images/ 目录（首选 16:9 高清图）
  const coverImagesDir = path.join(articleDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir)) {
    const allFiles = fs.readdirSync(coverImagesDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f) && !isThumb(f));

    const cover16x9 = allFiles.find(f => is16x9(f));
    if (cover16x9) {
      return makeResult(path.join(coverImagesDir, cover16x9), cover16x9);
    }
    const mainCover = allFiles.find(f => f.startsWith('cover.') || f === 'cover.png');
    if (mainCover) {
      return makeResult(path.join(coverImagesDir, mainCover), mainCover);
    }
    const otherCover = allFiles.find(f => f.includes('cover'));
    if (otherCover) {
      return makeResult(path.join(coverImagesDir, otherCover), otherCover);
    }
    if (allFiles.length > 0) {
      return makeResult(path.join(coverImagesDir, allFiles[0]), allFiles[0]);
    }
  }

  // 2. 扫描 cover/ 根目录
  const coverDir = path.join(articleDir, 'cover');
  if (fs.existsSync(coverDir)) {
    const rootFiles = fs.readdirSync(coverDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f) && !isThumb(f));
    const root16x9 = rootFiles.find(f => is16x9(f));
    if (root16x9) {
      return makeResult(path.join(coverDir, root16x9), root16x9);
    }
    const rootCover = rootFiles.find(f => f.startsWith('cover.') || f === 'cover.png');
    if (rootCover) {
      return makeResult(path.join(coverDir, rootCover), rootCover);
    }
  }

  // 3. 扫描 cdn_manifest.json 中匹配 16:9 封面
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const items = readManifestItems(manifestPath);
      const coverItem = items.find(it => isCoverItem(it) && !isThumb(it.sig) && is16x9(it.sig)) ||
        items.find(it => isCoverItem(it) && !isThumb(it.sig));
      if (coverItem && coverItem.localPath) {
        const fullLocal = path.resolve(articleDir, coverItem.localPath);
        if (fs.existsSync(fullLocal)) {
          return makeResult(fullLocal, coverItem.name || path.basename(fullLocal));
        }
      }
    } catch (e) {}
  }

  // 4. 回退通用封面
  return resolveCoverImage(markdownFilePath, content);
}

/**
 * 解析视频资产（从文章同名目录下的 video/ 目录寻找 .mp4 产物）
 * 优先匹配 video_manifest.json，排除 nobgm/_temp
 * @param {string} markdownFilePath 
 * @returns {{ hasVideo: boolean, videoPath?: string, fileName?: string, sizeBytes?: number, durationSeconds?: number, manifestTitle?: string }}
 */
export function resolveVideoAsset(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 扫描 articleDir/video/
  const videoDir = path.join(articleDir, 'video');
  if (fs.existsSync(videoDir) && fs.statSync(videoDir).isDirectory()) {
    const manifestPath = path.join(videoDir, 'video_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const manifestTitle = manifest.article?.title || manifest.video?.title;
        if (manifest.video?.outputs && Array.isArray(manifest.video.outputs)) {
          const primary = manifest.video.outputs.find(o => o.bgm !== false && o.file?.endsWith('.mp4')) || manifest.video.outputs[0];
          if (primary && primary.file) {
            const p = path.join(videoDir, primary.file);
            if (fs.existsSync(p)) {
              const stat = fs.statSync(p);
              return {
                hasVideo: true,
                videoPath: p,
                fileName: primary.file,
                sizeBytes: stat.size,
                durationSeconds: manifest.video.duration_seconds || 0,
                manifestTitle
              };
            }
          }
        }
      } catch (e) {}
    }

    const files = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4'));
    const chosen = files.find(f => !f.includes('nobgm') && !f.includes('_temp')) || files[0];
    if (chosen) {
      const p = path.join(videoDir, chosen);
      const stat = fs.statSync(p);
      return {
        hasVideo: true,
        videoPath: p,
        fileName: chosen,
        sizeBytes: stat.size,
        durationSeconds: 0
      };
    }
  }

  // 2. 备选扫描 articleDir/*.mp4
  if (fs.existsSync(articleDir) && fs.statSync(articleDir).isDirectory()) {
    const files = fs.readdirSync(articleDir).filter(f => f.endsWith('.mp4'));
    if (files.length > 0) {
      const p = path.join(articleDir, files[0]);
      const stat = fs.statSync(p);
      return {
        hasVideo: true,
        videoPath: p,
        fileName: files[0],
        sizeBytes: stat.size,
        durationSeconds: 0
      };
    }
  }

  return { hasVideo: false };
}

/**
 * 依据标题与正文推断企鹅号文章分类
 * @param {string} content
 * @param {string} title
 * @returns {string}
 */
export function inferCategory(content, title = '') {
  const fullText = (title + ' ' + content).toLowerCase();

  const rules = [
    { category: '互联网', keywords: ['ai', 'agent', '智能体', '大模型', 'llm', 'gpt', 'prompt', 'aigc', '编程', '代码', '开发', '架构', '微服务', 'java', 'python', 'docker', 'k8s', 'n8n', 'mcp', '自动化', '数据库', '前端', '后端', '算法', '技术', '互联网'] },
    { category: '科技', keywords: ['科学', '数码', '手机', '硬件', '芯片', '半导体', '航天'] },
    { category: '财经', keywords: ['财经', '股票', '基金', '投资', '理财', '经济', '金融', '营收', '融资', '上市'] },
    { category: '游戏', keywords: ['游戏', '手游', '端游', '电竞', 'steam', '主机', '玩家'] },
    { category: '汽车', keywords: ['汽车', '新能源车', '电动车', '车型', '试驾', '燃油车'] },
    { category: '教育', keywords: ['教育', '考试', '学习方法', '课程', '考研', '高考', '教学'] },
    { category: '职场', keywords: ['职场', '面试', '简历', '求职', '晋升', '年终总结', '副业'] }
  ];

  for (const item of rules) {
    if (item.keywords.some(k => fullText.includes(k))) {
      return item.category;
    }
  }

  return '互联网';
}

/**
 * 依据已解析资产推导发布计划：默认全模态发布，缺资产的模态自动跳过并登记原因
 * @param {object} meta parseAllAssets 的解析结果
 * @param {string|string[]|null} requestedModes 用户显式指定的模态；为空表示未指定 => 全发
 * @returns {{requested: string[], userSpecified: boolean, modes: string[], skipped: {mode: string, label: string, reason: string}[], summary: string}}
 */
export function resolvePublishPlan(meta, requestedModes = null) {
  const requested = normalizeRequestedModes(requestedModes);
  const userSpecified = requested.length > 0;
  const targetModes = userSpecified ? requested : PUBLISH_MODES.map(m => m.mode);

  const availability = {
    video: {
      ok: !!(meta.video && meta.video.hasVideo && meta.video.videoPath),
      reason: '同名目录下未找到 video/*.mp4 视频成片'
    },
    article: {
      ok: !!(meta.articleHtml && meta.articleHtml.htmlContent && meta.articleHtml.htmlContent.trim().length > 0),
      reason: '未解析出可用的排版正文 HTML'
    }
  };

  const modes = [];
  const skipped = [];
  for (const def of PUBLISH_MODES) {
    if (!targetModes.includes(def.mode)) continue;
    if (availability[def.mode].ok) {
      modes.push(def.mode);
    } else {
      skipped.push({ mode: def.mode, label: def.label, reason: availability[def.mode].reason });
    }
  }

  const labelOf = m => (PUBLISH_MODES.find(d => d.mode === m) || { label: m }).label;
  const summary = [
    userSpecified
      ? `用户指定模态：${requested.map(labelOf).join(' + ')}`
      : '用户未指定模态 => 默认发布全部可用模态',
    modes.length ? `将发布：${modes.map(labelOf).join(' + ')}` : '无可发布模态',
    skipped.length ? `已跳过：${skipped.map(s => `${s.label}（${s.reason}）`).join('；')}` : ''
  ].filter(Boolean).join('｜');

  return { requested, userSpecified, modes, skipped, summary };
}

/**
 * 全面解析 Markdown 文件及其关联资产
 * @param {string} markdownFilePath 
 * @param {string} author 
 * @param {string|string[]|null} requestedModes
 * @param {string|null} overrideTitle
 * @returns {object}
 */
export function parseAllAssets(markdownFilePath, author = 'undsky', requestedModes = null, overrideTitle = null) {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const articleTitle = extractArticleTitle(rawContent, '未命名文章', overrideTitle);
  const articleSummary = extractArticleSummary(rawContent, articleTitle);
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath, rawContent);
  const videoCover = resolveVideoCoverImage(absPath, rawContent);
  const video = resolveVideoAsset(absPath);
  const videoTitle = extractVideoTitle(rawContent, '未命名视频', video.manifestTitle, overrideTitle);
  const videoDesc = extractVideoDescription(rawContent, videoTitle);
  const category = inferCategory(rawContent, articleTitle);

  const result = {
    markdownFilePath: absPath,
    articleTitle,
    author,
    articleSummary,
    articleHtml,
    cover,
    videoCover,
    video,
    videoTitle,
    videoDesc,
    // 严格遵循用户要求：标签严格留空，由用户人工按需填写
    tags: [],
    category
  };

  result.publishPlan = resolvePublishPlan(result, requestedModes);
  return result;
}

// 命令行直接测试支持
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('parser.mjs'))) {
  const args = process.argv.slice(2);
  const targetFile = args[0];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node parser.mjs <Markdown文件路径> [模态] [--title "自定义新标题"]');
    process.exit(1);
  }

  let requestedModes = null;
  let overrideTitle = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      overrideTitle = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      requestedModes = args[i];
    }
  }

  console.log(`[parser] 正在解析: ${targetFile}`);
  const result = parseAllAssets(targetFile, 'undsky', requestedModes, overrideTitle);
  console.log(JSON.stringify({
    articleTitle: result.articleTitle,
    videoTitle: result.videoTitle,
    hasVideo: result.video.hasVideo,
    videoFile: result.video.fileName,
    videoSize: result.video.sizeBytes ? `${(result.video.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : 0,
    hasArticleHtml: !!result.articleHtml.htmlContent,
    articleHtmlLength: result.articleHtml.htmlContent?.length || 0,
    hasCover: result.cover.hasCover,
    coverFile: result.cover.fileName,
    hasVideoCover: result.videoCover.hasCover,
    videoCoverFile: result.videoCover.fileName,
    category: result.category,
    tags: result.tags,
    publishPlan: result.publishPlan
  }, null, 2));
}
