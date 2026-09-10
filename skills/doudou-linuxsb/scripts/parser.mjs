import fs from 'node:fs';
import path from 'node:path';
import { resolveCoverFromManifest, inferTags } from './asset_resolver.mjs';

/**
 * 社区版块映射表 (fid -> 版块名称)
 */
export const FORUM_BOARDS = {
  '1': '错误地方',
  '4': '技术交流',
  '3': '资源分享',
  '2': '福利放送',
  '5': '求助问答',
  '7': '深度思考',
  '8': '我要推广',
  '6': '社区治理',
  '10': '大禹治水'
};

/**
 * 提取 Markdown 标题
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractTitle(content, fallbackTitle = '未命名主题') {
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
 * 从正文中提炼 80~200 字摘要
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

    // 移除 markdown 链接与加粗符号
    const cleanText = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/>\s*/g, '')
      .trim();

    if (cleanText.length > 10) {
      textBlocks.push(cleanText);
    }
    if (textBlocks.join(' ').length >= 150) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (summary.length > 200) {
    summary = summary.substring(0, 197) + '...';
  }
  return summary || '';
}

/**
 * 发帖版块（定死技术交流 fid=4）
 * @param {string} [filePath]
 * @param {string} [title]
 * @param {string} [content]
 * @param {string} [defaultFid='4']
 * @returns {{ fid: string, name: string }}
 */
export function resolveBoardCategory(filePath, title, content, defaultFid = '4') {
  return { fid: '4', name: '技术交流' };
}

/**
 * 清洗/提取 Markdown 正文（可选择去除首行重复 H1）
 * @param {string} content 
 * @param {{ removeFirstH1?: boolean }} options 
 * @returns {string}
 */
export function extractBodyContent(content, options = { removeFirstH1: true }) {
  let text = content.trim();

  // 移除开头的 YAML Frontmatter
  if (text.startsWith('---')) {
    const secondIndex = text.indexOf('---', 3);
    if (secondIndex !== -1) {
      text = text.slice(secondIndex + 3).trim();
    }
  }

  if (options.removeFirstH1) {
    const lines = text.split('\n');
    let firstH1Index = -1;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('# ')) {
        firstH1Index = i;
        break;
      }
      if (trimmed.length > 0 && !trimmed.startsWith('<!--')) {
        break;
      }
    }
    if (firstH1Index !== -1) {
      lines.splice(firstH1Index, 1);
      text = lines.join('\n').trim();
    }
  }

  return text;
}

/**
 * 解析封面图资产
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ type: 'cdn'|'local'|'none', url?: string, localPath?: string, mimeType?: string }}
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
      // 统一走 asset_resolver：兼容 assets[] / files[] 两种结构，并以 cover/ 路径信号
      // 识别封面（真实清单无 type/slug/aspect_ratio 字段，旧逻辑在此静默跳过）。
      const fromManifest = resolveCoverFromManifest(artifactDir);
      if (fromManifest) return fromManifest;
    } catch {
      // ignore JSON parse error
    }
  }

  // 2. 从 cover/images/ 读取本地封面
  const coverDir = path.join(artifactDir, 'cover', 'images');
  if (fs.existsSync(coverDir)) {
    const files = fs.readdirSync(coverDir);
    const coverFile = files.find(f => f.includes('2.35') || f.includes('16x9') || f.includes('cover')) || files[0];
    if (coverFile) {
      const fullPath = path.join(coverDir, coverFile);
      const extName = path.extname(fullPath).toLowerCase().replace('.', '');
      return {
        type: 'local',
        localPath: fullPath,
        mimeType: extName === 'png' ? 'image/png' : 'image/jpeg'
      };
    }
  }

  // 3. 从 Markdown 正文中提取第一张图片链接
  const imgMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (imgMatch && imgMatch[1]) {
    return {
      type: 'cdn',
      url: imgMatch[1],
      mimeType: 'image/png'
    };
  }

  return { type: 'none' };
}

/**
 * 解析目标 Markdown 文章所有资产
 * @param {string} markdownFilePath 
 * @param {{ defaultFid?: string, preferCdn?: boolean }} options 
 * @returns {{
 *   title: string,
 *   summary: string,
 *   bodyContent: string,
 *   fid: string,
 *   forumName: string,
 *   cover: { type: string, url?: string, localPath?: string, mimeType?: string },
 *   originalPath: string,
 *   targetPath: string
 * }}
 */
export function parseArticle(markdownFilePath, options = {}) {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`文件不存在: ${absPath}`);
  }

  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const stem = path.basename(absPath, ext);

  // 优先查找 _cdn.md
  let targetPath = absPath;
  if (options.preferCdn !== false) {
    const cdnFileInDir = path.join(dir, `${stem}_cdn${ext}`);
    const cdnFileInSubdir = path.join(dir, stem, `${stem}_cdn${ext}`);
    if (fs.existsSync(cdnFileInDir)) {
      targetPath = cdnFileInDir;
    } else if (fs.existsSync(cdnFileInSubdir)) {
      targetPath = cdnFileInSubdir;
    }
  }

  const rawContent = fs.readFileSync(targetPath, 'utf8');
  const title = extractTitle(rawContent, stem);
  const summary = extractSummary(rawContent);
  const bodyContent = extractBodyContent(rawContent, { removeFirstH1: true });
  const boardInfo = resolveBoardCategory(absPath, title, rawContent, options.defaultFid || '4');
  const cover = resolveCoverImage(absPath, rawContent);

  return {
    title,
    summary,
    bodyContent,
    fid: boardInfo.fid,
    forumName: boardInfo.name,
    cover,
    originalPath: absPath,
    targetPath
  };
}

// 命令行直接运行测试
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('Usage: node parser.mjs <MarkdownFilePath> [defaultFid]');
    process.exit(1);
  }
  const defaultFid = process.argv[3] || '4';
  const result = parseArticle(filePath, { defaultFid });
  console.log('=== 解析结果 ===');
  console.log('标题:', result.title);
  console.log('版块:', `${result.forumName} (fid=${result.fid})`);
  console.log('摘要:', result.summary);
  console.log('正文长度:', result.bodyContent.length, '字符');
  console.log('封面类型:', result.cover.type, result.cover.url || result.cover.localPath || '无');
  console.log('目标文件:', result.targetPath);
}
