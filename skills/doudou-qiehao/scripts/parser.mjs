import fs from 'node:fs';
import path from 'node:path';

/**
 * 提取并清洗文章标题（企鹅号图文文章标题限制 5～64 字）
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractArticleTitle(content, fallbackTitle = '未命名技术文章') {
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

  // 企鹅号标题限制 5~64 个字
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
 * 智能提取企鹅号话题标签（最多 9 个，每个标签最多 8 个字）
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
    { tag: '后端开发', matches: ['python', 'java', 'springboot', 'golang', 'docker', 'linux', '服务器'] },
    { tag: '科技杂谈', matches: ['程序员', '开发者', '技术', '自媒体', '生产力'] }
  ];

  const fullText = (title + ' ' + content).toLowerCase();
  const matchedTags = [];

  for (const item of keywordsMap) {
    if (item.matches.some(m => fullText.includes(m))) {
      // 企鹅号标签每个最多 8 个字
      const t = item.tag.substring(0, 8);
      if (!matchedTags.includes(t)) {
        matchedTags.push(t);
      }
    }
    if (matchedTags.length >= 6) break;
  }

  if (matchedTags.length === 0) {
    matchedTags.push('科技', '互联网', '软件开发');
  }

  return matchedTags;
}

/**
 * 智能推断企鹅号文章分类
 * @param {string} content 
 * @param {string} title 
 * @returns {string}
 */
export function inferCategory(content, title = '') {
  const text = (title + ' ' + content).toLowerCase();
  if (text.includes('java') || text.includes('ai') || text.includes('编程') || text.includes('架构') || text.includes('代码') || text.includes('软件') || text.includes('微服务')) {
    return '科技';
  }
  if (text.includes('财经') || text.includes('股票') || text.includes('理财')) {
    return '财经';
  }
  if (text.includes('游戏') || text.includes('电竞')) {
    return '游戏';
  }
  return '科技';
}

/**
 * 解析排版正文 HTML
 * 优先读取同名目录下 `[article_name]_cdn.md` 或结合 `cdn_manifest.json` 转换为企鹅号 ProseMirror 标准语义富文本 HTML
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

  // 2. 将 Markdown 转换为企鹅号 ExEditor 富文本编辑器兼容的标准语义 HTML
  const lines = targetMarkdown.split('\n');
  const htmlBlocks = [];
  let isCodeBlock = false;
  let codeLang = '';
  let codeLines = [];
  let isFirstH1Skipped = false;
  let inList = false;
  let listType = 'ul';

  const closeListIfNeeded = () => {
    if (inList) {
      htmlBlocks.push(`</${listType}>`);
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 代码块处理
    if (trimmed.startsWith('```')) {
      closeListIfNeeded();
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
      closeListIfNeeded();
      continue;
    }

    // 图片解析
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      closeListIfNeeded();
      const alt = imgMatch[1];
      const src = imgMatch[2];
      htmlBlocks.push(`<p><img src="${src}" alt="${alt}" /></p>`);
      continue;
    }

    // 标题解析（首个 H1 自动跳过，因为已被作为文章大标题填写）
    if (trimmed.startsWith('# ')) {
      closeListIfNeeded();
      if (!isFirstH1Skipped) {
        isFirstH1Skipped = true;
        continue;
      }
      const titleText = trimmed.replace(/^#\s+/, '').replace(/[*_`~]/g, '');
      htmlBlocks.push(`<h2>${titleText}</h2>`);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      closeListIfNeeded();
      const titleText = trimmed.replace(/^##\s+/, '').replace(/[*_`~]/g, '');
      htmlBlocks.push(`<h2>${titleText}</h2>`);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeListIfNeeded();
      const titleText = trimmed.replace(/^###\s+/, '').replace(/[*_`~]/g, '');
      htmlBlocks.push(`<h3>${titleText}</h3>`);
      continue;
    }

    // 引用块
    if (trimmed.startsWith('>')) {
      closeListIfNeeded();
      const quoteText = trimmed
        .replace(/^>\s*/, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      htmlBlocks.push(`<blockquote><p>${quoteText}</p></blockquote>`);
      continue;
    }

    // 无序列表
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList || listType !== 'ul') {
        closeListIfNeeded();
        inList = true;
        listType = 'ul';
        htmlBlocks.push('<ul>');
      }
      const itemText = trimmed
        .replace(/^[-*]\s+/, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      htmlBlocks.push(`<li>${itemText}</li>`);
      continue;
    }

    // 有序列表
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeListIfNeeded();
        inList = true;
        listType = 'ol';
        htmlBlocks.push('<ol>');
      }
      const itemText = olMatch[2]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      htmlBlocks.push(`<li>${itemText}</li>`);
      continue;
    }

    // 普通段落
    closeListIfNeeded();
    const pText = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    htmlBlocks.push(`<p>${pText}</p>`);
  }

  closeListIfNeeded();

  return {
    type: 'semantic_html',
    filePath: cdnMdPath,
    htmlContent: htmlBlocks.join('\n')
  };
}

/**
 * 智能获取封面图资产（严格遵循 doudou-markdown-skill 规约）
 * @param {string} markdownFilePath 
 * @returns {{ localPath: string, fileName: string, base64: string, cdnUrl?: string } | null}
 */
