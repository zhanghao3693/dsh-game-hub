#!/usr/bin/env node
/**
 * 把三国志与弹珠台两个旧插件的 client.js 正文搬进 src/legacy/。
 *
 * 思路：不做任何"重写"，只做三处外科手术，其余 3000+ 行原样保留 ——
 * 那两个游戏是经过实测调参的（AI 平衡、城防系数），重写等于把验证过的
 * 数值全部丢掉重跑。
 *
 *   1. `const [open, setOpen] = useState(false)` → `useState(true)`
 *      游戏一挂载就是"展开"态，外壳负责什么时候挂载/卸载它。
 *   2. 关闭按钮 `setOpen(false)` → `onExit()`，交还给外壳。
 *   3. 组件名加 Game 后缀并接收 `{ onExit }`。
 *
 * 第 1 步是整套方案的关键：`open` 恒为 true 之后，两个组件里原本的
 * FAB 分支（`if (!open)`、`!open ? ... : ...`）自然变成不可达代码，
 * 于是不用删任何 JSX 就实现了"旧按钮消失"，也就不可能删错括号。
 *
 * 旧文件里的 root/panel 是 position:fixed 的浮层，交给 shell.css 用
 * `.gc-panel .tk3k-root{position:static}` 之类的规则压平 —— 用 CSS 覆盖
 * 而不是改旧 CSS，同理是为了零风险。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PLUGINS = path.resolve(ROOT, "..");
const OUT = path.join(ROOT, "src", "legacy");

/** 按标记句（含）切出正文，避免手数行号 —— 行号会随旧文件改动漂移 */
function sliceBetween(text, startNeedle, endNeedle) {
  const a = text.indexOf(startNeedle);
  if (a < 0) throw new Error(`找不到起始标记：${startNeedle}`);
  const b = text.indexOf(endNeedle, a);
  if (b < 0) throw new Error(`找不到结束标记：${endNeedle}`);
  return text.slice(a, b);
}

function must(text, needle, why) {
  if (!text.includes(needle)) throw new Error(`迁移失败（${why}）：缺少 ${JSON.stringify(needle)}`);
}

/** 三国志：正文从「常量」注释起，到注册段之前止 */
function threeKingdomsBody(src) {
  return sliceBetween(
    src,
    "    /* ------------------------------------------------------------------ 常量 */",
    "    /* ---------------------------------------------------------------- 插件 */",
  );
}

/** 弹珠台：正文从 hooks 解构起（保留 h 的定义），到「注册」段之前止 */
function pinballBody(src) {
  return sliceBetween(
    src,
    "    const h = React.createElement;",
    "    /* ------------------------------------------------------------ 注册 */",
  );
}

/**
 * 统一的三处手术。
 * @param {string} body
 * @param {string} oldName 旧组件名
 * @param {string} newName 新组件名
 * @param {string} closeNeedle 关闭按钮那一段 onClick 原文
 */
function operate(body, oldName, newName, closeNeedle) {
  const out = body
    .replace(
      `function ${oldName}() {`,
      `function ${newName}({ onExit }) {`,
    )
    .replace(
      "const [open, setOpen] = useState(false);",
      "/* 由外壳决定挂载时机：一进来就是展开态，open 恒真让旧 FAB 分支变成死代码 */\n      const [open, setOpen] = useState(true);",
    )
    .replace(closeNeedle, closeNeedle.replace("() => setOpen(false)", "() => onExit && onExit()"));

  must(out, `function ${newName}({ onExit }) {`, `${newName} 改名`);
  must(out, "useState(true)", `${newName} 初始展开`);
  if (!out.includes("onExit && onExit()")) {
    throw new Error(`迁移失败（${newName} 关闭按钮）：${closeNeedle} 未命中`);
  }
  return out;
}

/**
 * 套上 IIFE 导出组件，并附一段迁移说明。
 * 顺便把 internals 也抛出来：无头测试要直接调内核（调将、AI 预演），
 * 只留组件就没法在 Node 里验证规则。
 */
function wrap(body, newName, note, internals) {
  return `/* ============================================================================
 * ${note}
 *
 * ⚠ 本文件由 tools/import-legacy.mjs 从旧插件 client.js 自动生成，勿手改。
 *   改游戏内核请改旧插件源文件，然后重跑 tools/import-legacy.mjs。
 *   这里只做了三处手术：组件改名收 onExit、open 初值改 true、关闭按钮接外壳。
 * ========================================================================== */

const ${newName} = (function legacyScope() {
${body}
  /* 内核函数都在这个 IIFE 的作用域里，顺手打包出来供测试直接调用 */
  return {
    component: ${newName},
    internals: { ${internals.join(", ")} },
  };
})();
`;
}

// --- 三国志 ---
const tkSrc = fs.readFileSync(
  path.join(PLUGINS, "three-kingdoms-strategy", "client.js"),
  "utf8",
);
let tkBody = threeKingdomsBody(tkSrc);
tkBody = operate(
  tkBody,
  "ThreeKingdomsOverlay",
  "ThreeKingdomsGame",
  'onClick: () => setOpen(false), title: "收起"',
);

// --- 弹珠台 ---
const npSrc = fs.readFileSync(path.join(PLUGINS, "nokia-pinball", "client.js"), "utf8");
let npBody = pinballBody(npSrc);
npBody = operate(
  npBody,
  "PinballOverlay",
  "PinballGame",
  "onClick: () => setOpen(false) }",
);

fs.mkdirSync(OUT, { recursive: true });
const files = [
  [
    "10-three-kingdoms.js",
    wrap(
      tkBody,
      "ThreeKingdomsGame",
      "三国志 · 回合制战略（迁自 @local/three-kingdoms-strategy）",
      [
        "createGame",
        "doDomestic",
        "doRecruit",
        "doBattle",
        "doMoveGeneral",
        "aiTurn",
        "estimateAttack",
        "endTurn",
        "loadGame",
        "saveGame",
        "CITY_DEFS",
        "GENERAL_DEFS",
        "TACTICS",
        /* tunables 在旧文件里是个内联对象字面量，不是变量，只能原样抄进来 */
        `tunables: {
          AI_AGGRESSION, AI_MIN_SURVIVORS, AI_MIN_SEND, AI_MAX_ATTACKS, AI_DRAFT_THRESHOLD,
          WALL_DIV, WALL_DIV_DISCORD, FOOD_PER_CONSCRIPT, UPKEEP_DIV, DESERT_MORALE, DESERT_DIV,
        }`,
      ],
    ),
  ],
  [
    "20-pinball.js",
    wrap(npBody, "PinballGame", "诺基亚弹珠台（迁自 @local/nokia-pinball）", [
      "createGame",
      "restartGame",
      "launchBall",
      "step",
      "draw",
      "WALLS",
      "BUMPERS",
      "TARGETS",
      "W",
      "H",
      "BALL_R",
      "loadHi",
      "saveHi",
    ]),
  ],
];

for (const [name, code] of files) {
  const dest = path.join(OUT, name);
  fs.writeFileSync(dest, code);
  console.log(`  ${name.padEnd(22)} ${(code.length / 1024).toFixed(1)} KB  ${code.split("\n").length} 行`);
}
console.log("legacy 迁移完成 →，下一步跑 node tools/build.mjs");
