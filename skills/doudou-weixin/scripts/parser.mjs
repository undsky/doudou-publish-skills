import fs from 'node:fs';
import path from 'node:path';

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
  return summary || '本文分享了深度技术实践与架构解析，欢迎阅读与交流。';
}

/**
 * 智能提取技术标签
 * @param {string} content 
 * @param {string} title 
 * @returns {string[]}
 */
export function extractTags(content, title = '') {
  const keywordsMap = [
    { tag: 'AI编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'opencode'] },
    { tag: '智能体', matches: ['agent', '智能体', '多智能体', 'multi-agent'] },
    { tag: '人工智能', matches: ['ai', '人工智能', '大模型', 'llm', 'deepseek', 'gpt', 'openai'] },
    { tag: 'Docker', matches: ['docker', '容器', 'docker-compose', 'alpine'] },
    { tag: '架构设计', matches: ['架构', '架构设计', '微服务', '工业化', '封装'] },
    { tag: '开发工具', matches: ['ide', 'vscode', 'n8n', 'devtools', 'mcp', '自动化', 'workflow'] },
    { tag: '全栈开发', matches: ['node', 'python', 'javascript', 'vue', 'react', '后端', '前端'] }
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
 * 提炼贴图/小绿书专属描述正文（要点提取 + 话题标签，1000 字以内）
 * @param {string} content 
 * @param {string} title 
 * @param {string[]} tags 
 * @returns {string}
 */
export function extractStickerDescription(content, title = '', tags = []) {
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

  const tagString = tags.map(t => `#${t}`).join(' ');
  const summary = extractSummary(content);

  let desc = `${summary}\n\n📌 核心要点梳理：\n`;
  if (points.length > 0) {
    desc += points.map((p, idx) => `${idx + 1}. ${p}`).join('\n') + '\n\n';
  } else {
    desc += `1. 工业级标准化封装实践\n2. 明确交付契约与微服务编排\n3. 代码自动化守门与高质量输出\n\n`;
  }
  desc += `${tagString}`;

  return desc;
}

/**
 * 解析排版后的正文 HTML（遵循 doudou-markdown-skill 与 gzh-design 规范）
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

  // 2. 降级读取 Markdown 并包装基础 HTML
  const rawMarkdown = fs.readFileSync(absPath, 'utf-8');
  const paragraphs = rawMarkdown
    .split('\n\n')
    .filter(p => p.trim().length > 0 && !p.trim().startsWith('#') && !p.trim().startsWith('```'))
    .map(p => `<p style="margin: 10px 0; font-size: 16px; line-height: 1.8; color: #333;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  const fallbackHtml = `<section style="max-width: 677px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #374151; line-height: 1.75;">${paragraphs}</section>`;

  return {
    type: 'markdown',
    filePath: absPath,
    htmlContent: fallbackHtml
  };
}

/**
 * 解析封面图资产（遵循 doudou-markdown-skill 规约）
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string }}
 */
export function resolveCoverImage(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 读取 cdn_manifest.json 中的宽屏主封面
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(manifest.files)) {
        const coverItem = manifest.files.find(f => f.type === 'cover' && (f.name?.includes('2.35x1') || f.name?.includes('16x9') || f.name?.includes('main')));
        if (coverItem && coverItem.cdn_url) {
          const localPath = coverItem.local_path ? path.resolve(dir, coverItem.local_path) : null;
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
            fileName: coverItem.name || 'cover.png'
          };
        }
      }
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 失败:', e.message);
    }
  }

  // 2. 读取 cover/images/ 下的本地封面
  const coverImagesDir = path.join(articleDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir)) {
    const files = fs.readdirSync(coverImagesDir).filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')));
    const mainCover = files.find(f => f.includes('2.35x1') || f.includes('16x9') || f.includes('main')) || files[0];
    if (mainCover) {
      const localPath = path.join(coverImagesDir, mainCover);
      const buf = fs.readFileSync(localPath);
      const mimeType = mainCover.endsWith('.jpg') || mainCover.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      return {
        hasCover: true,
        localPath,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: mainCover
      };
    }
  }

  return { hasCover: false };
}

/**
 * 解析贴图卡片图片集（遵循 doudou-markdown-skill 小红书/微信图文卡片规约）
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
    path.join(articleDir, 'guizang_cards')
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
export function parseAllAssets(markdownFilePath, author = '豆豆') {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const title = extractTitle(rawContent);
  const summary = extractSummary(rawContent);
  const tags = extractTags(rawContent, title);
  const stickerDesc = extractStickerDescription(rawContent, title, tags);
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath, rawContent);
  const stickerImages = resolveStickerImages(absPath);

  return {
    markdownFilePath: absPath,
    title,
    author,
    summary,
    tags,
    stickerDesc,
    articleHtml,
    cover,
    stickerImages,
    stickerCount: stickerImages.length
  };
}

// 命令行直接运行测试支持
if (process.argv[1] && process.argv[1].endsWith('parser.mjs')) {
  const targetFile = process.argv[2] || '/Users/jyx/project/undsky/mds/AICoding/ddagent.md';
  console.log(`[parser] 正在解析: ${targetFile}`);
  const result = parseAllAssets(targetFile);
  console.log(JSON.stringify({
    title: result.title,
    author: result.author,
    summary: result.summary,
    tags: result.tags,
    articleHtmlType: result.articleHtml.type,
    articleHtmlLength: result.articleHtml.htmlContent.length,
    hasCover: result.cover.hasCover,
    coverFile: result.cover.fileName,
    stickerCount: result.stickerCount,
    stickerFiles: result.stickerImages.map(s => s.name)
  }, null, 2));
}
