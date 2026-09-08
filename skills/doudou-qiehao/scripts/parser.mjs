import fs from 'node:fs';
import path from 'node:path';
import { resolveCoverFromManifest, inferTags } from './asset_resolver.mjs';
import { Marked } from './marked.esm.js';

/**
 * 提取并清洗文章标题（企鹅号图文文章标题限制 5～30 字）
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

  // 企鹅号标题限制 5~64 个字（若超过 64 字则智能截断）
  if (cleanTitle.length > 64) {
    cleanTitle = cleanTitle.substring(0, 64);
  } else if (cleanTitle.length < 5) {
    cleanTitle = cleanTitle.padEnd(5, '！');
  }

  return cleanTitle;
}

/**
 * 提取文章纯文本摘要（100 字以内）
 * @param {string} content 
 * @returns {string}
 */
export function extractArticleSummary(content, fallbackTitle = '') {
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
    // 无可提取正文时，从文章自身派生摘要（标题 + 首个有效文本行），不注入与内容无关的固定文案
    const firstMeaningful = content.split('\n')
      .map(l => l.trim().replace(/^[#>*\-\d.\s]+/, '').replace(/[*_`~]/g, '').trim())
      .find(l => l.length > 0 && !l.startsWith('!['));
    const parts = [fallbackTitle, firstMeaningful].filter(Boolean);
    summary = [...new Set(parts)].join(' ').trim();
  }
  if (summary.length > 100) {
    summary = summary.substring(0, 98) + '...';
  }
  return summary;
}

/**
 * 将 Markdown 转换为企鹅号 ExEditor 兼容的高质量语义 HTML（基于 marked）
 * @param {string} markdown 
 * @returns {string}
 */
export function markdownToSemanticHtml(markdown) {
  let isFirstH1Skipped = false;

  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      if (depth === 1 && !isFirstH1Skipped) {
        isFirstH1Skipped = true;
        return '';
      }
      const tag = depth === 1 ? 'h2' : `h${depth}`;
      return `<${tag}>${text}</${tag}>\n`;
    },

    table({ header, rows }) {
      let headerHtml = '';
      if (header && header.length > 0) {
        headerHtml = '<tr style="background: #f7f8fa;">\n' +
          header.map(cell => {
            const align = cell.align ? `text-align: ${cell.align};` : 'text-align: left;';
            return `  <th style="border: 1px solid #e2e4e8; padding: 8px 12px; ${align} font-weight: 600;">${this.parser.parseInline(cell.tokens)}</th>\n`;
          }).join('') +
          '</tr>\n';
      }

      let bodyHtml = '';
      if (rows && rows.length > 0) {
        bodyHtml = rows.map((row, rIdx) => {
          const bg = rIdx % 2 === 1 ? 'background: #fafbfc;' : 'background: #ffffff;';
          const cellsHtml = row.map(cell => {
            const align = cell.align ? `text-align: ${cell.align};` : 'text-align: left;';
            return `  <td style="border: 1px solid #e2e4e8; padding: 8px 12px; ${align}">${this.parser.parseInline(cell.tokens)}</td>\n`;
          }).join('');
          return `<tr style="${bg}">\n${cellsHtml}</tr>\n`;
        }).join('');
      }

      return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; border: 1px solid #e2e4e8;">\n<thead>\n${headerHtml}</thead>\n<tbody>\n${bodyHtml}</tbody>\n</table>\n`;
    },

    codespan({ text }) {
      return `<code style="background-color: #f2f3f5; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${text}</code>`;
    },

    code({ text, lang }) {
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/ /g, '&nbsp;')
        .replace(/\n/g, '<br>');
      return `<blockquote style="background: #f6f8fa; border-left: 4px solid #0077ff; padding: 12px 16px; margin: 14px 0; font-family: Consolas, 'Courier New', monospace; font-size: 13px; line-height: 1.6;"><p style="font-family: Consolas, 'Courier New', monospace; margin: 0; color: #24292e;">${escaped}</p></blockquote>\n`;
    },

    image({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<p style="text-align: center;"><img src="${href}" alt="${text}"${titleAttr} style="max-width: 100%; border-radius: 6px;" /></p>\n`;
    },

    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}" target="_blank"${titleAttr}>${text}</a>`;
    },

    hr() {
      return '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />\n';
    }
  };

  const markedInstance = new Marked({
    renderer,
    gfm: true,
    breaks: true
  });

  return markedInstance.parse(markdown);
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
 * 解析排版正文 HTML
 * 优先读取同名目录下 `[article_name]_cdn.md` 或结合 `cdn_manifest.json` 转换为企鹅号标准语义富文本 HTML
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
          targetMarkdown = replaceLocalAssetsWithCdn(targetMarkdown, manifest.assets);
        }
      } catch (e) {
        console.warn('[parser] 读取 cdn_manifest.json 异常:', e.message);
      }
    }
  }

  // 2. 将 Markdown 转换为企鹅号 ExEditor 兼容的标准语义 HTML
  const htmlContent = markdownToSemanticHtml(targetMarkdown);

  return {
    type: 'semantic_html',
    filePath: cdnMdPath,
    htmlContent
  };
}

