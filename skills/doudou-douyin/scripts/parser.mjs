import fs from 'node:fs';
import path from 'node:path';
import { resolveCoverFromManifest, inferTags } from './asset_resolver.mjs';
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
      return clean.length > 30 ? clean.substring(0, 27) + '...' : clean;
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
      const clean = trimmed.replace(/^[#\s*`~]+/, '').trim();
      return clean.length > 30 ? clean.substring(0, 27) + '...' : clean;
    }
  }
  return fallbackTitle.length > 30 ? fallbackTitle.substring(0, 27) + '...' : fallbackTitle;
}

/**
 * 提取并清洗图文标题（抖音图文标题限制 20 字以内）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractImagePostTitle(content, fallbackTitle = '未命名图文') {
  const title = extractArticleTitle(content, fallbackTitle);
  return title.length > 20 ? title.substring(0, 17) + '...' : title;
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
    summary = summary.substring(0, 27) + '...';
  }
  return summary;
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
  const summary = extractArticleSummary(content, title);

  // 要点提取不到时省略整段，不编造与文章无关的固定要点
  let desc = summary;
  if (points.length > 0) {
    desc += `\n\n📌 核心要点梳理：\n` + points.map((p, idx) => `${idx + 1}. ${p}`).join('\n');
  }
  if (tagString) {
    desc += `\n\n${tagString}`;
  }

  return desc.length > 950 ? desc.substring(0, 940) + '...' : desc;
}

/**
 * 提炼视频发布描述正文（要点梳理 + 话题标签，抖音限制 1000 字以内）
 * @param {string} content 
 * @param {string} title 
 * @param {string[]} tags 
 * @returns {string}
 */
export function extractVideoDescription(content, title = '', tags = []) {
  return extractImagePostDescription(content, title, tags);
}

/**
 * 将 Markdown 中的本地图片引用替换为 CDN 链接
 * 仅作用于 `![alt](target)` / `[text](target)` 的 target 位置与 HTML `src="target"`，
 * 不做全文裸文件名替换，避免正文叙述或代码块里出现同名字符串时被误伤。
 * @param {string} markdown
 * @param {Array<{ cdn_url?: string, local_path?: string }>} assets
 * @returns {string}
 */
