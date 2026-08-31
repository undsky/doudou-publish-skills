import fs from 'node:fs';
import path from 'node:path';

/**
 * 提取并清洗文章标题（头条号文章标题限制 2～30 字）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractArticleTitle(content, fallbackTitle = '未命名文章') {
  const lines = content.split('\n');
  let rawTitle = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      rawTitle = trimmed.replace(/^#\s+/, '');
      break;
    }
  }

  if (!rawTitle) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('---') && !trimmed.startsWith('<!--')) {
        rawTitle = trimmed.replace(/^[#\s*`~]+/, '');
        break;
      }
    }
  }

  if (!rawTitle) {
    rawTitle = fallbackTitle;
  }

  // 清洗 Markdown 格式符号
  let cleanTitle = rawTitle
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^[#\s]+/, '')
    .trim();

  // 头条号标题限制 2~30 个字
  if (cleanTitle.length > 30) {
    cleanTitle = cleanTitle.substring(0, 30);
  } else if (cleanTitle.length < 2) {
    cleanTitle = cleanTitle.padEnd(2, '！');
  }

  return cleanTitle;
}

/**
 * 提取文章纯文本摘要（100 字以内）
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
    if (textBlocks.join(' ').length >= 80) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (!summary) {
    summary = '深度解析核心技术与工程落地实践，探索高质量智能体与自媒体自动化交付流程。';
  }
  if (summary.length > 100) {
    summary = summary.substring(0, 98) + '...';
  }
  return summary;
}

/**
 * 智能提取话题标签（最多 5 个）
 * @param {string} content 
 * @param {string} title 
 * @returns {string[]}
 */
export function extractTags(content, title = '') {
  const keywordsMap = [
    { tag: 'AI编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'opencode', '编程'] },
    { tag: '智能体', matches: ['agent', '智能体', '多智能体', 'multi-agent', 'agents'] },
    { tag: '人工智能', matches: ['ai', '人工智能', '大模型', 'llm', 'deepseek', 'gpt', 'openai', 'claude'] },
    { tag: '架构设计', matches: ['架构', '架构设计', '微服务', '工业化', '封装', '系统设计'] },
    { tag: '开发工具', matches: ['ide', 'vscode', 'n8n', 'devtools', 'mcp', '自动化', 'workflow'] },
    { tag: '前端开发', matches: ['javascript', 'typescript', 'vue', 'react', 'css', 'html', 'node'] },
    { tag: '后端开发', matches: ['python', 'java', 'golang', 'docker', 'linux', '服务器'] },
    { tag: '科技杂谈', matches: ['程序员', '开发者', '技术', '自媒体', '生产力'] }
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
    matchedTags.push('AI编程', '智能体', '架构设计');
  }

  return matchedTags;
}

/**
 * 解析排版正文 HTML
 * 优先读取同名目录下 `[article_name]_cdn.md` 或结合 `cdn_manifest.json` 转换为支持 ByteDance Sylph / ProseMirror 的语义富文本 HTML
 * @param {string} markdownFilePath 
 * @returns {{ type: string, filePath: string, htmlContent: string }}
 */
export function resolveArticleHtml(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 获取带有 CDN 链接的 Markdown 文本
  let targetMarkdown = '';
  const cdnMdPath = path.join(articleDir, `${baseName}_cdn.md`);
  if (fs.existsSync(cdnMdPath)) {
    targetMarkdown = fs.readFileSync(cdnMdPath, 'utf-8');
  } else {
    targetMarkdown = fs.readFileSync(absPath, 'utf-8');
    // 如果存在 cdn_manifest.json，自动将本地插图路径替换为公开 CDN URL
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
      } catch (e) {
        console.warn('[parser] 读取 cdn_manifest.json 异常:', e.message);
      }
    }
  }

  // 2. 将 Markdown 转换为头条 ProseMirror 完美兼容的标准语义 HTML
  const lines = targetMarkdown.split('\n');
  const htmlBlocks = [];
  let isCodeBlock = false;
  let codeLang = '';
  let codeLines = [];
  let isFirstH1Skipped = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 代码块处理
    if (trimmed.startsWith('```')) {
      if (!isCodeBlock) {
        isCodeBlock = true;
        codeLang = trimmed.replace(/^```/, '').trim();
        codeLines = [];
      } else {
        isCodeBlock = false;
        const codeContent = codeLines.join('\n')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        htmlBlocks.push(`<pre><code class="language-${codeLang}">${codeContent}</code></pre>`);
      }
      continue;
    }

    if (isCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('<!--')) {
      continue;
    }

    // 图片解析
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      htmlBlocks.push(`<p><img src="${src}" alt="${alt}" /></p>`);
      continue;
    }

    // 标题解析（首个 H1 自动跳过，因为已被作为文章大标题填写）
    if (trimmed.startsWith('# ')) {
      if (!isFirstH1Skipped) {
        isFirstH1Skipped = true;
        continue;
      }
      const titleText = trimmed.replace(/^#\s+/, '').replace(/[*_`~]/g, '');
      htmlBlocks.push(`<h2>${titleText}</h2>`);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      const titleText = trimmed.replace(/^##\s+/, '').replace(/[*_`~]/g, '');
      htmlBlocks.push(`<h2>${titleText}</h2>`);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      const titleText = trimmed.replace(/^###\s+/, '').replace(/[*_`~]/g, '');
      htmlBlocks.push(`<h3>${titleText}</h3>`);
      continue;
    }

    // 引用块
    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s*/, '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlBlocks.push(`<blockquote><p>${quoteText}</p></blockquote>`);
      continue;
    }

    // 无序列表
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.replace(/^[-•*]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlBlocks.push(`<p>• ${itemText}</p>`);
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlBlocks.push(`<p>${itemText}</p>`);
      continue;
    }

    // 普通段落
    const boldFormatted = trimmed
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    htmlBlocks.push(`<p>${boldFormatted}</p>`);
  }

  return {
    type: 'markdown_semantic_html',
    filePath: absPath,
    htmlContent: htmlBlocks.join('\n')
  };
}

