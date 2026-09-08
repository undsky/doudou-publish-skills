#!/usr/bin/env node
/**
 * receipt.mjs — 单平台发布回执落盘与终态校验公共库
 *
 * 设计目标：把「某平台是否已发布完成」从自然语言报告变成**可断言的落盘文件**。
 * 父级编排（doudou-UGC 步骤 9）只依据 `publishes/receipts/<skill>.json` 是否存在
 * 且其中每条 result 均为终态，来决定能否推进到下一个平台。
 *
 * 硬规约：无论成功、失败、待登录、跳过还是超时，技能收尾时**必须**写回执。
 *        缺失回执会让父级队列永久停在栅栏上等一个不会到来的信号。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SCHEMA_VERSION = 1;

/** 六个终态：只有这些状态允许写入回执 */
export const TERMINAL_STATUSES = Object.freeze([
  "success", // 草稿已保存并通过完成断言
  "ready_for_review", // 内容已填入就绪，平台禁止自动保存，待人工提交
  "needs_login", // 登录态缺失/过期，已保留页面待补登
  "failed", // 明确失败（选择器失效、注入异常等）
  "timeout", // 完成断言在超时窗口内未成立
  "skipped", // 资产缺失或用户主动跳过
]);

/** 汇总态优先级：数值越大越需要人工介入，用于计算 rollupStatus */
const STATUS_WEIGHT = Object.freeze({
  skipped: 0,
  success: 1,
  ready_for_review: 2,
  timeout: 3,
  needs_login: 4,
  failed: 5,
});

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

/** Markdown 路径 -> 产物同名目录 */
export function resolveArtifactDir(markdownFilePath) {
  const abs = path.resolve(markdownFilePath);
  return path.join(path.dirname(abs), path.basename(abs, path.extname(abs)));
}

export function resolvePublishesDir(markdownFilePath) {
  return path.join(resolveArtifactDir(markdownFilePath), "publishes");
}

export function resolveReceiptsDir(markdownFilePath) {
  return path.join(resolvePublishesDir(markdownFilePath), "receipts");
}

export function receiptPath(markdownFilePath, skill) {
  return path.join(resolveReceiptsDir(markdownFilePath), `${skill}.json`);
}

/** 统一截图命名：screenshots/<platformSlug>_<mode>.png */
export function screenshotRelPath(platformSlug, mode) {
  return `screenshots/${platformSlug}_${mode}.png`;
}

export function resolveScreenshotAbsPath(markdownFilePath, platformSlug, mode) {
  return path.join(
    resolvePublishesDir(markdownFilePath),
    screenshotRelPath(platformSlug, mode).replace("/", path.sep)
  );
}

/** 由逐模态结果计算技能级汇总态 */
export function rollupStatus(results) {
  if (!results.length) return "skipped";
  return results.reduce(
    (worst, r) =>
      STATUS_WEIGHT[r.status] > STATUS_WEIGHT[worst] ? r.status : worst,
    "skipped"
  );
}

function normalizeResult(raw, index) {
  const at = `results[${index}]`;
  if (!raw || typeof raw !== "object") throw new Error(`${at} 必须是对象`);
  const { mode, status } = raw;
  if (!mode) throw new Error(`${at}.mode 缺失`);
  if (!isTerminalStatus(status)) {
    throw new Error(
      `${at}.status="${status}" 不是终态，允许值：${TERMINAL_STATUSES.join(" / ")}`
    );
  }
  if (!raw.statusText) throw new Error(`${at}.statusText 缺失（需人类可读的状态说明）`);
  if (status !== "skipped" && !raw.screenshot) {
    throw new Error(`${at}.screenshot 缺失（非 skipped 状态必须留存证截图路径）`);
  }
  return {
    mode,
    modeDesc: raw.modeDesc ?? mode,
    status,
    statusText: raw.statusText,
    title: raw.title ?? null,
    draftId: raw.draftId ?? null,
    draftUrl: raw.draftUrl ?? null,
    screenshot: raw.screenshot ?? null,
    assertion: raw.assertion ?? null,
    reason: raw.reason ?? null,
  };
}

