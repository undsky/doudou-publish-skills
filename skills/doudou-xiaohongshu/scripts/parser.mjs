import fs from 'node:fs';
import path from 'node:path';

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
 * 智能提取小红书热门话题标签（最多 5 个）
 * @param {string} content 
 * @param {string} title 
 * @returns {string[]}
 */
export function extractTags(content, title = '') {
  const keywordsMap = [
    { tag: 'AI编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'opencode', 'cursor', 'copilot'] },
    { tag: '智能体', matches: ['agent', '智能体', '多智能体', 'multi-agent', 'ddagent'] },
    { tag: '公众号运营', matches: ['公众号', '微信', '运营规范', '敏感词', '发文', '违规', '排版'] },
    { tag: '程序员日常', matches: ['程序员', '开发者', '技术', '编程', '代码', '后端', '前端', '架构'] },
    { tag: '效率工具', matches: ['ide', 'vscode', 'n8n', 'devtools', 'mcp', '自动化', '工具箱', '效率'] },
    { tag: '干货分享', matches: ['干货', '指南', '实战', '避坑', '教程', '分享'] }
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
    matchedTags.push('效率工具', 'AI编程', '干货分享');
  }

  return matchedTags;
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

  let desc = `💡 ${summary}\n\n🔥 核心要点干货整理：\n`;
  if (points.length > 0) {
    desc += points.map((p, idx) => `0${idx + 1} ${p}`).join('\n') + '\n\n';
  } else {
    desc += `01 工业级标准封装实践\n02 清晰接口契约与分层设计\n03 自动化守门与高质量交付\n\n`;
  }
  desc += `✨ 欢迎评论区交流讨论！\n\n${tagString}`;

  return desc.length > 950 ? desc.substring(0, 940) + '...' : desc;
}

/**
 * 解析小红书图文卡片集（严格遵循 doudou-markdown-skill 小红书图文卡片规约）
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
 * 全面解析 Markdown 文件及其关联图文资产
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
  const imagePostTitle = extractImagePostTitle(rawContent);
  const articleSummary = extractArticleSummary(rawContent);
  const tags = extractTags(rawContent, imagePostTitle);
  const imagePostDesc = extractImagePostDescription(rawContent, imagePostTitle, tags);
  const imageCards = resolveImagePostCards(absPath);

  return {
    markdownFilePath: absPath,
    title: imagePostTitle,
    imagePostTitle,
    author,
    articleSummary,
    tags,
    description: imagePostDesc,
    imagePostDesc,
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
  console.log(`[parser] 正在解析图文资产: ${targetFile}`);
  const result = parseAllAssets(targetFile);
  console.log(JSON.stringify({
    title: result.title,
    author: result.author,
    tags: result.tags,
    descPreview: result.description.substring(0, 100) + '...',
    cardCount: result.cardCount,
    cardFiles: result.imageCards.map(s => s.name),
    cardPaths: result.cardFilePaths
  }, null, 2));
}
