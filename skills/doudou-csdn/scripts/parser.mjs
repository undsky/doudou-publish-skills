import fs from 'node:fs';
import path from 'node:path';

/**
 * 提取 Markdown 标题
 * @param {string} content 
 * @param {string} fallbackTitle 
 * @returns {string}
 */
export function extractTitle(content, fallbackTitle = '未命名文章') {
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
 * 从正文中提炼 80~200 字纯文本摘要（CSDN 限制 256 字以内）
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

    // 移除 markdown 链接、加粗与引用等符号
    const cleanText = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/>\s*/g, '')
      .trim();

    if (cleanText.length > 10) {
      textBlocks.push(cleanText);
    }
    if (textBlocks.join(' ').length >= 120) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (summary.length > 220) {
    summary = summary.substring(0, 215) + '...';
  }
  return summary || '本文深入剖析了核心架构设计与工程化实战，欢迎阅读与交流。';
}


/**
 * 解析 Markdown 文件的 YAML FrontMatter
 * @param {string} content 
 * @returns {Record<string, any>|null}
 */
export function extractFrontmatter(content) {
  if (!content || !content.startsWith('---')) return null;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fmBlock = match[1];
  const data = {};
  
  const lines = fmBlock.split('\n');
  let currentKey = null;
  let currentArray = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('- ') && currentKey) {
      if (!currentArray) {
        currentArray = [];
        data[currentKey] = currentArray;
      }
      currentArray.push(line.replace(/^- \s*/, '').replace(/^['"]|['"]$/g, '').trim());
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      currentKey = line.slice(0, colonIdx).trim();
      currentArray = null;
      let val = line.slice(colonIdx + 1).trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        data[currentKey] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else if (val) {
        data[currentKey] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return data;
}

/**
 * 动态获取并智能推断 1~4 个 CSDN 技术标签
 * 遵循多级动态决策：
 * 1. 显式指定参数 / 环境变量 (options.tags / process.env.CSDN_TAGS)
 * 2. 文章 FrontMatter (tags / keywords / topics / categories)
 * 3. 同名目录元数据文件 (outline.md / analysis.md)
 * 4. 标题、结构大纲与实体词多维加权智能匹配
 * @param {string} content 
 * @param {string} title 
 * @param {string} filePath 
 * @param {object} options
 * @returns {string[]}
 */
export function extractTags(content, title = '', filePath = '', options = {}) {
  // 1. 显式指定的优先级最高（支持数组、逗号/空格分隔字符串、环境变量）
  const explicitTags = options.tags || (typeof process !== 'undefined' && process.env && process.env.CSDN_TAGS);
  if (explicitTags) {
    const list = Array.isArray(explicitTags)
      ? explicitTags
      : String(explicitTags).split(/[,，、|# ]+/).map(s => s.trim()).filter(Boolean);
    if (list.length > 0) {
      return [...new Set(list)].slice(0, 4);
    }
  }

  // 2. 从 FrontMatter 动态提取
  const fm = extractFrontmatter(content);
  if (fm) {
    const fmTags = fm.tags || fm.keywords || fm.topics || fm.categories || fm.category;
    if (fmTags) {
      const list = Array.isArray(fmTags)
        ? fmTags
        : String(fmTags).split(/[,，、|# ]+/).map(s => s.trim()).filter(Boolean);
      if (list.length > 0) {
        return [...new Set(list)].slice(0, 4);
      }
    }
  }

  // 3. 从同名资产目录元数据文件动态推断 (如 outline.md, analysis.md)
  if (filePath) {
    try {
      const absPath = path.resolve(filePath);
      const dir = path.dirname(absPath);
      const stem = path.basename(absPath, path.extname(absPath));
      const metaFiles = [
        path.join(dir, stem, 'analysis.md'),
        path.join(dir, stem, 'outline.md'),
        path.join(dir, stem, 'xhs_images', 'analysis.md')
      ];
      for (const mf of metaFiles) {
        if (fs.existsSync(mf)) {
          const txt = fs.readFileSync(mf, 'utf8');
          const match = txt.match(/(?:标签|技术标签|关键词|Tags|Topics)[:：]\s*([^\n\r]+)/i);
          if (match && match[1]) {
            const list = match[1].split(/[,，、|# ]+/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
            if (list.length > 0) {
              return [...new Set(list)].slice(0, 4);
            }
          }
        }
      }
    } catch (e) {}
  }

  // 4. 基于文档结构与实体词加权动态智能匹配
  const cleanContent = (content || '').replace(/!\[.*?\]\([^\)]+\)/g, '').replace(/https?:\/\/[^\s\)]+/g, '');
  
  // 提取 Markdown 结构化高权重实体
  const headings = [];
  const boldTerms = [];
  const inlineCodes = [];

  const lines = cleanContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      headings.push(trimmed.replace(/^#+\s+/, '').trim());
    }
    const boldMatches = trimmed.match(/\*\*([^*]+)\*\*/g);
    if (boldMatches) {
      for (const bm of boldMatches) {
        boldTerms.push(bm.replace(/\*\*/g, '').trim());
      }
    }
    const codeMatches = trimmed.match(/`([^`]+)`/g);
    if (codeMatches) {
      for (const cm of codeMatches) {
        inlineCodes.push(cm.replace(/`/g, '').trim());
      }
    }
  }

  const domainTagBank = [
    // 自媒体与内容合规
    { tag: '自媒体', matches: ['自媒体', '公众号', '微信公众号', '创作者', '发文', '违禁词', '敏感词', '小红书', '知乎', '百家号', '今日头条'] },
    { tag: '微信公众号', matches: ['微信公众号', '公众号', '微信生态', '公众号运营', '微信排版', '微信公众平台'] },
    { tag: '内容安全', matches: ['敏感词', '违禁词', '合规', '风控', '审核', '运营规范', '违规排查', '敏感词检测'] },
    
    // AI 与智能体
    { tag: 'AI编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'opencode', 'cursor', 'copilot', 'windsurf', 'claude code', 'trae', 'cline', 'skill'] },
    { tag: '人工智能', matches: ['人工智能', 'ai', '大模型', 'llm', 'deepseek', 'gpt', 'openai', 'claude', 'gemini', 'ollama', 'qwen', '通义千问'] },
    { tag: '智能体', matches: ['agent', '智能体', '多智能体', 'multi-agent', 'ddagent', 'dify', 'coze', '扣子', 'autogen'] },
    { tag: 'AIGC', matches: ['aigc', '生成式ai', 'midjourney', 'stable diffusion', 'comfyui', 'sora', 'flux', 'ai生图', '绘画'] },
    { tag: '自然语言处理', matches: ['nlp', '自然语言处理', 'embedding', 'rag', '向量检索', '知识库', 'rerank'] },

    // 自动化与工具
    { tag: '自动化', matches: ['自动化', 'automation', 'n8n', 'workflow', '工作流', 'mcp', '自动化脚本', 'playwright', 'puppeteer'] },
    { tag: '开发工具', matches: ['ide', 'vscode', 'devtools', '工具箱', 'git', '工具', 'chrome插件', '命令行', 'cli'] },

    // 编程语言与全栈开发
    { tag: 'Python', matches: ['python', 'pip', 'python3', 'fastapi', 'flask', 'django', 'numpy', 'pandas', 'pytorch'] },
    { tag: 'Node.js', matches: ['node.js', 'nodejs', 'javascript', 'typescript', 'npm', 'npx', 'yarn', 'pnpm'] },
    { tag: 'Java', matches: ['java', 'springboot', 'spring boot', 'spring', 'mybatis', 'jvm', 'maven', 'gradle'] },
    { tag: 'Go', matches: ['go', 'golang', 'gin', 'gorm', 'goroutine'] },
    { tag: '前端', matches: ['前端', 'react', 'vue', 'html', 'css', 'tailwind', 'next.js', 'vite', 'webpack', 'web'] },
    { tag: '后端', matches: ['后端', '服务端', 'api', 'http', 'server', '微服务', 'rpc', 'grpc'] },
    { tag: '架构', matches: ['架构', '架构设计', '系统设计', '设计模式', '分布式', '高并发', '工程化', '工业化'] },
    { tag: 'Docker', matches: ['docker', '容器', 'docker-compose', 'k8s', 'kubernetes', 'container'] },
    { tag: '数据库', matches: ['数据库', 'mysql', 'redis', 'postgresql', 'mongodb', 'sql', 'elasticsearch'] }
  ];

  const titleLower = (title || '').toLowerCase();
  const pathLower = (filePath || '').toLowerCase();
  const headingsText = headings.join(' ').toLowerCase();
  const boldCodeText = (boldTerms.join(' ') + ' ' + inlineCodes.join(' ')).toLowerCase();
  const fullText = (pathLower + ' ' + titleLower + ' ' + cleanContent).toLowerCase();

  const scoredTags = [];

  for (const item of domainTagBank) {
    let score = 0;
    for (const match of item.matches) {
      const mLower = match.toLowerCase();
      if (titleLower.includes(mLower)) score += 10;
      if (pathLower.includes(mLower)) score += 8;
      if (headingsText.includes(mLower)) score += 5;
      if (boldCodeText.includes(mLower)) score += 3;
      if (fullText.includes(mLower)) score += 1;
    }
    if (score > 0) {
      scoredTags.push({ tag: item.tag, score });
    }
  }

  scoredTags.sort((a, b) => b.score - a.score);
  const matchedList = scoredTags.map(s => s.tag);
  const uniqueMatched = [...new Set(matchedList)].slice(0, 4);

  if (uniqueMatched.length === 0) {
    uniqueMatched.push('AI编程', '人工智能', '开发工具');
  }

  return uniqueMatched;
}

/**
 * 解析封面图资产（遵循 doudou-markdown-skill 规约）
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ type: 'cdn'|'local'|'none', url?: string, localPath?: string, base64?: string, mimeType?: string }}
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
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (Array.isArray(manifest.assets)) {
        // 优先 2.35:1 或 16:9 封面，其次 1:1
        const coverAssets = manifest.assets.filter(a => a.type === 'cover');
        const mainCover = coverAssets.find(a => a.aspect_ratio === '2.35:1' || a.slug?.includes('2.35') || a.slug?.includes('main')) 
          || coverAssets.find(a => a.aspect_ratio === '16:9' || a.slug?.includes('16x9'))
          || coverAssets.find(a => a.aspect_ratio === '1:1' || a.slug?.includes('1x1'))
          || coverAssets[0];
        
        if (mainCover) {
          let localFullPath = mainCover.local_path ? path.resolve(artifactDir, mainCover.local_path) : undefined;
          let base64Data = null;
          let mimeType = 'image/jpeg';
          if (localFullPath && fs.existsSync(localFullPath)) {
            const extName = path.extname(localFullPath).toLowerCase().replace('.', '');
            mimeType = extName === 'png' ? 'image/png' : 'image/jpeg';
            base64Data = fs.readFileSync(localFullPath).toString('base64');
          }
          return {
            type: base64Data ? 'local' : 'cdn',
            url: mainCover.cdn_url,
            localPath: localFullPath,
            base64: base64Data || undefined,
            mimeType
          };
        }
      }
    } catch (e) {
      // 忽略解析错误
    }
  }

  // 2. 从同名目录的 cover/images 查找本地图片
  const coverImagesDir = path.join(artifactDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir) && fs.statSync(coverImagesDir).isDirectory()) {
    const files = fs.readdirSync(coverImagesDir);
    const validExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const imageFiles = files.filter(f => validExts.includes(path.extname(f).toLowerCase()) && !f.includes('yuantu'));
    
    // 优先选择 2.35x1 或 16x9 或 main
    const targetFile = imageFiles.find(f => f.includes('2.35') || f.includes('main') || f.includes('16x9')) 
      || imageFiles.find(f => f.includes('1x1'))
      || imageFiles[0];

    if (targetFile) {
      const fullLocalPath = path.join(coverImagesDir, targetFile);
      const extName = path.extname(targetFile).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : 'image/jpeg';
      const buffer = fs.readFileSync(fullLocalPath);
      return {
        type: 'local',
        localPath: fullLocalPath,
        base64: buffer.toString('base64'),
        mimeType
      };
    }
  }

  // 3. 检查正文开头（前 10 行内）是否有网络封面图链接（如 ![封面图](https://...)）
  const topLines = content.split('\n').slice(0, 10).join('\n');
  const topImgMatch = topLines.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (topImgMatch && topImgMatch[1]) {
    return {
      type: 'cdn',
      url: topImgMatch[1]
    };
  }

  // 4. 从 Markdown 正文任意位置提取第一张网络图片
  const imgMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (imgMatch && imgMatch[1]) {
    return {
      type: 'cdn',
      url: imgMatch[1]
    };
  }

  const localImgMatch = content.match(/!\[.*?\]\(([^)]+)\)/);
  if (localImgMatch && localImgMatch[1]) {
    const localRel = localImgMatch[1];
    const fullImgPath = path.resolve(dir, localRel);
    if (fs.existsSync(fullImgPath)) {
      const extName = path.extname(fullImgPath).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : 'image/jpeg';
      const buffer = fs.readFileSync(fullImgPath);
      return {
        type: 'local',
        localPath: fullImgPath,
        base64: buffer.toString('base64'),
        mimeType
      };
    }
  }

  return { type: 'none' };
}

/**
 * 解析 Markdown 及其关联资产
 * @param {string} filePath 
 */
export function parseArticle(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const stem = path.basename(absPath, ext);
  const rawContent = fs.readFileSync(absPath, 'utf8');

  // 优先读取同名目录下 _cdn.md 版本的正文
  const cdnMdPath = path.join(dir, stem, `${stem}_cdn.md`);
  let content = rawContent;
  let isCdnVersion = false;

  if (fs.existsSync(cdnMdPath)) {
    content = fs.readFileSync(cdnMdPath, 'utf8');
    isCdnVersion = true;
  }

  const title = extractTitle(rawContent, stem);
  const summary = extractSummary(content);
  const tags = extractTags(content, title, absPath);
  const cover = resolveCoverImage(absPath, rawContent);

  // 格式化正文：去除首行的顶级大标题（避免 CSDN 编辑器标题与正文重复）
  let bodyContent = content.trim();
  const firstLine = bodyContent.split('\n')[0].trim();
  if (firstLine.startsWith('# ') && firstLine.replace(/^#\s+/, '').trim() === title) {
    bodyContent = bodyContent.substring(firstLine.length).trim();
  }

  return {
    filePath: absPath,
    stem,
    title,
    summary,
    tags,
    cover,
    isCdnVersion,
    bodyContent,
    rawContent
  };
}

// 命令行直接运行测试支持
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('parser.mjs'))) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node parser.mjs <Markdown文件路径>');
    process.exit(1);
  }
  const result = parseArticle(targetFile);
  console.log(JSON.stringify({
    title: result.title,
    summary: result.summary,
    tags: result.tags,
    cover: {
      type: result.cover.type,
      url: result.cover.url,
      localPath: result.cover.localPath,
      hasBase64: !!result.cover.base64
    },
    isCdnVersion: result.isCdnVersion,
    bodyLength: result.bodyContent.length
  }, null, 2));
}