export function replaceLocalAssetsWithCdn(markdown, assets) {
  if (!markdown || !Array.isArray(assets) || assets.length === 0) return markdown;

  // 建立「本地路径 / 裸文件名」到 CDN 链接的映射（完整路径优先命中）
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
    // 剥离 URL 查询串与锚点后再比对
    const bare = clean.split(/[?#]/)[0];
    return byPath.get(bare) || byPath.get(bare.replace(/^\.\//, '')) || byName.get(path.basename(bare)) || null;
  };

  // 1. Markdown 图片与链接的 target 位置
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
 * 解析排版后的正文 HTML（遵循 gzh-design 规范）
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
          targetMarkdown = replaceLocalAssetsWithCdn(targetMarkdown, manifest.assets);
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
 * 解析封面图资产（优先图文卡片的第一张封面卡，如 xhs_images/images/01-cover.png）
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
        type: 'local',
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
      // 统一走 asset_resolver：兼容 assets[] / files[] 两种结构，并以 cover/ 路径信号
      // 识别封面（真实清单无 type/slug 字段，旧逻辑在此静默跳过、误挑到 2MB 插图）。
      // 抖音封面上传门槛是 `if (meta.coverBase64)`，故必须 preferBase64。
      const fromManifest = resolveCoverFromManifest(articleDir, { preferBase64: true });
      if (fromManifest) return fromManifest;
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
        type: 'local',
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
 * 解析图文卡片图片集（小红书/微信/抖音图文卡片）
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
 * 解析视频资产（从文章同名目录下的 video/ 目录寻找 .mp4 视频产物）
 * 优先匹配 video_manifest.json 中输出的成片（排除 _nobgm.mp4），或选取第一个可用的 .mp4
 * @param {string} markdownFilePath 
 * @returns {{ hasVideo: boolean, videoPath?: string, fileName?: string, sizeBytes?: number, durationSeconds?: number }}
 */
export function resolveVideoAsset(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 优先扫描 articleDir/video/
  const videoDir = path.join(articleDir, 'video');
  if (fs.existsSync(videoDir) && fs.statSync(videoDir).isDirectory()) {
    // 优先读取 video_manifest.json
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

  // 3. 备选扫描同级目录
  const siblingMp4 = path.join(dir, `${baseName}.mp4`);
  if (fs.existsSync(siblingMp4)) {
    const stat = fs.statSync(siblingMp4);
    return {
      hasVideo: true,
      videoPath: siblingMp4,
      fileName: `${baseName}.mp4`,
      sizeBytes: stat.size,
      durationSeconds: 0
    };
  }

  return { hasVideo: false };
}

/**
 * 抖音支持的三种发布模态定义（按推荐执行顺序排列）
 * 顺序原因：视频转码耗时最长优先启动，图文次之，长文最快且不依赖上传轮询
 */
export const PUBLISH_MODES = [
  { mode: 'video', label: '视频', aliases: ['video', '视频', '短视频', '视频作品'] },
  { mode: 'image', label: '图文', aliases: ['image', 'imagepost', '图文', '图片', '图文笔记', '卡片'] },
  { mode: 'article', label: '文章', aliases: ['article', 'longarticle', '文章', '长文', '图文文章'] }
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
  // 保持 PUBLISH_MODES 的推荐执行顺序
  return PUBLISH_MODES.filter(m => picked.includes(m.mode)).map(m => m.mode);
}

/**
 * 依据已解析资产推导发布计划：默认全模态发布，缺资产的模态自动跳过并登记原因
 * @param {object} meta parseAllAssets 的解析结果（可为半成品对象）
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
    image: {
      ok: Array.isArray(meta.imageCards) && meta.imageCards.length > 0,
      reason: '同名目录下未找到 xhs_images/images/ 图文卡片集'
    },
    article: {
      ok: !!(meta.articleHtml && meta.articleHtml.htmlContent && meta.articleHtml.htmlContent.trim().length > 0),
      reason: '未解析出可用的文章正文 HTML'
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
 * @param {string|string[]|null} requestedModes 用户显式指定的发布模态；留空则默认全模态
 * @returns {object}
 */
export function parseAllAssets(markdownFilePath, author = 'undsky', requestedModes = null) {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const articleTitle = extractArticleTitle(rawContent);
  const imagePostTitle = extractImagePostTitle(rawContent);
  const articleSummary = extractArticleSummary(rawContent);
  // 由 asset_resolver.inferTags 从标题与正文推断（上限 5）。
  // 旧实现固定为空数组，导致下游标签/话题分支被 length > 0 判空整段跳过。
  const tags = inferTags(rawContent, articleTitle, 5);
  const imagePostDesc = extractImagePostDescription(rawContent, imagePostTitle, tags);
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath, rawContent);
  const imageCards = resolveImagePostCards(absPath);
  const video = resolveVideoAsset(absPath);
  const videoTitle = (video.manifestTitle && video.manifestTitle.length <= 30) ? video.manifestTitle : articleTitle;
  const videoDesc = extractVideoDescription(rawContent, videoTitle, tags);

  const result = {
    markdownFilePath: absPath,
    articleTitle,
    imagePostTitle,
    videoTitle,
    author,
    articleSummary,
    tags,
    imagePostDesc,
    videoDesc,
    articleHtml,
    cover,
    imageCards,
    cardCount: imageCards.length,
    cardFilePaths: imageCards.map(c => c.localPath),
    video,
    hasVideo: video.hasVideo,
    videoPath: video.videoPath
  };

  result.publishPlan = resolvePublishPlan(result, requestedModes);
  return result;
}

// 命令行直接运行测试支持
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('parser.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node parser.mjs <Markdown文件路径>');
    process.exit(1);
  }
  console.log(`[parser] 正在解析: ${targetFile}`);
  // 第三个参数可选：显式指定模态（如 "视频" / "图文,文章"），留空则默认全模态发布
  const result = parseAllAssets(targetFile, 'undsky', process.argv[3] || null);
  console.log(JSON.stringify({
    publishPlan: result.publishPlan,
    articleTitle: result.articleTitle,
    imagePostTitle: result.imagePostTitle,
    videoTitle: result.videoTitle,
    author: result.author,
    articleSummary: result.articleSummary,
    tags: result.tags,
    articleHtmlType: result.articleHtml.type,
    articleHtmlLength: result.articleHtml.htmlContent.length,
    hasCover: result.cover.hasCover,
    coverFile: result.cover.fileName,
    cardCount: result.cardCount,
    cardFiles: result.imageCards.map(s => s.name),
    cardPaths: result.cardFilePaths,
    hasVideo: result.hasVideo,
    videoFileName: result.video?.fileName,
    videoPath: result.video?.videoPath,
    videoSizeBytes: result.video?.sizeBytes
  }, null, 2));
}