/**
 * 智能获取封面图资产
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

  // 1. 优先读取 cover/images/ 下的本地封面
  const coverImagesDir = path.join(articleDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir)) {
    const allFiles = fs.readdirSync(coverImagesDir).filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp')));
    const candidates = [
      allFiles.find(f => f.includes('2.35x1') || f.includes('2.35:1') || f.includes('cover-main')),
      allFiles.find(f => f.includes('16x9') || f.includes('16:9')),
      allFiles.find(f => f.includes('square-1x1') || f.includes('1x1')),
      allFiles.find(f => f.includes('cover')),
      allFiles[0]
    ].filter(Boolean);

    if (candidates.length > 0) {
      const selected = candidates[0];
      const localPath = path.join(coverImagesDir, selected);
      const buf = fs.readFileSync(localPath);
      const mimeType = selected.endsWith('.jpg') || selected.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      return {
        hasCover: true,
        type: 'local',
        localPath,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: selected
      };
    }
  }

  // 2. 备选：读取 cdn_manifest.json 中的封面条目（type 为 cover）
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      // 统一走 asset_resolver：兼容 assets[] / files[] 两种结构，并以 cover/ 路径信号
      // 识别封面（真实清单无 type/slug/aspect_ratio 字段，旧逻辑在此静默跳过）。
      // 企鹅号封面上传门槛是 `if (meta.coverBase64)`，故必须 preferBase64。
      const fromManifest = resolveCoverFromManifest(articleDir, { preferBase64: false });
      if (fromManifest) return fromManifest;
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 失败:', e.message);
    }
  }

  // 3. 备选：读取 xhs_images/images/ 下的第一张封面卡片（如 01-cover.png）
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
        type: 'local',
        localPath,
        base64: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
        fileName: coverCard
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
 * 提取正文中所有图片资产并转为本地 Base64 / 文件信息
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {Array<{ alt: string, src: string, localPath?: string, base64?: string, fileName?: string }>}
 */
