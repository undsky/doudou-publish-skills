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
 * 从正文中提炼 60~95 字纯文本摘要（掘金限制 100 字以内）
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
    if (textBlocks.join(' ').length >= 75) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (summary.length > 95) {
    summary = summary.substring(0, 92) + '...';
  }
  return summary || '本文分享了深度技术实践与架构解析，欢迎阅读与交流。';
}

/**
 * 智能推断掘金文章分类
 * 可选分类：后端、前端、Android、iOS、人工智能、开发工具、代码人生、阅读
 * @param {string} content 
 * @param {string} title 
 * @returns {string}
 */
export function inferCategory(content, title = '') {
  const fullText = (title + ' ' + content).toLowerCase();

  const rules = [
    { category: '人工智能', keywords: ['ai', 'agent', '智能体', '大模型', 'llm', 'deepseek', 'gpt', 'openai', 'prompt', 'aigc', 'langchain', 'rag', '机器学习', '深度学习', '算法', 'ai编程', 'aicoding'] },
    { category: '前端', keywords: ['vue', 'react', 'javascript', 'typescript', 'css', 'html', 'tailwind', 'vite', 'webpack', '前端', 'web', '小程序', 'electron'] },
    { category: '后端', keywords: ['java', 'spring', 'springboot', 'go', 'golang', 'python', 'mysql', 'redis', '微服务', '后端', '服务端', '数据库', 'mybatis', 'kafka', 'rpc', 'grpc'] },
    { category: '开发工具', keywords: ['docker', 'kubernetes', 'k8s', 'git', 'ci/cd', 'vscode', 'ide', 'n8n', '自动化', 'mcp', 'devtools', '工具', 'linux', 'nginx'] },
    { category: 'Android', keywords: ['android', '安卓', 'kotlin', 'flutter', 'jetpack'] },
    { category: 'iOS', keywords: ['ios', 'swift', 'swiftui', 'objective-c', 'xcode'] },
    { category: '代码人生', keywords: ['职场', '经历', '年终总结', '面试', '随笔', '心路历程', '程序员'] },
    { category: '阅读', keywords: ['读书', '书单', '书评', '读书笔记'] }
  ];

  for (const item of rules) {
    if (item.keywords.some(k => fullText.includes(k))) {
      return item.category;
    }
  }

  return '人工智能';
}

/**
 * 智能提取 1~3 个技术标签关键词（用于掘金标签搜索匹配）
 * @param {string} content 
 * @param {string} title 
 * @returns {string[]}
 */
export function extractTags(content, title = '') {
  const keywordsMap = [
    { tag: 'AI编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'opencode'] },
    { tag: '人工智能', matches: ['ai', '人工智能', '大模型', 'llm', 'deepseek', 'gpt', 'openai'] },
    { tag: '智能体', matches: ['agent', '智能体', '多智能体', 'multi-agent'] },
    { tag: 'AIGC', matches: ['aigc', '生成式ai', 'stable diffusion', 'midjourney'] },
    { tag: 'Cursor', matches: ['cursor', 'cursor ai'] },
    { tag: 'LangChain', matches: ['langchain', 'langgraph'] },
    { tag: 'Docker', matches: ['docker', '容器', 'docker-compose', 'alpine'] },
    { tag: 'Node.js', matches: ['node.js', 'nodejs', 'javascript', 'typescript', 'npm'] },
    { tag: 'Python', matches: ['python', 'pip', 'python3'] },
    { tag: '前端', matches: ['前端', 'react', 'vue', 'html', 'css'] },
    { tag: '后端', matches: ['后端', '服务端', 'api', 'http', 'server'] },
    { tag: '架构', matches: ['架构', '架构设计', '微服务', '工业化'] },
    { tag: '自动化', matches: ['自动化', 'automation', 'n8n', 'workflow', 'mcp'] }
  ];

  const fullText = (title + ' ' + content).toLowerCase();
  const matchedTags = [];

  for (const item of keywordsMap) {
    if (item.matches.some(m => fullText.includes(m))) {
      if (!matchedTags.includes(item.tag)) {
        matchedTags.push(item.tag);
      }
    }
    if (matchedTags.length >= 3) break;
  }

  if (matchedTags.length === 0) {
    matchedTags.push('人工智能', '架构');
  }

  return matchedTags;
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
        // 优先 2.35:1 或 16:9 或包含 main 的封面
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
  const category = inferCategory(content, title);
  const tags = extractTags(content, title);
  const cover = resolveCoverImage(absPath, rawContent);

  // 格式化正文：去除首行的顶级大标题（避免掘金编辑器标题与正文重复），保留其余部分
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
    category,
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
    category: result.category,
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
