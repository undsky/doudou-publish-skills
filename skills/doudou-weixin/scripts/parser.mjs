import fs from 'node:fs';
import path from 'node:path';
import { resolveCoverFromManifest, sniffImageMime } from './asset_resolver.mjs';
import { Marked } from './marked.esm.js';

/**
 * 提取并清洗 Markdown 标题（微信公众号限制 64 字以内）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractTitle(content, fallbackTitle = '未命名文章') {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      const clean = trimmed.replace(/^#\s+/, '').replace(/[*_`~]/g, '').trim();
      return clean.length > 64 ? clean.substring(0, 61) + '...' : clean;
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
      const clean = trimmed.replace(/^[#\s*`~]+/, '').trim();
      return clean.length > 64 ? clean.substring(0, 61) + '...' : clean;
    }
  }
  return fallbackTitle;
}

/**
 * 提取 80~120 字纯文本摘要（微信公众号限制 120 字以内）
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

    // 移除 markdown 链接、加粗、代码与引用等符号
    const cleanText = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/>\s*/g, '')
      .trim();

    if (cleanText.length > 10) {
      textBlocks.push(cleanText);
    }
    if (textBlocks.join(' ').length >= 90) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (summary.length > 115) {
    summary = summary.substring(0, 112) + '...';
  }
  return summary || '';
}

/**
 * 提炼贴图/小绿书专属描述正文（要点提取，1000 字以内）
 * @param {string} content 
 * @param {string} title 
 * @returns {string}
 */
export function extractStickerDescription(content, title = '') {
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

    // 捕获要点列表或加粗核心句
    if (trimmed.startsWith('- ') || trimmed.startsWith('1. ') || trimmed.startsWith('2. ') || trimmed.startsWith('3. ') || trimmed.startsWith('4. ')) {
      const clean = trimmed
        .replace(/^[-*\d.]+\s+/, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim();
      if (clean.length > 8 && clean.length < 80) {
        points.push(clean);
      }
    }
    if (points.length >= 5) break;
  }

  const summary = extractSummary(content);

  // 要点提取不到时省略整段，不编造与文章无关的固定要点
  let desc = summary;
  if (points.length > 0) {
    desc += `\n\n📌 核心要点梳理：\n` + points.map((p, idx) => `${idx + 1}. ${p}`).join('\n');
  }

  return desc;
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

  // 1. 寻找同名子目录或当前目录中的 _排版_*.html
  const candidateDirs = [
    path.join(dir, baseName),
    dir
  ];

  for (const targetDir of candidateDirs) {
    if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
      const files = fs.readdirSync(targetDir);
      // 筛选纯排版正文 HTML（排除带工具栏的 _预览.html）
      const htmlFiles = files.filter(f => f.includes('_排版_') && f.endsWith('.html') && !f.includes('_预览.html'));
      if (htmlFiles.length > 0) {
        const selectedHtmlPath = path.join(targetDir, htmlFiles[0]);
        const htmlContent = fs.readFileSync(selectedHtmlPath, 'utf-8');
        return {
          type: 'gzh_html',
          filePath: selectedHtmlPath,
          htmlContent
        };
      }
    }
  }

  // 2. 降级：使用 marked 将 Markdown 转译为干净标准 HTML 并包裹微信公众号 section 容器
  const rawMarkdown = fs.readFileSync(absPath, 'utf-8');
  const customMarked = new Marked({ gfm: true, breaks: true });
  const parsedHtml = customMarked.parse(rawMarkdown);
  const fallbackHtml = `<section style="max-width: 677px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #374151; line-height: 1.75; font-size: 16px;">\n${parsedHtml}\n</section>`;

  return {
    type: 'markdown_html',
    filePath: absPath,
    htmlContent: fallbackHtml
  };
}

/**
 * 解析封面图资产
 * 严格优先选用 2.35:1 宽屏主封面，且优先选择 _thumb 缩略图
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string }}
 */
