import fs from 'node:fs';
import path from 'node:path';
import { Marked } from './marked.esm.js';

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
 * 从正文中提炼 80~150 字纯文本摘要
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
  if (summary.length > 150) {
    summary = summary.substring(0, 145) + '...';
  }
  return summary || '本文分享了深度技术实践与架构解析，欢迎阅读与交流。';
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
 * 动态智能推断 1~3 个知乎官方高频话题关键词
 * 遵循多级动态决策：
 * 1. 显式传入参数 / 环境变量 (options.topics / process.env.ZHIHU_TOPICS)
 * 2. 文章 FrontMatter (topics / tags / keywords / categories)
 * 3. 同名目录元数据文件 (outline.md / analysis.md)
 * 4. 标题与正文高权重实体词动态打分抽取 (无需修改任何代码，自适应所有领域)
 * @param {string} content 
 * @param {string} title 
 * @param {object} options
 * @returns {string[]}
 */
export function extractTopics(content, title = '', options = {}) {
  // 1. 显式指定的优先级最高（支持数组、逗号/顿号/空格分隔字符串、环境变量）
  const explicitTopics = options.topics || options.tags || (typeof process !== 'undefined' && process.env && process.env.ZHIHU_TOPICS);
  if (explicitTopics) {
    const list = Array.isArray(explicitTopics)
      ? explicitTopics
      : String(explicitTopics).split(/[,，、|# ]+/).map(s => s.trim()).filter(Boolean);
    if (list.length > 0) {
      return [...new Set(list)].slice(0, 3);
    }
  }

  // 2. 从 FrontMatter 提取
  const fm = extractFrontmatter(content);
  if (fm) {
    const fmTopics = fm.topics || fm.tags || fm.keywords || fm.categories || fm.category;
    if (fmTopics) {
      const list = Array.isArray(fmTopics)
        ? fmTopics
        : String(fmTopics).split(/[,，、|# ]+/).map(s => s.trim()).filter(Boolean);
      if (list.length > 0) {
        return [...new Set(list)].slice(0, 3);
      }
    }
  }

  // 3. 从同名目录元数据文件推断 (如 outline.md, analysis.md)
  if (options.markdownFilePath) {
    try {
      const absPath = path.resolve(options.markdownFilePath);
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
          const match = txt.match(/(?:话题|标签|关键词|Tags|Topics)[:：]\s*([^\n\r]+)/i);
          if (match && match[1]) {
            const list = match[1].split(/[,，、|# ]+/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
            if (list.length > 0) {
              return [...new Set(list)].slice(0, 3);
            }
          }
        }
      }
    } catch (e) {}
  }

  // 4. 动态文本语义分析与领域词频加权抽取（完全自适应，无需修改代码）
  const domainTopicBank = [
    // 自媒体与内容运营
    { topic: '自媒体', matches: ['自媒体', '公众号', '微信公众号', '创作者', '发文', '违禁词', '敏感词', '百家号', '头条号', '小红书', '知乎', '短视频', '流量', '变现', '爆款', '自媒体运营', '新媒体'] },
    { topic: '微信公众平台', matches: ['微信公众平台', '微信生态', '公众号运营', '公众号开发', '微信文章', '公众号排版'] },
    { topic: '内容安全', matches: ['敏感词', '违规', '合规', '风控', '审核', '鉴黄', '内容审核', '风控系统', '敏感词检测', '内容安全'] },
    
    // AI 与大模型
    { topic: '人工智能', matches: ['人工智能', 'ai', '大模型', 'llm', 'deepseek', 'gpt', 'gpt-4', 'openai', 'claude', 'gemini', 'ollama', 'qwen', '通义千问', 'llama', '文心一言', 'kimi'] },
    { topic: '智能体', matches: ['agent', '智能体', '多智能体', 'multi-agent', 'opencode', 'autogen', 'crewai', 'dify', 'coze', '扣子'] },
    { topic: 'AI 编程', matches: ['ai编程', 'aicoding', 'ai coding', '代码生成', 'cursor', 'copilot', 'v0', 'windsurf', 'claude code', 'trae', 'cline', 'roo code'] },
    { topic: 'AIGC', matches: ['aigc', '生成式ai', 'stable diffusion', 'midjourney', 'comfyui', 'sora', 'flux', '文生图', '图生图', 'ai生图', 'ai绘画'] },
    { topic: '自然语言处理', matches: ['nlp', '自然语言处理', 'embedding', '向量检索', 'rag', '知识库', 'rerank', '分词', 'semantic'] },

    // 自动化与研发效率
    { topic: '自动化', matches: ['自动化', 'automation', 'n8n', 'workflow', '工作流', 'mcp', '自动化运维', '自动化测试', '自动化脚本', '爬虫', 'playwright', 'puppeteer', 'selenium'] },
    { topic: '效率工具', matches: ['效率工具', '生产力工具', 'notion', 'obsidian', 'workflow', '油猴脚本', 'chrome插件', '浏览器插件', '命令行工具', 'cli'] },

    // 软件开发与编程
    { topic: '程序员', matches: ['程序员', '开发者', '工程师', '开源', '代码', '编程', 'developer', 'coding', 'github', 'git'] },
    { topic: '前端开发', matches: ['前端', 'javascript', 'typescript', 'vue', 'react', 'css', 'html', 'node.js', 'next.js', 'vite', 'tailwind', 'webpack', 'uniapp', 'electron'] },
    { topic: '后端开发', matches: ['后端', 'java', 'springboot', 'spring boot', 'go', 'golang', 'python', 'mysql', 'redis', 'postgresql', 'mongodb', 'mybatis', 'fastapi', 'flask', 'django', 'eggjs', 'nest.js'] },
    { topic: '软件架构', matches: ['架构', '架构设计', '微服务', '系统设计', '设计模式', '分布式', '高并发', '高可用', '领域驱动设计', 'ddd'] },
    { topic: 'Docker', matches: ['docker', '容器', 'docker-compose', 'alpine', 'k8s', 'kubernetes', 'container', 'dockerfile'] },
    { topic: 'DevOps', matches: ['devops', 'ci/cd', '持续集成', 'jenkins', 'github actions', 'linux', 'ubuntu', 'centos', 'nginx', '运维'] },
    { topic: '数据库', matches: ['数据库', 'mysql', 'redis', 'elasticsearch', 'pgsql', 'mongodb', 'sql', 'orm', '向量数据库'] },

    // 职场与设计
    { topic: 'UI/UX 设计', matches: ['ui设计', 'ux设计', '交互设计', 'figma', '设计系统', '原型设计', '视觉设计', '排版设计'] },
    { topic: '职场成长', matches: ['职场', '面试', '跳槽', '简历', '职业发展', '副业', '自由职业', '远程工作'] }
  ];

  // 抽取正文核心结构与高权重短语
  const headings = [];
  const boldTerms = [];
  const inlineCodes = [];

  const lines = (content || '').split('\n');
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

  // 加权打分：Title (权重 10) > 大纲 H1/H2 (权重 5) > 加粗/代码 (权重 3) > 全文
  const titleLower = (title || '').toLowerCase();
  const headingsText = headings.join(' ').toLowerCase();
  const boldCodeText = (boldTerms.join(' ') + ' ' + inlineCodes.join(' ')).toLowerCase();
  const fullText = (content || '').toLowerCase();

  const scoredTopics = [];

  for (const item of domainTopicBank) {
    let score = 0;
    for (const match of item.matches) {
      const matchLower = match.toLowerCase();
      if (titleLower.includes(matchLower)) {
        score += 10;
      }
      if (headingsText.includes(matchLower)) {
        score += 5;
      }
      if (boldCodeText.includes(matchLower)) {
        score += 3;
      }
      if (score === 0 && fullText.includes(matchLower)) {
        score += 1;
      }
    }

    if (score > 0) {
      scoredTopics.push({ topic: item.topic, score });
    }
  }

  scoredTopics.sort((a, b) => b.score - a.score);
  const matched = scoredTopics.map(s => s.topic);

  // 动态抽取标题中的专有名词/短语实体（排除纯数字）
  const cleanTitle = (title || '')
    .replace(/[！!？?：:，,。._\-+=#*~`/\\]/g, ' ')
    .replace(/(?:指南|怎么用|如何|快速|教程|实战|解析|避坑|小白|入门|大揭秘|全攻略|技巧|盘点)/g, ' ');
  const titleWords = cleanTitle.split(/\s+/).filter(w => w.length >= 2 && w.length <= 10 && !/^\d+$/.test(w));
  for (const w of titleWords) {
    if (!matched.includes(w) && matched.length < 3) {
      if (/[\u4e00-\u9fa5]{2,6}/.test(w) || /^[a-zA-Z0-9#+.-]{2,12}$/.test(w)) {
        matched.push(w);
      }
    }
  }

  if (matched.length > 0) {
    return [...new Set(matched)].slice(0, 3);
  }

  // 5. 兜底回退
  return ['人工智能', '程序员'];
}

/**
 * 解析封面图资产（遵循 doudou-markdown-skill 规约）
 * 优先级：
 * 1. 同名目录 cdn_manifest.json 中类型为 cover 的条目（优先 2.35:1 宽屏主封面、16:9 封面、1:1 方形封面，存在本地文件时优先读取 base64）
 * 2. 同名目录 cover/images/ 下的本地封面（cover-main-2.35x1.png / 16x9 / 1x1）
 * 3. 同名目录 xhs_images/images/ 下的第一张封面卡片（01-cover.png）
 * 4. 正文前 10 行内的封面图（网络或本地图片）
 * 5. 正文中提取的第一张网络或本地图片
 * @param {string} markdownFilePath 
 * @param {string} content 
 * @returns {{ hasCover: boolean, type: 'local'|'cdn'|'none', url?: string, localPath?: string, base64?: string, mimeType?: string, fileName?: string }}
 */
export function resolveCoverImage(markdownFilePath, content = '') {
  const absPath = path.resolve(markdownFilePath);
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const stem = path.basename(absPath, ext);
  const artifactDir = path.join(dir, stem);

  // 构建 manifest 快速映射表
  let manifestMap = {};
  let manifestAssets = [];
  const manifestPath = path.join(artifactDir, 'cdn_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : (Array.isArray(manifest.files) ? manifest.files : []);
      for (const asset of manifestAssets) {
        if (asset.local_path && asset.cdn_url) {
          manifestMap[path.resolve(artifactDir, asset.local_path)] = asset.cdn_url;
          manifestMap[path.resolve(dir, asset.local_path)] = asset.cdn_url;
          manifestMap[path.basename(asset.local_path)] = asset.cdn_url;
        }
      }
    } catch (e) {
      console.warn('[parser] 解析 cdn_manifest.json 异常:', e.message);
    }
  }

  // 1. 优先从同名目录的 cdn_manifest.json 查找
  if (manifestAssets.length > 0) {
    const coverAssets = manifestAssets.filter(a => {
      const pathStr = (a.local_path || a.slug || a.original_name || a.cdn_url || '').toLowerCase();
      return a.type === 'cover' || pathStr.includes('cover');
    });

    if (coverAssets.length > 0) {
      const mainCover = coverAssets.find(a => {
        const s = ((a.local_path || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
        return s.includes('2.35') || s.includes('main');
      }) || coverAssets.find(a => {
        const s = ((a.local_path || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
        return s.includes('16:9') || s.includes('16x9');
      }) || coverAssets.find(a => {
        const s = ((a.local_path || '') + ' ' + (a.slug || '') + ' ' + (a.aspect_ratio || '')).toLowerCase();
        return s.includes('1:1') || s.includes('1x1');
      }) || coverAssets[0];

      if (mainCover) {
        const relPath = mainCover.local_path || mainCover.original_name || mainCover.path;
        let localFullPath = undefined;
        if (relPath) {
          if (path.isAbsolute(relPath) && fs.existsSync(relPath)) {
            localFullPath = relPath;
          } else if (fs.existsSync(path.resolve(artifactDir, relPath))) {
            localFullPath = path.resolve(artifactDir, relPath);
          } else if (fs.existsSync(path.resolve(dir, relPath))) {
            localFullPath = path.resolve(dir, relPath);
          }
        }

        let base64Data = null;
        let mimeType = mainCover.mime_type || 'image/jpeg';
        if (localFullPath && fs.existsSync(localFullPath)) {
          const extName = path.extname(localFullPath).toLowerCase().replace('.', '');
          mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
          base64Data = fs.readFileSync(localFullPath).toString('base64');
        }

        const fileName = localFullPath ? path.basename(localFullPath) : (mainCover.slug ? `${mainCover.slug}.png` : 'cover.png');

        return {
          hasCover: true,
          type: base64Data ? 'local' : (mainCover.cdn_url ? 'cdn' : 'none'),
          url: mainCover.cdn_url,
          localPath: localFullPath,
          base64: base64Data || undefined,
          mimeType,
          fileName
        };
      }
    }
  }

  // 2. 从同名目录的 cover/images 查找本地图片
  const coverImagesDir = path.join(artifactDir, 'cover', 'images');
  if (fs.existsSync(coverImagesDir) && fs.statSync(coverImagesDir).isDirectory()) {
    const files = fs.readdirSync(coverImagesDir);
    const validExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const imageFiles = files.filter(f => validExts.includes(path.extname(f).toLowerCase()) && !f.includes('yuantu'));

    const candidates = [
      imageFiles.find(f => f.includes('2.35x1') || f.includes('2.35:1') || f.includes('cover-main') || f.includes('main')),
      imageFiles.find(f => f.includes('16x9') || f.includes('16:9')),
      imageFiles.find(f => f.includes('square-1x1') || f.includes('1x1')),
      imageFiles.find(f => f.includes('cover')),
      imageFiles[0]
    ].filter(Boolean);

    if (candidates.length > 0) {
      const targetFile = candidates[0];
      const fullLocalPath = path.join(coverImagesDir, targetFile);
      const extName = path.extname(targetFile).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
      const buffer = fs.readFileSync(fullLocalPath);
      const cdnUrl = manifestMap[fullLocalPath] || manifestMap[targetFile] || undefined;

      return {
        hasCover: true,
        type: 'local',
        url: cdnUrl,
        localPath: fullLocalPath,
        base64: buffer.toString('base64'),
        mimeType,
        fileName: targetFile
      };
    }
  }

  // 3. 备选：读取 xhs_images/images/ 下的第一张封面卡片（如 01-cover.png）
  const xhsImagesDir = path.join(artifactDir, 'xhs_images', 'images');
  if (fs.existsSync(xhsImagesDir)) {
    const allFiles = fs.readdirSync(xhsImagesDir)
      .filter(f => !f.includes('_yuantu') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const coverCard = allFiles.find(f => f.includes('01-cover') || f.includes('cover') || f.startsWith('01')) || allFiles[0];

    if (coverCard) {
      const localPath = path.join(xhsImagesDir, coverCard);
      const buf = fs.readFileSync(localPath);
      const extName = path.extname(coverCard).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
      const cdnUrl = manifestMap[localPath] || manifestMap[coverCard] || undefined;
      return {
        hasCover: true,
        type: 'local',
        url: cdnUrl,
        localPath,
        base64: buf.toString('base64'),
        mimeType,
        fileName: coverCard
      };
    }
  }

  // 4. 检查正文前 10 行是否有封面图链接（网络或本地）
  const topLines = (content || '').split('\n').slice(0, 10).join('\n');
  const topImgMatch = topLines.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (topImgMatch && topImgMatch[1]) {
    return {
      hasCover: true,
      type: 'cdn',
      url: topImgMatch[1],
      fileName: 'cover_top.png',
      mimeType: 'image/jpeg'
    };
  }

  const topLocalMatch = topLines.match(/!\[.*?\]\(([^)]+)\)/);
  if (topLocalMatch && topLocalMatch[1] && !topLocalMatch[1].startsWith('http')) {
    const localRel = topLocalMatch[1];
    const fullImgPath = path.resolve(dir, localRel);
    if (fs.existsSync(fullImgPath)) {
      const extName = path.extname(fullImgPath).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
      const buffer = fs.readFileSync(fullImgPath);
      return {
        hasCover: true,
        type: 'local',
        localPath: fullImgPath,
        base64: buffer.toString('base64'),
        mimeType,
        fileName: path.basename(fullImgPath)
      };
    }
  }

  // 5. 从 Markdown 正文任意位置提取第一张图片
  const imgMatch = (content || '').match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (imgMatch && imgMatch[1]) {
    return {
      hasCover: true,
      type: 'cdn',
      url: imgMatch[1],
      fileName: 'cover_from_content.png',
      mimeType: 'image/jpeg'
    };
  }

  const localImgMatch = (content || '').match(/!\[.*?\]\(([^)]+)\)/);
  if (localImgMatch && localImgMatch[1] && !localImgMatch[1].startsWith('http')) {
    const localRel = localImgMatch[1];
    const fullImgPath = path.resolve(dir, localRel);
    if (fs.existsSync(fullImgPath)) {
      const extName = path.extname(fullImgPath).toLowerCase().replace('.', '');
      const mimeType = extName === 'png' ? 'image/png' : (extName === 'webp' ? 'image/webp' : 'image/jpeg');
      const buffer = fs.readFileSync(fullImgPath);
      return {
        hasCover: true,
        type: 'local',
        localPath: fullImgPath,
        base64: buffer.toString('base64'),
        mimeType,
        fileName: path.basename(fullImgPath)
      };
    }
  }

  return { hasCover: false, type: 'none' };
}

/**
 * 将 Markdown 转换为知乎 Draft.js 编辑器剪贴板兼容的高质量 HTML（基于 marked）
 * @param {string} md 
 * @returns {string} HTML 字符串
 */
export function markdownToHtml(md) {
  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const tag = depth === 1 ? 'h2' : `h${depth}`;
      return `<${tag}>${text}</${tag}>\n`;
    },

    table({ header, rows }) {
      let headerHtml = '';
      if (header && header.length > 0) {
        headerHtml = '<tr>\n' +
          header.map(cell => {
            const align = cell.align ? `align="${cell.align}"` : '';
            return `  <th ${align}>${this.parser.parseInline(cell.tokens)}</th>\n`;
          }).join('') +
          '</tr>\n';
      }

      let bodyHtml = '';
      if (rows && rows.length > 0) {
        bodyHtml = rows.map(row => {
          const cellsHtml = row.map(cell => {
            const align = cell.align ? `align="${cell.align}"` : '';
            return `  <td ${align}>${this.parser.parseInline(cell.tokens)}</td>\n`;
          }).join('');
          return `<tr>\n${cellsHtml}</tr>\n`;
        }).join('');
      }

      return `<table border="1">\n<thead>\n${headerHtml}</thead>\n<tbody>\n${bodyHtml}</tbody>\n</table>\n`;
    },

    codespan({ text }) {
      return `<code>${text}</code>`;
    },

    code({ text, lang }) {
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const langClass = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${langClass}>${escaped}</code></pre>\n`;
    },

    image({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<p><img src="${href}" alt="${text}"${titleAttr} /></p>\n`;
    },

    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
    },

    hr() {
      return '<hr />\n';
    }
  };

  const customMarked = new Marked({
    renderer,
    gfm: true,
    breaks: true
  });

  return customMarked.parse(md);
}

/**
 * 解析 Markdown 及其关联资产
 * @param {string} filePath 
 * @param {object} options 可选配置（如 { topics: ['自媒体', '微信公众号'] }）
 */
export function parseArticle(filePath, options = {}) {
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
  const topics = extractTopics(content, title, { markdownFilePath: absPath, ...options });
  const cover = resolveCoverImage(absPath, rawContent);

  // 格式化正文：去除首行的顶级大标题（避免知乎编辑器标题与正文重复），保留其余部分
  let bodyContent = content.trim();
  const firstLine = bodyContent.split('\n')[0].trim();
  if (firstLine.startsWith('# ') && firstLine.replace(/^#\s+/, '').trim() === title) {
    bodyContent = bodyContent.substring(firstLine.length).trim();
  }

  // 预转译为知乎 Draft.js 剪贴板兼容富文本 HTML
  const htmlContent = markdownToHtml(bodyContent);

  return {
    markdownFilePath: absPath,
    filePath: absPath,
    stem,
    title,
    articleTitle: title,
    summary,
    articleSummary: summary,
    topics,
    tags: topics,
    cover,
    isCdnVersion,
    bodyContent,
    htmlContent,
    rawContent
  };
}

/**
 * 全面解析 Markdown 文件及其关联资产（兼容易与其他 skill 统一调用的签名）
 * @param {string} filePath 
 * @param {string} author 
 * @param {object} options 
 */
export function parseAllAssets(filePath, author = 'undsky', options = {}) {
  const result = parseArticle(filePath, options);
  return {
    ...result,
    author
  };
}

// 命令行直接运行测试
if (process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) || process.argv[1].endsWith('parser.mjs'))) {
  const args = process.argv.slice(2);
  let targetFile = null;
  let cliTopics = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--topics' || arg === '-t') {
      cliTopics = args[++i];
    } else if (!arg.startsWith('-') && !targetFile) {
      targetFile = arg;
    }
  }

  if (!targetFile) {
    console.error('❌ 缺少必要参数！用法: node parser.mjs <Markdown文件路径> [--topics "话题1,话题2"]');
    process.exit(1);
  }

  const result = parseArticle(targetFile, cliTopics ? { topics: cliTopics } : {});
  console.log(JSON.stringify({
    title: result.title,
    summary: result.summary,
    topics: result.topics,
    cover: {
      hasCover: result.cover.hasCover,
      type: result.cover.type,
      url: result.cover.url,
      localPath: result.cover.localPath,
      hasBase64: !!result.cover.base64,
      fileName: result.cover.fileName
    },
    isCdnVersion: result.isCdnVersion,
    bodyLength: result.bodyContent.length,
    htmlLength: result.htmlContent.length
  }, null, 2));
}

