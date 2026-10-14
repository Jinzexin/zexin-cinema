// 构建后处理：为经典 Cloudflare Pages (_worker.js 模式) 准备部署目录
// 用法: node scripts/prepare-pages.mjs
import { cpSync, renameSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const src = ".open-next";
const out = "pages-dist";

// 1. 复制 .open-next 到 pages-dist
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

// 2. worker.js → _worker.js（经典 Pages 约定）
renameSync(join(out, "worker.js"), join(out, "_worker.js"));

// 3. 静态资源提到根目录（否则 /_next/static 全部 404 → 白屏）
cpSync(join(out, "assets"), out, { recursive: true });

// 4. 注入 ASSETS 静态托管补丁：
//    经典 Pages 的 _worker.js 模式下所有请求都进 Worker，
//    需要先尝试 env.ASSETS.fetch 提供静态文件（仅 GET/HEAD），404 才走 SSR
const workerPath = join(out, "_worker.js");
let code = readFileSync(workerPath, "utf8");
const anchor = `    async fetch(request, env, ctx) {
        return runWithCloudflareRequestContext(request, env, ctx, async () => {`;
const patched = `    async fetch(request, env, ctx) {
        if (env.ASSETS && (request.method === "GET" || request.method === "HEAD")) {
            const assetResponse = await env.ASSETS.fetch(request);
            if (assetResponse.status !== 404) {
                return assetResponse;
            }
        }
        return runWithCloudflareRequestContext(request, env, ctx, async () => {`;
if (!code.includes(patched)) {
  if (!code.includes(anchor)) {
    console.error("[prepare-pages] 未找到注入锚点，_worker.js 结构可能已变化");
    process.exit(1);
  }
  code = code.replace(anchor, patched);
  writeFileSync(workerPath, code, "utf8");
}
console.log("[prepare-pages] pages-dist 就绪（含 ASSETS 静态托管补丁）");