/** 原子写入：先写临时文件再 rename，避免父级读到半截 JSON */
function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * 写入单平台回执（技能收尾必调）
 * @returns {{receiptPath: string, receipt: object}}
 */
export function writeReceipt({
  markdownFilePath,
  skill,
  platform,
  platformSlug,
  results,
  startedAt,
  finishedAt = new Date().toISOString(),
  notes = null,
}) {
  if (!markdownFilePath) throw new Error("markdownFilePath 缺失");
  if (!skill) throw new Error("skill 缺失");
  if (!platform) throw new Error("platform 缺失");
  if (!Array.isArray(results) || !results.length) {
    throw new Error("results 至少需要一条逐模态终态记录");
  }
  const normalized = results.map(normalizeResult);
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    skill,
    platform,
    platformSlug: platformSlug ?? skill.replace(/^doudou-/, ""),
    rollupStatus: rollupStatus(normalized),
    startedAt: startedAt ?? null,
    finishedAt,
    durationMs:
      startedAt && finishedAt
        ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
        : null,
    notes,
    results: normalized,
  };
  const target = receiptPath(markdownFilePath, skill);
  atomicWriteJson(target, receipt);
  return { receiptPath: target, receipt };
}

export function readReceipt(markdownFilePath, skill) {
  const target = receiptPath(markdownFilePath, skill);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}

/** 父级栅栏判据：回执存在且每条 result 均为终态 */
export function hasTerminalReceipt(markdownFilePath, skill) {
  const receipt = readReceipt(markdownFilePath, skill);
  return Boolean(
    receipt &&
      Array.isArray(receipt.results) &&
      receipt.results.length &&
      receipt.results.every((r) => isTerminalStatus(r.status))
  );
}

// ---------------------------------------------------------------- CLI
// 写入： node receipt.mjs write <md> --payload '<json>'   (或 --payload-file <path>)
// 校验： node receipt.mjs check <md> <skill>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, mdPath, ...rest] = process.argv.slice(2);
  const argOf = (flag) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  try {
    if (cmd === "write") {
      const inline = argOf("--payload");
      const fromFile = argOf("--payload-file");
      if (!inline && !fromFile) throw new Error("需要 --payload 或 --payload-file");
      let rawJson;
      if (inline) {
        rawJson = inline;
      } else {
        let filePath = path.resolve(fromFile);
        if (!fs.existsSync(filePath)) {
          // 智能兼容：优先在 Markdown 对应的同名资产目录下寻找临时 payload 文件
          const inArtifactDir = path.join(resolveArtifactDir(mdPath), fromFile);
          if (fs.existsSync(inArtifactDir)) {
            filePath = inArtifactDir;
          }
        }
        if (!fs.existsSync(filePath)) {
          throw new Error(`找不到 payload 文件: ${fromFile}（亦不在同名资产目录 ${resolveArtifactDir(mdPath)} 中）`);
        }
        rawJson = fs.readFileSync(filePath, "utf8");
      }
      const payload = JSON.parse(rawJson);
      const { receiptPath: p, receipt } = writeReceipt({
        markdownFilePath: mdPath,
        ...payload,
      });
      console.log(`✅ 回执已落盘：${p}`);
      console.log(`   汇总态：${receipt.rollupStatus}｜模态数：${receipt.results.length}`);
    } else if (cmd === "check") {
      const skill = rest[0];
      const ok = hasTerminalReceipt(mdPath, skill);
      console.log(JSON.stringify({ skill, terminal: ok, receipt: readReceipt(mdPath, skill) }, null, 2));
      if (!ok) process.exit(1);
    } else {
      console.log("用法: node receipt.mjs write <md> --payload '<json>' | check <md> <skill>");
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
