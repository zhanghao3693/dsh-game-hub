#!/usr/bin/env node
/**
 * 把 src/ 下的各个模块拼成一个 dist/client.js。
 *
 * 为什么不用打包器：DSH 的客户端插件走 window.__ModuleLoader__.load()，
 * 宿主只认一个 factory 函数，没有 import/require 其它文件的通道。加 esbuild
 * 只是为了一次字符串拼接，不值得多一层依赖 —— 直接按顺序拼，每个模块自己
 * 用 IIFE 圈出作用域（defineGame 注册），互不污染。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.join(ROOT, "src");

/* 拼接顺序就是依赖顺序：框架先，游戏按目录里名字排序，外壳最后 */
function collect(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => path.join(dir, f));
}

const framework = collect(path.join(SRC, "core"));
const games = collect(path.join(SRC, "games"));
const legacy = collect(path.join(SRC, "legacy"));
const shell = collect(path.join(SRC, "shell"));

const parts = [
  ...framework.map((f) => ({ f, tag: "core" })),
  ...games.map((f) => ({ f, tag: "game" })),
  ...legacy.map((f) => ({ f, tag: "legacy" })),
  ...shell.map((f) => ({ f, tag: "shell" })),
];

let body = "";
let total = 0;
for (const { f, tag } of parts) {
  const code = fs.readFileSync(f, "utf8").replace(/\s+$/, "");
  total += code.length;
  body += `\n/* ================= ${tag}/${path.basename(f)} ================= */\n${code}\n`;
}

const out = `/* dsh-game-hub · 自动生成，勿手改；改 src/ 后跑 node tools/build.mjs */
window.__ModuleLoader__.load({
  id: "dsh-game-hub",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    /* 迁入的旧游戏正文里直接引用这些名字，外壳也用同一套，统一在这里取一次 */
    const { useState, useRef, useEffect, useCallback, useMemo } = React;
${body}
    return module.exports;
  },
});
`;

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
const dest = path.join(ROOT, "dist", "client.js");
fs.writeFileSync(dest, out);
console.log(
  `built ${path.relative(ROOT, dest)}  ${parts.length} modules  ${(total / 1024).toFixed(1)} KB src → ${(out.length / 1024).toFixed(1)} KB out`,
);
