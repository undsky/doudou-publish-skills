import fs from 'node:fs';
import path from 'node:path';
import { resolveCoverFromManifest, inferTags } from './asset_resolver.mjs';

/**
 * 提取并清洗文章标题
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractRawTitle(content, fallbackTitle = '未命名图文') {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.replace(/^#\s+/, '').replace(/[*_`~]/g, '').trim();
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
      return trimmed.replace(/^[#\s*`~]+/, '').trim();
    }
  }
  return fallbackTitle;
}

/**
 * 提取并清洗小红书图文笔记标题（严格限制 20 字以内）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractImagePostTitle(content, fallbackTitle = '未命名图文') {
  const rawTitle = extractRawTitle(content, fallbackTitle);
  // 清洗特殊标点，保持吸睛精炼
  const cleanTitle = rawTitle.replace(/[【】《》「」：]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleanTitle.length > 20 ? cleanTitle.substring(0, 19) + '…' : cleanTitle;
}

/**
 * 提取文章摘要（小红书描述首段观点，60 字以内）
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
    if (textBlocks.join(' ').length >= 50) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (!summary) {
    summary = '深度解析核心架构与工程落地实战指南';
  }
  if (summary.length > 60) {
    summary = summary.substring(0, 58) + '...';
  }
  return summary;
}

/**
 * 提炼小红书图文专属描述（要点梳理 + 热门话题标签，限制 1000 字以内）
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

  let desc = `💡 ${summary}\n\n`;
  if (points.length > 0) {
    desc += `🔥 核心要点干货整理：\n` + points.map((p, idx) => `0${idx + 1} ${p}`).join('\n') + '\n\n';
  }
  desc += `✨ 欢迎评论区交流讨论！\n\n${tagString}`;

  return desc.length > 950 ? desc.substring(0, 940) + '...' : desc;
}

/**
 * 解析小红书图文卡片集
 * 优先读取 xhs_images/images/ (或 xhs_images/) 3:4 卡片集，排除 _yuantu.png
 * @param {string} markdownFilePath 
 * @returns {Array<{ name: string, localPath: string, mimeType: string }>}
 */
export function resolveImagePostCards(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 优先级顺序：
  // 1. xhs_images/images
  // 2. xhs_images
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
          const mimeType = file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
          return {
            name: file,
            localPath,
            mimeType
          };
        });
      }
    }
  }

  return [];
}

/**
 * 提取小红书视频笔记标题（<= 20 字）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractVideoPostTitle(content, fallbackTitle = '未命名视频') {
  return extractImagePostTitle(content, fallbackTitle);
}

/**
 * 提炼小红书视频笔记专属描述（<= 1000 字）
 * @param {string} content 
 * @param {string} title 
 * @param {string[]} tags 
 * @returns {string}
 */
export function extractVideoPostDescription(content, title = '', tags = []) {
  return extractImagePostDescription(content, title, tags);
}

/**
 * 解析视频资产（从文章同名目录下的 video/ 目录寻找 .mp4 视频产物）
 * 优先匹配 video_manifest.json 中输出的成片（排除 _nobgm.mp4），或选取第一个可用的 .mp4
 * @param {string} markdownFilePath 
 * @returns {{ hasVideo: boolean, videoPath?: string, fileName?: string, sizeBytes?: number, durationSeconds?: number, manifestTitle?: string }}
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
 * 小红书支持的两种发布模态定义（按推荐执行顺序排列）
 * 顺序原因：视频上传与转码耗时最长优先启动，图文卡片上传较快随后执行
 */
export const PUBLISH_MODES = [
  { mode: 'video', label: '视频笔记', aliases: ['video', '视频', '视频笔记', '短视频', '视频作品'] },
  { mode: 'image', label: '图文笔记', aliases: ['image', 'imagepost', '图文', '图片', '图文笔记', '卡片', '笔记'] }
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
    video: {
      ok: !!(meta.video && meta.video.hasVideo && meta.video.videoPath),
      reason: '同名目录下未找到 video/*.mp4 视频成片'
    },
    image: {
      ok: Array.isArray(meta.imageCards) && meta.imageCards.length > 0,
      reason: '同名目录下未找到 xhs_images/images/ 3:4 图文卡片集'
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
 * 全面解析 Markdown 文件及其关联资产（图文与视频）
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
  const imagePostTitle = extractImagePostTitle(rawContent);
  const articleSummary = extractArticleSummary(rawContent);
  // 由 asset_resolver.inferTags 从标题与正文推断（上限 5）。
  // 旧实现固定为空数组，导致下游标签/话题分支被 length > 0 判空整段跳过。
  const tags = inferTags(rawContent, imagePostTitle, 5);
  const imagePostDesc = extractImagePostDescription(rawContent, imagePostTitle, tags);
  const imageCards = resolveImagePostCards(absPath);
  const video = resolveVideoAsset(absPath);
  const videoTitle = (video.manifestTitle && video.manifestTitle.length <= 20) 
    ? video.manifestTitle 
    : (video.manifestTitle ? video.manifestTitle.substring(0, 19) + '…' : imagePostTitle);
  const videoDesc = extractVideoPostDescription(rawContent, videoTitle, tags);

  const result = {
    markdownFilePath: absPath,
    title: imagePostTitle,
    imagePostTitle,
    videoTitle,
    author,
    articleSummary,
    tags,
    description: imagePostDesc,
    imagePostDesc,
    videoDesc,
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
  console.log(`[parser] 正在解析资产: ${targetFile}`);
  // 第三个参数可选：显式指定模态（如 "视频" / "图文"），留空则默认全模态发布
  const result = parseAllAssets(targetFile, 'undsky', process.argv[3] || null);
  console.log(JSON.stringify({
    publishPlan: result.publishPlan,
    title: result.title,
    videoTitle: result.videoTitle,
    author: result.author,
    tags: result.tags,
    descPreview: result.description.substring(0, 100) + '...',
    cardCount: result.cardCount,
    cardFiles: result.imageCards.map(s => s.name),
    cardPaths: result.cardFilePaths,
    hasVideo: result.hasVideo,
    videoFileName: result.video?.fileName,
    videoPath: result.video?.videoPath,
    videoSizeBytes: result.video?.sizeBytes
  }, null, 2));
}
