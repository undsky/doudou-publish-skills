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
 * 从正文中提炼 80~180 字纯文本摘要（腾讯云限制 200 字以内）
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
    if (textBlocks.join(' ').length >= 140) {
      break;
    }
  }

  let summary = textBlocks.join(' ');
  if (summary.length > 190) {
    summary = summary.substring(0, 187) + '...';
  }
  return summary || '本文分享了深度技术实践与架构解析，欢迎阅读与交流。';
}

/**
 * 智能提取 1~5 个文章标签或自定义关键词
 * @param {string} content 
 * @param {string} title 
 * @returns {string[]}
 */
export function extractTags(content, title = '') {
  const keywordsMap = [
    { tag: 'AI编程', matches: ['ai编程', 'ai coding', '大模型编程', '代码生成', 'opencode'] },
    { tag: '人工智能', matches: ['ai', '人工智能', '大模型', 'llm', 'deepseek', 'gpt', '智能体', 'agent'] },
    { tag: '智能体', matches: ['agent', '智能体', '特工', '多智能体', 'multi-agent'] },
    { tag: 'Docker', matches: ['docker', '容器', 'docker-compose', 'alpine', '镜像'] },
    { tag: '微服务', matches: ['微服务', '架构', '架构设计', '契约', '工业化'] },
    { tag: 'Node.js', matches: ['node.js', 'nodejs', 'javascript', 'typescript', 'npm'] },
    { tag: 'Python', matches: ['python', 'pip', 'python3'] },
    { tag: '前端开发', matches: ['前端', 'react', 'vue', 'html', 'css', 'javascript'] },
    { tag: '后端开发', matches: ['后端', '服务端', 'api', 'http', 'server'] },
    { tag: '自动化', matches: ['自动化', 'automation', 'n8n', 'workflow', '工作流', 'mcp'] },
    { tag: '云原生', matches: ['云原生', '云计算', 'serverless', 'k8s', 'kubernetes'] }
  ];

  const fullText = (title + ' ' + content).toLowerCase();
  const matchedTags = [];

  for (const item of keywordsMap) {
    if (item.matches.some(m => fullText.includes(m))) {
      matchedTags.push(item.tag);
    }
    if (matchedTags.length >= 5) break;
  }

  if (matchedTags.length === 0) {
    matchedTags.push('前沿技术', '开发实践');
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
          || coverAssets[0];
        
        if (mainCover && mainCover.cdn_url) {
          return {
            type: 'cdn',
            url: mainCover.cdn_url,
            localPath: mainCover.local_path ? path.resolve(artifactDir, mainCover.local_path) : undefined
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

  // 3. 从 Markdown 正文中提取第一张图片
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
  const tags = extractTags(content, title);
  const cover = resolveCoverImage(absPath, rawContent);

  // 格式化正文：去除首行的顶级大标题（避免腾讯云编辑器标题重复），保留其余部分
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

// 命令行直接运行测试
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const targetFile = process.argv[2] || '/Users/jyx/project/undsky/mds/AICoding/ddagent.md';
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
