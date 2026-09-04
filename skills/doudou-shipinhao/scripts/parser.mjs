import fs from 'node:fs';
import path from 'node:path';

/**
 * 提取并清洗原始文章标题
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractRawTitle(content, fallbackTitle = '未命名视频') {
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
 * 提取并清洗微信视频号短标题（严格限制 16 字以内）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @param {string} [manifestTitle]
 * @returns {string}
 */
export function extractShortTitle(content, fallbackTitle = '未命名视频', manifestTitle = '') {
  let target = manifestTitle || extractRawTitle(content, fallbackTitle);
  // 清洗特殊标点，保持精炼
  let cleanTitle = target.replace(/[【】《》「」：:，,。！!？?]/g, ' ').replace(/\s+/g, ' ').trim();
  // 微信视频号短标题严格限制 16 字以内
  if (cleanTitle.length > 16) {
    cleanTitle = cleanTitle.substring(0, 15) + '…';
    if (cleanTitle.length > 16) {
      cleanTitle = cleanTitle.substring(0, 16);
    }
  }
  return cleanTitle;
}

/**
 * 提取文章摘要（描述首段观点，60 字以内）
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
 * 提炼微信视频号专属描述（多行结构化干货要点，限制 1000 字以内）
 * @param {string} content 
 * @param {string} title 
 * @param {string[]} tags 
 * @returns {string}
 */
export function extractVideoDescription(content, title = '', tags = []) {
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

  const tagString = Array.isArray(tags) && tags.length > 0 ? tags.map(t => `#${t}`).join(' ') : '';
  const summary = extractArticleSummary(content);

  let desc = `💡 ${summary}\n\n🔥 核心要点干货整理：\n`;
  if (points.length > 0) {
    desc += points.map((p, idx) => `0${idx + 1} ${p}`).join('\n') + '\n\n';
  } else {
    desc += `01 工业级标准封装实践\n02 清晰接口契约与分层设计\n03 自动化守门与高质量交付\n\n`;
  }
  desc += `✨ 欢迎关注交流与探讨！`;
  if (tagString) {
    desc += `\n\n${tagString}`;
  }

  return desc.length > 950 ? desc.substring(0, 940) + '...' : desc;
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

  // 2. 备选扫描 articleDir/ 下直接存在的 .mp4
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
 * 一站式解析全部视频发布所需资产
 * @param {string} markdownFilePath 
 * @returns {object}
 */
export function parseAllAssets(markdownFilePath) {
  if (!fs.existsSync(markdownFilePath)) {
    throw new Error(`Markdown 文件不存在: ${markdownFilePath}`);
  }

  const content = fs.readFileSync(markdownFilePath, 'utf-8');
  const video = resolveVideoAsset(markdownFilePath);
  const shortTitle = extractShortTitle(content, '未命名视频', video.manifestTitle);
  // 遵循全平台发布技能约定，tags 固定为空数组 []
  const tags = [];
  const videoDesc = extractVideoDescription(content, shortTitle, tags);

  return {
    markdownFilePath: path.resolve(markdownFilePath),
    shortTitle,
    videoDesc,
    tags,
    video
  };
}

// 命令行直接测试支持
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'))) {
  const targetMd = process.argv[2] || 'e:/me/undsky/mds/AICoding/ddagent.md';
  console.log('=== 解析视频号资产测试 ===');
  const res = parseAllAssets(targetMd);
  console.log(JSON.stringify(res, null, 2));
}