export function resolveCoverImage(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 读取 cdn_manifest.json 中的宽屏主封面（优先 thumb_path 或 _thumb CDN）
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      // 统一走 asset_resolver：此处原本已兼容 files[]，但仍在筛真实清单不存在的
      // `type === 'cover'` 字段，导致 CDN 分支被静默跳过。resolver 以 cover/ 路径信号
      // 识别，并内置 thumb 优先、原图重罚的打分。
      // 公众号封面门槛是 `hasCover && coverBase64`，故必须 preferBase64。
      const fromManifest = resolveCoverFromManifest(articleDir, { preferBase64: true });
      if (fromManifest) return fromManifest;
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 失败:', e.message);
    }
  }

  // 2. 读取 cover/images/ 下的本地封面（严格按 2.35:1_thumb > 2.35:1 > 16x9_thumb > 16x9 排序）
  const coverImagesDir = path.join(articleDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir)) {
    const files = fs.readdirSync(coverImagesDir).filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp')));
    
    // 排序策略
    const pickPriority = (f) => {
      if (f.includes('2.35x1') && f.includes('_thumb')) return 1;
      if (f.includes('2.35x1')) return 2;
      if (f.includes('16x9') && f.includes('_thumb')) return 3;
      if (f.includes('16x9')) return 4;
      if (f.includes('_thumb')) return 5;
      return 6;
    };

    const sortedFiles = files.sort((a, b) => pickPriority(a) - pickPriority(b));
    const mainCover = sortedFiles[0];

    if (mainCover) {
      const localPath = path.join(coverImagesDir, mainCover);
      const buf = fs.readFileSync(localPath);
      const sniffed = sniffImageMime(buf);
      return {
        hasCover: true,
        localPath,
        base64: `data:${sniffed.mime};base64,${buf.toString('base64')}`,
        mimeType: sniffed.mime,
        fileName: mainCover
      };
    }
  }

  return { hasCover: false };
}

/**
 * 解析贴图卡片图片集（小红书/微信图文卡片）
 * @param {string} markdownFilePath 
 * @returns {Array<{ name: string, localPath: string, base64: string, mimeType: string }>}
 */
export function resolveStickerImages(markdownFilePath) {
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
      const allFiles = fs.readdirSync(targetDir)
        .filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')));
      const hasNonThumb = allFiles.some(f => !f.includes('_thumb'));
      const files = (hasNonThumb ? allFiles.filter(f => !f.includes('_thumb')) : allFiles)
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
export const PUBLISH_MODES = [
  { mode: 'article', label: '文章', aliases: ['article', '文章', '图文文章', '长文', '图文'] },
  { mode: 'sticker', label: '贴图', aliases: ['sticker', '贴图', '小绿书', '卡片', '图片', '图文卡片'] }
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
    article: {
      ok: !!(meta.articleHtml && meta.articleHtml.htmlContent && meta.articleHtml.htmlContent.trim().length > 0),
      reason: '未解析出可用的排版正文 HTML'
    },
    sticker: {
      ok: Array.isArray(meta.stickerImages) && meta.stickerImages.length > 0,
      reason: '同名目录下未找到 xhs_images/images/ 贴图卡片集'
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

export function parseAllAssets(markdownFilePath, author = 'undsky', requestedModes = null) {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const title = extractTitle(rawContent);
  // 文章的摘要 summary，直接填文章标题（120字上限安全截断）
  const summary = title.length > 120 ? title.substring(0, 118) + '...' : title;
  const stickerDesc = extractStickerDescription(rawContent, title);
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath, rawContent);
  const stickerImages = resolveStickerImages(absPath);

  const result = {
    markdownFilePath: absPath,
    title,
    author,
    summary,
    stickerDesc,
    articleHtml,
    cover,
    stickerImages,
    stickerCount: stickerImages.length
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
  // 第三个参数可选：显式指定模态（如 "文章" / "贴图"），留空则默认全模态发布
  const result = parseAllAssets(targetFile, 'undsky', process.argv[3] || null);
  console.log(JSON.stringify({
    publishPlan: result.publishPlan,
    title: result.title,
    author: result.author,
    summary: result.summary,
    articleHtmlType: result.articleHtml.type,
    articleHtmlLength: result.articleHtml.htmlContent.length,
    hasCover: result.cover.hasCover,
    coverFile: result.cover.fileName,
    stickerCount: result.stickerCount,
    stickerFiles: result.stickerImages.map(s => s.name)
  }, null, 2));
}
