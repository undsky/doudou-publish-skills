#!/usr/bin/env node
/**
 * asset_resolver.mjs — CDN 清单解析与标签推断（修复两个长期 bug）
 *
 * Bug A：各 parser 的 resolveCoverImage 只读 `manifest.assets` 并筛 `type === 'cover'`，
 *        但 doudou-r2 实际产出的 cdn_manifest.json 用的是 `files[]`，条目里既没有 `type`
 *        也没有 `slug` / `name` / `aspect_ratio`，只有 local_path / cdn_url / thumb_path /
 *        original_name。结果 CDN 分支被静默跳过，降级去读本地图并转成数百 KB base64
 *        塞进 evaluate_script 载荷（claw163 实测 586KB）。
 *
 * Bug B：各 parser 把 `const tags = []` 硬编码为空数组，从不推断。发布脚本里的标签逻辑
 *        普遍被 `data.tags.length > 0` 整段跳过，等于永远不配标签。
 *
 * 本模块只做纯函数，不碰浏览器，可独立单测。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** 读取并归一化 cdn_manifest.json：兼容 assets[] / files[] / 顶层数组三种结构 */
export function readManifestItems(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.assets)
      ? raw.assets
      : Array.isArray(raw.files)
        ? raw.files
        : [];
  return list.map(normalizeItem).filter(Boolean);
}

/** 把不同产出版本的字段名归一成统一形状 */
function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const localPath = item.local_path ?? item.localPath ?? item.path ?? null;
  const name = item.original_name ?? item.name ?? item.slug ?? (localPath ? path.basename(localPath) : null);
  return {
    type: item.type ?? null,
    localPath,
    thumbPath: item.thumb_path ?? item.thumbPath ?? null,
    cdnUrl: item.cdn_url ?? item.cdnUrl ?? item.url ?? null,
    name,
    aspectRatio: item.aspect_ratio ?? item.aspectRatio ?? null,
    mimeType: item.mime_type ?? item.mimeType ?? null,
    // 归一化的判定用小写全路径签名
    sig: [item.type, localPath, item.thumb_path, name, item.slug]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

/**
 * 判定是否封面资产。
 * 关键修复：不再依赖 `type === 'cover'`（真实清单没有该字段），
 * 改为同时接受显式 type 与 cover/ 路径前缀、cover- 文件名前缀等路径信号。
 */
export function isCoverItem(it) {
  if (!it) return false;
  if (it.type === "cover") return true;
  return /(^|[\\/])cover[\\/]|(^|[\\/])cover[-_.]|封面/.test(it.sig);
}

const ASPECT_MATCHERS = Object.freeze({
  "2.35:1": (it) => it.aspectRatio === "2.35:1" || /2\.35|main/.test(it.sig),
  "16:9": (it) => it.aspectRatio === "16:9" || /16x9|16-9|16_9/.test(it.sig),
  "1:1": (it) => it.aspectRatio === "1:1" || /1x1|square/.test(it.sig),
});
const DEFAULT_ASPECT_PRIORITY = ["2.35:1", "16:9", "1:1"];

/**
 * 封面优先级打分。默认 2.35:1 / main > 16:9 > 1:1；
 * bilibili 等以 16:9 为主的平台传 aspectPriority: ['16:9','2.35:1','1:1'] 覆盖。
 * 缩略图加分（体积友好），原图重罚。
 */
export function scoreCover(it, aspectPriority = DEFAULT_ASPECT_PRIORITY) {
  const s = it.sig;
  let score = 10;
  for (let i = 0; i < aspectPriority.length; i++) {
    const m = ASPECT_MATCHERS[aspectPriority[i]];
    if (m && m(it)) {
      score = 100 - i * 30;
      break;
    }
  }
  if (/_thumb|thumb/.test(s)) score += 15; // 缩略图体积友好，优先
  if (/yuantu|original|_raw/.test(s)) score -= 200; // 原图一律排除
  return score;
}

/**
 * 从产物目录解析最佳封面。
 *
 * 返回体是各平台两族形状的**超集**，任一平台都能直接消费：
 *   - `{type}` 族（juejin/aliyun/csdn/linuxsb/tencent/zhihu/bilibili）
 *   - `{hasCover, fileName}` 族（baijia/douyin/qiehao/toutiao/weixin）
 *   - `cdnUrl` 供 qiehao 的 `cover.cdnUrl || cover.url` 读取
 *
 * base64 策略：默认**不读**本地文件转 base64（避免注入载荷被数百 KB 图片撑爆，
 * claw163 实测单图 764KB）。仅当平台把 base64 内联进浏览器脚本、没有 URL 分支时，
 * 才传 preferBase64: true。
 *   - preferBase64 必需：baijia / douyin / qiehao / toutiao / weixin
 *   - 用 localPath 走 MCP upload_file：aliyun
 *   - 可浏览器内 fetch(url)：juejin / tencent / csdn / zhihu / bilibili
 *
 * @param {string} artifactDir 产物同名目录
 * @param {{preferBase64?: boolean, aspectPriority?: string[]}} opts
 */
export function resolveCoverFromManifest(artifactDir, opts = {}) {
  const items = readManifestItems(path.join(artifactDir, "cdn_manifest.json"));
  const covers = items.filter(isCoverItem);
  if (!covers.length) return null;

  const best = covers
    .slice()
    .sort((a, b) => scoreCover(b, opts.aspectPriority) - scoreCover(a, opts.aspectPriority))[0];
  const localFull = best.localPath ? path.resolve(artifactDir, best.localPath) : null;
  const localExists = !!(localFull && fs.existsSync(localFull));
  const ext = path.extname(localFull || best.name || "").toLowerCase().replace(".", "");
  const mimeType = best.mimeType ?? (ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png");
  const fileName = best.name || (localFull ? path.basename(localFull) : "cover.png");

  const wantBase64 = !!opts.preferBase64 && localExists;
  if (!best.cdnUrl && !localExists) return null;

  return {
    // {type} 族
    type: wantBase64 ? "local" : best.cdnUrl ? "cdn" : "local",
    url: best.cdnUrl ?? undefined,
    cdnUrl: best.cdnUrl ?? undefined, // qiehao 读这个
    localPath: localExists ? localFull : undefined,
    base64: wantBase64 ? fs.readFileSync(localFull).toString("base64") : undefined,
    mimeType,
    // {hasCover} 族
    hasCover: true,
    fileName,
    pickedFrom: wantBase64 ? "cdn_manifest+local" : "cdn_manifest",
    name: fileName,
  };
}

// ---------------------------------------------------------------- CLI 自测
// node asset_resolver.mjs <产物目录>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir] = process.argv.slice(2);
  if (!dir) {
    console.error("用法: node asset_resolver.mjs <产物目录>");
    process.exit(1);
  }
  const items = readManifestItems(path.join(dir, "cdn_manifest.json"));
  console.log(`清单条目数：${items.length}｜识别为封面：${items.filter(isCoverItem).length}`);
  console.log("最佳封面：", JSON.stringify(resolveCoverFromManifest(dir), null, 2));
}
