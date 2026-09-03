import fs from 'node:fs';
import path from 'node:path';
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
  return summary || '本文分享了深度技术实践与架构解析，欢迎阅读与交流。';
}

/**
 * 提取技术标签（不再做关键词规则映射）
 * @param {string} content
 * @param {string} title
 * @returns {string[]}
 */
export function extractTags(_content, _title = '') {
  return [];
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
 * 解析封面图资产（遵循 doudou-markdown-skill:L94-L101 与 L213 规约）
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
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const items = Array.isArray(manifest.assets) ? manifest.assets : (Array.isArray(manifest.files) ? manifest.files : []);
      if (items.length > 0) {
        // 查找 2.35:1 或 16:9 封面，优先 thumb 缩略图
        const coverItem = items.find(f => f.type === 'cover' && (f.slug?.includes('2.35x1_thumb') || f.name?.includes('2.35x1_thumb') || f.slug?.includes('main_thumb') || f.name?.includes('main_thumb'))) ||
                          items.find(f => f.type === 'cover' && (f.aspect_ratio === '2.35:1' || f.slug?.includes('2.35x1') || f.name?.includes('2.35x1') || f.slug?.includes('main') || f.name?.includes('main'))) ||
                          items.find(f => f.type === 'cover' && (f.slug?.includes('16x9_thumb') || f.name?.includes('16x9_thumb'))) ||
                          items.find(f => f.type === 'cover' && (f.aspect_ratio === '16:9' || f.slug?.includes('16x9') || f.name?.includes('16x9'))) ||
                          items.find(f => f.type === 'cover');
        if (coverItem && coverItem.cdn_url) {
          let localPath = null;
          if (coverItem.local_path) {
            const pathInArticle = path.resolve(articleDir, coverItem.local_path);
            const pathInDir = path.resolve(dir, coverItem.local_path);
            localPath = fs.existsSync(pathInArticle) ? pathInArticle : (fs.existsSync(pathInDir) ? pathInDir : pathInArticle);
          }
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
            fileName: coverItem.slug ? `${coverItem.slug}.png` : (coverItem.name || 'cover-2.35x1.png')
          };
        }
      }
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
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('parser.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node parser.mjs <Markdown文件路径>');
    process.exit(1);
  }
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