export function resolveCoverImage(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const baseName = path.basename(absPath, path.extname(absPath));
  const articleDir = path.join(dir, baseName);

  // 1. 优先读取 cover/images/ 下的本地封面
  const coverImagesDir = path.join(articleDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir)) {
    let manifestMap = {};
    const manifestPath = path.join(articleDir, 'cdn_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (Array.isArray(manifest.assets)) {
          for (const asset of manifest.assets) {
            if (asset.local_path && asset.cdn_url) {
              manifestMap[path.resolve(asset.local_path)] = asset.cdn_url;
              manifestMap[path.basename(asset.local_path)] = asset.cdn_url;
            }
          }
        }
      } catch (e) {}
    }

    const candidates = [
      'cover-main-2.35x1.png',
      'cover-16x9.png',
      'cover.png',
      'cover-square-1x1.png'
    ];
    for (const c of candidates) {
      const p = path.join(coverImagesDir, c);
      if (fs.existsSync(p)) {
        const base64 = fs.readFileSync(p).toString('base64');
        return {
          localPath: p,
          fileName: c,
          base64: base64,
          cdnUrl: manifestMap[path.resolve(p)] || manifestMap[c] || undefined
        };
      }
    }
    // 读取目录下任一图片文件
    const files = fs.readdirSync(coverImagesDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
    if (files.length > 0) {
      const p = path.join(coverImagesDir, files[0]);
      return {
        localPath: p,
        fileName: files[0],
        base64: fs.readFileSync(p).toString('base64'),
        cdnUrl: manifestMap[path.resolve(p)] || manifestMap[files[0]] || undefined
      };
    }
  }

  // 2. 检查 cdn_manifest.json 中的 cover 条目
  const manifestPath = path.join(articleDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(manifest.assets)) {
        const coverAsset = manifest.assets.find(a => a.type === 'cover' || a.local_path?.includes('/cover/'));
        if (coverAsset && coverAsset.local_path && fs.existsSync(coverAsset.local_path)) {
          return {
            localPath: coverAsset.local_path,
            fileName: path.basename(coverAsset.local_path),
            base64: fs.readFileSync(coverAsset.local_path).toString('base64'),
            cdnUrl: coverAsset.cdn_url
          };
        }
      }
    } catch (e) {
      console.warn('[parser] 读取 manifest cover 异常:', e.message);
    }
  }

  // 3. 检查 imgs/ 目录下的 cover 图片
  const imgsDir = path.join(articleDir, 'imgs');
  if (fs.existsSync(imgsDir)) {
    const imgFiles = fs.readdirSync(imgsDir).filter(f => /cover/i.test(f) && /\.(png|jpe?g|webp)$/i.test(f));
    if (imgFiles.length > 0) {
      const p = path.join(imgsDir, imgFiles[0]);
      return {
        localPath: p,
        fileName: imgFiles[0],
        base64: fs.readFileSync(p).toString('base64')
      };
    }
  }

  // 4. 检查 xhs_images/images/ 下的卡片封面
  const xhsDir = path.join(articleDir, 'xhs_images', 'images');
  if (fs.existsSync(xhsDir)) {
    const files = fs.readdirSync(xhsDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
    if (files.length > 0) {
      const p = path.join(xhsDir, files[0]);
      return {
        localPath: p,
        fileName: files[0],
        base64: fs.readFileSync(p).toString('base64')
      };
    }
  }

  return null;
}

/**
 * 一站式解析 Markdown 文章与全链路资产
 * @param {string} markdownFilePath 
 * @returns {object}
 */
export function parseAllAssets(markdownFilePath) {
  const absPath = path.resolve(markdownFilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`找不到指定的 Markdown 文件: ${absPath}`);
  }

  const rawContent = fs.readFileSync(absPath, 'utf-8');
  const title = extractArticleTitle(rawContent, path.basename(absPath, path.extname(absPath)));
  const summary = extractArticleSummary(rawContent);
  const tags = extractTags(rawContent, title);
  const category = inferCategory(rawContent, title);
  const articleHtml = resolveArticleHtml(absPath);
  const cover = resolveCoverImage(absPath);

  return {
    markdownFilePath: absPath,
    articleTitle: title,
    articleSummary: summary,
    category: category,
    tags: tags,
    articleHtml: articleHtml,
    cover: cover
  };
}

// 命令行直接执行测试
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const testFile = process.argv[2] || '/Users/jyx/project/undsky/mds/RuoYi-SpringBoot3/byeidea.md';
  console.log(`\n🔍 正在解析目标 Markdown 文章资产: ${testFile}\n`);
  try {
    const res = parseAllAssets(testFile);
    console.log('📌 文章标题:', res.articleTitle, `(${res.articleTitle.length}字)`);
    console.log('📝 文章摘要:', res.articleSummary);
    console.log('🏷️ 推断分类:', res.category);
    console.log('🔖 话题标签:', res.tags.join(', '));
    console.log('🖼️ 封面图状态:', res.cover ? `已提取: ${res.cover.fileName} (${(res.cover.base64.length / 1024).toFixed(1)} KB base64)` : '无封面图');
    console.log('📄 正文 HTML 长度:', res.articleHtml.htmlContent.length, '字符');
    console.log('\n✅ 资产解析成功！');
  } catch (e) {
    console.error('❌ 解析失败:', e.message);
  }
}