export function extractArticleImages(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images = [];
  let match;

  // 读取 cdn_manifest.json (如果有)
  let manifestAssets = [];
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(manifest.assets)) manifestAssets = manifest.assets;
    } catch(e) {}
  }

  // 收集同名目录下所有可用图片
  const localImageFiles = [];
  const collectFiles = (sub) => {
    const subDir = path.join(articleDir, sub);
    if (fs.existsSync(subDir)) {
      const fsList = fs.readdirSync(subDir).filter(f => !f.includes('_yuantu') && /\.(png|jpe?g|webp|gif)$/i.test(f));
      for (const f of fsList) localImageFiles.push(path.join(subDir, f));
    }
  };
  collectFiles('illustrations/images');
  collectFiles('illustrations');
  collectFiles('cover/images');
  collectFiles('cover');
  collectFiles('imgs');
  collectFiles('xhs_images/images');
  collectFiles('');

  let imgIndex = 0;
  while ((match = imgRegex.exec(content)) !== null) {
    const alt = match[1];
    const src = match[2];
    let localPath = null;
    let fileName = path.basename(src.split('?')[0]) || `img_${imgIndex + 1}.png`;
    if (!fileName.includes('.')) fileName += '.png';

    // 1. 从 manifest 查找
    const manifestItem = manifestAssets.find(a => a.cdn_url === src || a.local_path === src || path.basename(a.local_path || '') === fileName);
    if (manifestItem && manifestItem.local_path) {
      const cand = path.resolve(articleDir, manifestItem.local_path);
      if (fs.existsSync(cand)) localPath = cand;
    }

    // 2. 本地文件直接匹配
    if (!localPath && fs.existsSync(src)) {
      localPath = path.resolve(src);
    }

    // 3. 从收集的本地列表中按文件名匹配
    if (!localPath) {
      const matched = localImageFiles.find(f => path.basename(f) === fileName);
      if (matched) localPath = matched;
    }

    // 4. 按顺序回退匹配
    if (!localPath && localImageFiles[imgIndex]) {
      localPath = localImageFiles[imgIndex];
    }

    let base64 = null;
    let mimeType = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    if (localPath && fs.existsSync(localPath)) {
      const buf = fs.readFileSync(localPath);
      mimeType = localPath.endsWith('.jpg') || localPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      base64 = `data:${mimeType};base64,${buf.toString('base64')}`;
      fileName = path.basename(localPath);
    }

    images.push({
      alt,
      src,
      localPath,
      base64,
      fileName,
      mimeType
    });
    imgIndex++;
  }

  return images;
}

/**
 * 全面解析 Markdown 文件及其关联资产
 * @param {string} markdownFilePath 
 * @param {string} author 
 * @returns {object}
 */
/**
 * 依据标题与正文推断企鹅号文章分类（对应平台分类下拉的可选项）
 * @param {string} content
 * @param {string} title
 * @returns {string}
 */
export function inferCategory(content, title = '') {
  const fullText = (title + ' ' + content).toLowerCase();

  const rules = [
    { category: '科技', keywords: ['ai', 'agent', '智能体', '大模型', 'llm', 'gpt', 'prompt', 'aigc', '编程', '代码', '开发', '架构', '微服务', 'java', 'python', 'docker', 'k8s', 'n8n', 'mcp', '自动化', '数据库', '前端', '后端', '算法', '技术'] },
    { category: '财经', keywords: ['财经', '股票', '基金', '投资', '理财', '经济', '金融', '营收', '融资', '上市'] },
    { category: '游戏', keywords: ['游戏', '手游', '端游', '电竞', 'steam', '主机', '玩家'] },
    { category: '汽车', keywords: ['汽车', '新能源车', '电动车', '车型', '试驾', '燃油车'] },
    { category: '教育', keywords: ['教育', '考试', '学习方法', '课程', '考研', '高考', '教学'] },
    { category: '职场', keywords: ['职场', '面试', '简历', '求职', '晋升', '年终总结', '副业'] }
  ];

  for (const item of rules) {
    if (item.keywords.some(k => fullText.includes(k))) {
      return item.category;
    }
  }

  return '科技';
}

export function parseAllAssets(markdownFilePath, author = 'undsky') {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const articleTitle = extractArticleTitle(rawContent);
  const articleSummary = extractArticleSummary(rawContent, articleTitle);
  // 由 asset_resolver.inferTags 从标题与正文推断（上限 5）。
  // 旧实现固定为空数组，导致下游标签/话题分支被 length > 0 判空整段跳过。
  const tags = inferTags(rawContent, articleTitle, 5);
  const category = inferCategory(rawContent, articleTitle);
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath, rawContent);
  const articleImages = [];

  return {
    markdownFilePath: absPath,
    articleTitle,
    author,
    articleSummary,
    category,
    tags,
    articleHtml,
    cover,
    articleImages
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