/**
 * 解析封面图资产（遵循 doudou-markdown-skill 规约）
 * 优先级：
 * 1. 同名目录 xhs_images/images/ 下第一张封面卡（01-cover.png）
 * 2. cdn_manifest.json 中类型为 cover 的条目
 * 3. 同名目录 cover/images/ 下的本地封面（cover-main-2.35x1.png / 16x9 / 1x1）
 * 4. 正文首图
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string }}
 */
export function resolveCoverImage(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 优先提取 xhs_images/images/ 下的第一张封面卡片（如 01-cover.png）
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
        localPath,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: coverCard
      };
    }
  }

  // 2. 备选：读取 cdn_manifest.json 中的封面条目
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(manifest.assets)) {
        const coverItem = manifest.assets.find(f => f.type === 'cover' || f.slug?.includes('cover'));
        if (coverItem) {
          const localPath = coverItem.local_path ? path.resolve(articleDir, coverItem.local_path) : null;
          let base64 = null;
          let mimeType = 'image/png';
          if (localPath && fs.existsSync(localPath)) {
            const buf = fs.readFileSync(localPath);
            mimeType = localPath.endsWith('.jpg') || localPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
            base64 = `data:${mimeType};base64,${buf.toString('base64')}`;
          }
          return {
            hasCover: true,
            url: coverItem.cdn_url,
            localPath,
            base64,
            mimeType,
            fileName: coverItem.slug ? `${coverItem.slug}.png` : 'cover.png'
          };
        }
      }
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 失败:', e.message);
    }
  }

  // 3. 备选：读取 cover/images/ 下的本地封面
  const coverImagesDir = path.join(articleDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir)) {
    const allFiles = fs.readdirSync(coverImagesDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp'));
    const candidates = [
      allFiles.find(f => f.includes('2.35x1') && !f.includes('_yuantu')),
      allFiles.find(f => f.includes('16x9') && !f.includes('_yuantu')),
      allFiles.find(f => f.includes('square-1x1') && !f.includes('_yuantu')),
      allFiles.find(f => !f.includes('_yuantu')),
      allFiles[0]
    ].filter(Boolean);

    if (candidates.length > 0) {
      const selected = candidates[0];
      const localPath = path.join(coverImagesDir, selected);
      const buf = fs.readFileSync(localPath);
      const mimeType = selected.endsWith('.jpg') || selected.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      return {
        hasCover: true,
        localPath,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: selected
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
  const articleSummary = extractArticleSummary(rawContent);
  const tags = extractTags(rawContent, articleTitle);
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath, rawContent);

  return {
    markdownFilePath: absPath,
    articleTitle,
    author,
    articleSummary,
    tags,
    articleHtml,
    cover
  };
}

// 命令行直接测试
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
    titleLength: result.articleTitle.length,
    author: result.author,
    articleSummary: result.articleSummary,
    tags: result.tags,
    articleHtmlType: result.articleHtml.type,
    articleHtmlLength: result.articleHtml.htmlContent.length,
    hasCover: result.cover.hasCover,
    coverFile: result.cover.fileName,
    coverLocalPath: result.cover.localPath
  }, null, 2));
}
