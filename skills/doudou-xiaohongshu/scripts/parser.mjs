import fs from 'node:fs';
import path from 'node:path';

/**
 * 提取并清洗文章标题（小红书长文标题限制 64 字以内）
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
      return clean.length > 64 ? clean.substring(0, 62) + '...' : clean;
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
      const clean = trimmed.replace(/^[#\s*`~]+/, '').trim();
      return clean.length > 64 ? clean.substring(0, 62) + '...' : clean;
    }
  }
  return fallbackTitle.length > 64 ? fallbackTitle.substring(0, 62) + '...' : fallbackTitle;
}

/**
 * 提取并清洗图文笔记标题（小红书图文标题严格限制 20 字以内）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractImagePostTitle(content, fallbackTitle = '未命名图文') {
  const title = extractArticleTitle(content, fallbackTitle);
  // 清洗特殊标点，保持吸睛精炼
  const cleanTitle = title.replace(/[【】《》「」：]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleanTitle.length > 20 ? cleanTitle.substring(0, 19) + '…' : cleanTitle;
}

/**
 * 提取文章摘要（小红书长文摘要限制 60 字以内）
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
    { tag: '人工智能', matches: ['ai', '人工智能', '大模型', 'llm', 'deepseek', 'gpt', 'openai', 'claude'] },
    { tag: '程序员日常', matches: ['程序员', '开发者', '技术', '编程', '代码', '后端', '前端', '架构'] },
    { tag: '搞钱那些事', matches: ['变现', '商业化', '副业', '盈利', '搞钱', '独立开发'] },
    { tag: '架构设计', matches: ['架构', '架构设计', '微服务', '工程化', '模块化'] },
    { tag: '效率工具', matches: ['ide', 'vscode', 'n8n', 'devtools', 'mcp', '自动化', '工具箱', '效率'] }
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
    matchedTags.push('AI编程', '智能体', '程序员日常');
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
 * 生成符合小红书 TipTap/ProseMirror 规范的 Image 节点 HTML
 * @param {string} src 
 * @param {string} alt 
 * @returns {string}
 */
function formatXhsImageBlock(src, alt = '') {
  const imgData = [{ src, desc: alt || '', width: 600, height: 400 }];
  const dataImgsAttr = JSON.stringify(imgData).replace(/"/g, '&quot;');
  return `<div data-dom-type="image" data-imgs="${dataImgsAttr}" contenteditable="false"><div data-dom-type="img-wrapper" class="img-wrapper" style="width: 100%; height: 400px; display: flex; justify-content: center;"><img data-dom-type="img" class="image" src="${src}" style="width: 600px; min-height: 400px;">${alt ? `<span data-dom-type="desc" class="desc">${alt}</span>` : ''}</div></div>`;
}

/**
 * 解析小红书排版正文 HTML（适配 TipTap / ProseMirror 编辑器图片规范）
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
          for (const asset of manifest.assets) {
            if (asset.cdn_url && asset.local_path) {
              const relName = path.basename(asset.local_path);
              targetMarkdown = targetMarkdown.replaceAll(asset.local_path, asset.cdn_url);
              targetMarkdown = targetMarkdown.replaceAll(relName, asset.cdn_url);
            }
          }
        }
      } catch (e) {}
    }
  }

  // 转为 TipTap 支持的语义化 HTML 标签及专属 image 节点
  const lines = targetMarkdown.split('\n');
  const htmlBlocks = [];
  let isCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('```')) {
      isCode = !isCode;
      continue;
    }
    if (isCode || !line || line.startsWith('---') || line.startsWith('<!--')) continue;

    // 插图解析：Markdown 图片语法 ![alt](src)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      htmlBlocks.push(formatXhsImageBlock(src, alt));
      continue;
    }

    // 插图解析：HTML img 标签
    const htmlImgMatch = line.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']?([^"'>]*)["']?[^>]*>/i);
    if (htmlImgMatch) {
      const src = htmlImgMatch[1];
      const alt = htmlImgMatch[2] || '';
      htmlBlocks.push(formatXhsImageBlock(src, alt));
      continue;
    }

    if (line.startsWith('# ')) {
      // 首行 H1 已作为标题输入，正文内若有 H1 降为 H2
      htmlBlocks.push(`<h2>${line.replace(/^#\s+/, '')}</h2>`);
    } else if (line.startsWith('## ')) {
      htmlBlocks.push(`<h2>${line.replace(/^##\s+/, '')}</h2>`);
    } else if (line.startsWith('### ')) {
      htmlBlocks.push(`<h3>${line.replace(/^###\s+/, '')}</h3>`);
    } else if (line.startsWith('>')) {
      htmlBlocks.push(`<blockquote><p>${line.replace(/^>\s*/, '')}</p></blockquote>`);
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      const boldFormatted = line.replace(/^[-•]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlBlocks.push(`<p>• ${boldFormatted}</p>`);
    } else if (/^\d+\.\s+/.test(line)) {
      const boldFormatted = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlBlocks.push(`<p>${boldFormatted}</p>`);
    } else {
      const boldFormatted = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlBlocks.push(`<p>${boldFormatted}</p>`);
    }
  }

  return {
    type: 'markdown_cdn_html',
    filePath: absPath,
    htmlContent: htmlBlocks.join('')
  };
}

/**
 * 解析小红书图文卡片集（严格遵循 doudou-markdown-skill 小红书图文卡片规约）
 * 优先读取 xhs_images/images/ (或 xhs_images/) 3:4 卡片集，排除 _yuantu.png
 * @param {string} markdownFilePath 
 * @returns {Array<{ name: string, localPath: string, base64: string, mimeType: string }>}
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
export function parseAllAssets(markdownFilePath, author = 'undsky') {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const articleTitle = extractArticleTitle(rawContent);
  const imagePostTitle = extractImagePostTitle(rawContent);
  const articleSummary = extractArticleSummary(rawContent);
  const tags = extractTags(rawContent, articleTitle);
  const imagePostDesc = extractImagePostDescription(rawContent, imagePostTitle, tags);
  const articleHtml = resolveArticleHtml(absPath);
  const imageCards = resolveImagePostCards(absPath);

  return {
    markdownFilePath: absPath,
    articleTitle,
    imagePostTitle,
    author,
    articleSummary,
    tags,
    imagePostDesc,
    articleHtml,
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
  console.log(`[parser] 正在解析: ${targetFile}`);
  const result = parseAllAssets(targetFile);
  console.log(JSON.stringify({
    articleTitle: result.articleTitle,
    imagePostTitle: result.imagePostTitle,
    author: result.author,
    articleSummary: result.articleSummary,
    tags: result.tags,
    imagePostDesc: result.imagePostDesc,
    articleHtmlType: result.articleHtml.type,
    articleHtmlLength: result.articleHtml.htmlContent.length,
    hasImageTagsInHtml: result.articleHtml.htmlContent.includes('data-dom-type="image"'),
    cardCount: result.cardCount,
    cardFiles: result.imageCards.map(s => s.name),
    cardPaths: result.cardFilePaths
  }, null, 2));
}
