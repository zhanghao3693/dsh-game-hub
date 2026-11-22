/* @dpharness/dsh-game-hub · 自动生成，勿手改；改 src/ 后跑 node tools/build.mjs */
window.__ModuleLoader__.load({
  id: "@dpharness/dsh-game-hub",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    /* 迁入的旧游戏正文里直接引用这些名字，外壳也用同一套，统一在这里取一次 */
    const { useState, useRef, useEffect, useCallback, useMemo } = React;

/* ================= core/registry.js ================= */
/* ============================================================================
 * 注册表：每个游戏用 defineGame() 自报家门，外壳只认这张表。
 *
 * 为什么不用 import：DSH 的客户端插件只暴露一个 factory 函数，没有跨文件
 * 加载通道。build.mjs 把所有 src 文件拼进同一个函数体，所以这里的一个
 * 顶层数组就是全局唯一真相，游戏的声明顺序即加载顺序。
 * ========================================================================== */

const GAME_REGISTRY = [];

/** 各游戏暴露的纯函数内核（无头测试直调，不经过 React） */
const GAME_KERNELS = {};

function attachKernel(id, kernel) {
  GAME_KERNELS[id] = kernel;
}

/**
 * @param {object} def
 * @param {string} def.id       稳定 id（存档、路由都用它，别改）
 * @param {string} def.name     中文名
 * @param {string} def.sub      副标题 / 英文名
 * @param {string} def.icon     卡片上的字形（1-2 个字符，不依赖图片资源）
 * @param {string} def.desc     一句话说明
 * @param {string} def.tag      分类：经典 / 棋牌 / 战略
 * @param {string} [def.color]  卡片主题色
 * @param {Function} def.component  接收 { onExit } 的 React 组件
 * @param {number} [def.order]  排序权重，越小越靠前
 */
function defineGame(def) {
  if (!def || !def.id || !def.component) {
    throw new Error("defineGame 需要 id 与 component");
  }
  if (GAME_REGISTRY.some((g) => g.id === def.id)) {
    throw new Error(`游戏 id 重复：${def.id}`);
  }
  GAME_REGISTRY.push({ order: 100, color: "#7c8cff", ...def });
}

/** 按 order 再按名字排 —— 每次渲染都重新排，避免依赖声明顺序 */
function allGames() {
  return GAME_REGISTRY.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh"));
}

function gameById(id) {
  return GAME_REGISTRY.find((g) => g.id === id) || null;
}

/* ================= core/ui.js ================= */
/* ============================================================================
 * 游戏通用件：统一外观、键盘、主循环。
 *
 * 9 款游戏如果各写一遍 HUD、各挂一次 window keydown、各写一遍 rAF 循环，
 * 加起来就是 9 份重复代码 + 9 个没清干净的监听器。这里收成三个东西：
 *
 *   GameChrome  —— 外框（标题条 + HUD 数字 + 画布区 + 底栏按钮）
 *   useKeys     —— 带 isTyping 让位、自动解绑的键盘钩子
 *   useLoop     —— 固定步长的 rAF 循环，切走/卸载自动停
 * ========================================================================== */

const GC_GAME_CSS = `
.gc-game{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.gc-game-hud{flex:none;display:flex;align-items:center;gap:14px;padding:8px 14px;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.025));font-size:11px}
.gc-hud-cell{display:flex;flex-direction:column;gap:1px;min-width:0}
.gc-hud-cell b{font-size:9px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;
  color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gc-hud-cell span{font-size:13px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.gc-hud-sp{flex:1}
.gc-hud-btn{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:transparent;
  cursor:pointer;color:var(--dsw-alias-label-secondary,#a2a6ad);font-family:inherit;font-size:11.5px;
  padding:4px 10px;border-radius:7px;transition:background .12s,color .12s}
.gc-hud-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));
  color:var(--dsw-alias-label-primary,#eceef1)}

.gc-stage{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;
  justify-content:center;padding:12px;overflow:hidden}
.gc-stage canvas{display:block;touch-action:none;max-width:100%;max-height:100%;
  border-radius:10px;image-rendering:auto}

.gc-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:9px;background:rgba(10,10,14,.72);backdrop-filter:blur(3px);
  border-radius:10px;text-align:center;padding:20px;z-index:2}
.gc-overlay h3{margin:0;font-size:17px;font-weight:700;letter-spacing:.1em;color:#fff}
.gc-overlay p{margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,.72);max-width:300px}
.gc-overlay .gc-btn{color:#fff;border-color:rgba(255,255,255,.35)}
.gc-overlay .gc-btn:hover{background:rgba(255,255,255,.14)}
.gc-overlay .gc-btn.primary{background:var(--gc-accent);border-color:transparent}

.gc-foot{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px;
  border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.025));font-size:11px;
  color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gc-foot-sp{flex:1}
.gc-key{display:inline-block;padding:1px 5px;border-radius:4px;margin:0 1px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));
  background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.05));
  font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
`;

/* ------------------------------------------------------------ 键盘 */

/**
 * 绑定 window 键盘。
 * @param {object} handlers  { ArrowLeft: fn, " ": fn } 或 { down: {key:fn}, up: {key:fn} }
 * @param {boolean} active   为 false 时完全不挂监听
 *
 * key 一律归一化：` ` → Space 保持原样，ArrowUp/Enter 等直接用 e.key。
 * 焦点在输入框时 isTyping 会拦下 —— 否则在对话里打字会把蛇按死。
 */
function useKeys(active, handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!active) return undefined;
    const norm = (e) => {
      if (e.key === " ") return "Space";
      return e.key;
    };
    const onDown = (e) => {
      if (isTyping(e.target)) return;
      const h2 = ref.current || {};
      const k = norm(e);
      const fn = (h2.down && h2.down[k]) || (typeof h2[k] === "function" ? h2[k] : null);
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    const onUp = (e) => {
      if (isTyping(e.target)) return;
      const h2 = ref.current || {};
      const k = norm(e);
      const fn = h2.up && h2.up[k];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [active]);
}

/* ------------------------------------------------------------ 主循环 */

/**
 * 固定步长循环：逻辑按 step 秒稳定推进，渲染每帧一次。
 * 好处是不受显示器刷新率影响 —— 120Hz 屏上贪吃蛇不会跑两倍速。
 *
 * @param {boolean} active
 * @param {(dt:number)=>void} step  逻辑步进（dt 恒为 stepMs）
 * @param {(t:number)=>void} [draw] 每帧渲染
 * @param {number} [stepFps=60]     逻辑帧率
 */
function useLoop(active, step, draw, stepFps) {
  const stepRef = useRef(step);
  const drawRef = useRef(draw);
  stepRef.current = step;
  drawRef.current = draw;

  useEffect(() => {
    if (!active) return undefined;
    const stepMs = 1000 / (stepFps || 60);
    let raf = 0;
    let last = 0;
    let acc = 0;
    const tick = (now) => {
      if (!last) last = now;
      /* 切标签页回来时 now-last 可能是好几秒，钳一下避免瞬间跑几百步 */
      const delta = Math.min(200, now - last);
      last = now;
      acc += delta;
      let guard = 0;
      while (acc >= stepMs && guard < 8) {
        stepRef.current(stepMs / 1000);
        acc -= stepMs;
        guard += 1;
      }
      if (guard >= 8) acc = 0;
      if (drawRef.current) drawRef.current(now);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [active, stepFps]);
}

/* ------------------------------------------------------------ 外框 */

/**
 * 统一外框。hud 是 [{k,v}]；children 里放 canvas 或任意内容。
 * overlay 有值时盖一层遮罩（开始 / 结束 / 暂停）。
 */
function GameChrome({ hud, onRestart, children, footer, overlay }) {
  return h(
    "div",
    { className: "gc-game" },
    h(
      "div",
      { className: "gc-game-hud" },
      (hud || []).map((cell, i) =>
        h(
          "div",
          { className: "gc-hud-cell", key: i },
          h("b", null, cell.k),
          h("span", null, cell.v),
        ),
      ),
      h("span", { className: "gc-hud-sp" }),
      onRestart ? h("button", { type: "button", className: "gc-hud-btn", onClick: onRestart }, "重开") : null,
    ),
    h("div", { className: "gc-stage" }, children, overlay || null),
    footer
      ? h(
          "div",
          { className: "gc-foot" },
          footer,
          h("span", { className: "gc-foot-sp" }),
        )
      : null,
  );
}

/** 遮罩层：标题 + 说明 + 一到两个按钮 */
function GameOverlay({ title, lines, actions }) {
  return h(
    "div",
    { className: "gc-overlay" },
    h("h3", null, title),
    (lines || []).map((l, i) => h("p", { key: i }, l)),
    h(
      "div",
      { style: { display: "flex", gap: 8, marginTop: 4 } },
      (actions || []).map((a, i) =>
        h(
          "button",
          {
            key: i,
            type: "button",
            className: `gc-btn${a.primary ? " primary" : ""}`,
            onClick: a.onClick,
          },
          a.label,
        ),
      ),
    ),
  );
}

/* ------------------------------------------------------ 画布自适应尺寸 */

/**
 * 让 canvas 撑满 .gc-stage 且保持逻辑宽高比 —— 手机窄屏和宽桌面都能用。
 * 返回的 ref 挂到 canvas 上，内部用 ResizeObserver 跟随容器变化。
 */
function useFitCanvas(logicalW, logicalH) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.parentElement) return undefined;
    const box = cv.parentElement;
    const apply = () => {
      const pad = 12; /* 和 .gc-stage 的 padding 一致，留一点呼吸空间 */
      const availW = Math.max(80, box.clientWidth - pad * 2);
      const availH = Math.max(80, box.clientHeight - pad * 2);
      const scale = Math.min(availW / logicalW, availH / logicalH);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(logicalW * scale * dpr);
      cv.height = Math.round(logicalH * scale * dpr);
      cv.style.width = `${Math.round(logicalW * scale)}px`;
      cv.style.height = `${Math.round(logicalH * scale)}px`;
      const ctx = cv.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(scale * dpr, scale * dpr);
      }
      cv.__scale = scale;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(box);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [logicalW, logicalH]);
  return ref;
}

/** 从主题里取几个颜色，让 canvas 里的画面跟深浅色主题一致 */
function gcTheme() {
  const dark = !document.body || document.body.hasAttribute("data-ds-dark-theme");
  return dark
    ? {
        dark: true,
        bg: "#14161d",
        bg2: "#1b1e27",
        line: "rgba(255,255,255,.12)",
        fg: "#e8e8ea",
        dim: "rgba(232,232,234,.55)",
        accent: "#7c8cff",
        accent2: "#4fd1c5",
        warn: "#e8b64a",
        danger: "#e0887e",
      }
    : {
        dark: false,
        bg: "#eef0f4",
        bg2: "#e2e5ec",
        line: "rgba(0,0,0,.13)",
        fg: "#1a1c22",
        dim: "rgba(26,28,34,.55)",
        accent: "#4453c4",
        accent2: "#0e7c73",
        warn: "#8a6512",
        danger: "#b4362a",
      };
}

/* ================= core/util.js ================= */
/* ============================================================================
 * 共用小工具：本地存储、高分表、按键过滤、节流。
 * 所有游戏都从这里拿，避免每款游戏各写一份 localStorage try/catch。
 * ========================================================================== */

const GC_STORE_PREFIX = "dsh.game-hub";

function storeGet(key, fallback) {
  try {
    const raw = window.localStorage.getItem(`${GC_STORE_PREFIX}.${key}`);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function storeSet(key, value) {
  try {
    window.localStorage.setItem(`${GC_STORE_PREFIX}.${key}`, JSON.stringify(value));
  } catch (err) {
    /* 无痕模式 / 配额满：静默降级，不影响游戏本身 */
  }
}

function storeDel(key) {
  try {
    window.localStorage.removeItem(`${GC_STORE_PREFIX}.${key}`);
  } catch (err) {
    /* 同上 */
  }
}

/**
 * 高分榜：{ [gameId]: [{ score, name, at }] }
 * 只留前 10 名，避免存档无限膨胀。
 */
const HI_KEY = "hiscore";

function loadBoard(gameId) {
  const all = storeGet(HI_KEY, {});
  const list = all && Array.isArray(all[gameId]) ? all[gameId] : [];
  return list.slice(0, 10);
}

function saveScore(gameId, score, name) {
  if (!Number.isFinite(score)) return loadBoard(gameId);
  const list = loadBoard(gameId);
  list.push({ score: Math.round(score), name: name || "玩家", at: Date.now() });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 10);
  const all = storeGet(HI_KEY, {});
  all[gameId] = top;
  storeSet(HI_KEY, all);
  return top;
}

function bestScore(gameId) {
  const list = loadBoard(gameId);
  return list.length ? list[0].score : 0;
}

function clearBoard(gameId) {
  const all = storeGet(HI_KEY, {});
  delete all[gameId];
  storeSet(HI_KEY, all);
}

/* ------------------------------------------------------------------ 输入 */

/** 焦点在输入框里时不抢键盘 —— 否则在对话框打字会一直触发游戏操作 */
function isTyping(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

/** 数字千分位，棋盘类游戏的 HUD 到处在用 */
function pad(n, len) {
  let s = String(Math.max(0, Math.floor(n || 0)));
  while (s.length < len) s = "0" + s;
  return s;
}

function fmtNum(n) {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 矩形碰撞，打砖块 / 贪吃蛇 / 2048 都要 */
function hitRect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** 稳定的伪随机（seed 不变则序列不变），扫雷与 2048 开局用 */
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/* ================= game/100-xiangqi.js ================= */
/* ============================================================================
 * 中国象棋 —— 完整规则 + alpha-beta AI。
 *
 * 规则覆盖（这些细节最容易漏，漏了就不是象棋了）：
 *   · 馬绊马腿（走「日」字的拐点有子就走不动）
 *   · 相/象塞象眼，且不能过河
 *   · 仕/士、帥/將不能出九宫
 *   · 炮吃子必须隔一个炮架，不吃子时跟车一样走
 *   · 兵/卒只能向前，过河后才能横走，永不后退
 *   · 白脸将（两将同一直线且中间无子）非法 —— 走成这种局面等于送将
 *
 * AI 用 alpha-beta + 子力位置估值，三档深度 2/3/4，带时间预算兜底，
 * 不会因为局面复杂把界面卡死。
 * ========================================================================== */

const XQ_W = 9;
const XQ_H = 10;
const XQ_RED = 1;
const XQ_BLACK = 2;

/* 棋子用两位字符串：阵营 + 兵种。null 表示空 */
const XQ_CHAR = {
  rK: "帥", rA: "仕", rB: "相", rN: "馬", rR: "車", rC: "炮", rP: "兵",
  bK: "將", bA: "士", bB: "象", bN: "馬", bR: "車", bC: "砲", bP: "卒",
};

const XQ_VALUE = { K: 100000, R: 900, C: 450, N: 400, B: 200, A: 200, P: 100 };

const XQ_DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function xqIdx(x, y) {
  return y * XQ_W + x;
}
function xqXY(i) {
  return { x: i % XQ_W, y: Math.floor(i / XQ_W) };
}
function xqInside(x, y) {
  return x >= 0 && y >= 0 && x < XQ_W && y < XQ_H;
}
function xqSide(p) {
  return p ? (p[0] === "r" ? XQ_RED : XQ_BLACK) : 0;
}
function xqType(p) {
  return p ? p[1] : "";
}
function xqOther(side) {
  return side === XQ_RED ? XQ_BLACK : XQ_RED;
}

/** 开局：y=0 是黑方底线（画面上方），y=9 是红方底线 */
function xqNew() {
  const b = new Array(XQ_W * XQ_H).fill(null);
  const back = ["R", "N", "B", "A", "K", "A", "B", "N", "R"];
  for (let x = 0; x < 9; x += 1) {
    b[xqIdx(x, 0)] = "b" + back[x];
    b[xqIdx(x, 9)] = "r" + back[x];
  }
  b[xqIdx(1, 2)] = "bC";
  b[xqIdx(7, 2)] = "bC";
  b[xqIdx(1, 7)] = "rC";
  b[xqIdx(7, 7)] = "rC";
  for (const x of [0, 2, 4, 6, 8]) {
    b[xqIdx(x, 3)] = "bP";
    b[xqIdx(x, 6)] = "rP";
  }
  return { board: b, turn: XQ_RED, over: false, winner: 0, history: [] };
}

function xqInPalace(x, y, side) {
  if (x < 3 || x > 5) return false;
  return side === XQ_RED ? y >= 7 && y <= 9 : y >= 0 && y <= 2;
}

function xqOnOwnSide(y, side) {
  return side === XQ_RED ? y >= 5 : y <= 4;
}

/** 某方所有伪合法着法（不检查走完是否自将） */
function xqPseudoMoves(board, side) {
  const out = [];
  for (let i = 0; i < board.length; i += 1) {
    const p = board[i];
    if (!p || xqSide(p) !== side) continue;
    const { x, y } = xqXY(i);
    const t = p[1];
    const push = (nx, ny) => {
      if (!xqInside(nx, ny)) return false;
      const q = board[xqIdx(nx, ny)];
      if (q && xqSide(q) === side) return false;
      out.push({ from: i, to: xqIdx(nx, ny), cap: q });
      return !q;
    };

    if (t === "R" || t === "C") {
      for (const [dx, dy] of XQ_DIRS4) {
        let nx = x + dx;
        let ny = y + dy;
        let screen = false;
        while (xqInside(nx, ny)) {
          const q = board[xqIdx(nx, ny)];
          if (t === "R") {
            if (!q) out.push({ from: i, to: xqIdx(nx, ny), cap: null });
            else {
              if (xqSide(q) !== side) out.push({ from: i, to: xqIdx(nx, ny), cap: q });
              break;
            }
          } else {
            /* 炮：空格可走；遇到第一个子做炮架，越过它之后第一个子可吃 */
            if (!screen) {
              if (!q) out.push({ from: i, to: xqIdx(nx, ny), cap: null });
              else screen = true;
            } else if (q) {
              if (xqSide(q) !== side) out.push({ from: i, to: xqIdx(nx, ny), cap: q });
              break;
            }
          }
          nx += dx;
          ny += dy;
        }
      }
      continue;
    }

    if (t === "N") {
      /* 8 个「日」字点，拐点被占则对应两式都走不了 */
      const legs = [
        [0, -1, -1, -2], [0, -1, 1, -2],
        [0, 1, -1, 2], [0, 1, 1, 2],
        [-1, 0, -2, -1], [-1, 0, -2, 1],
        [1, 0, 2, -1], [1, 0, 2, 1],
      ];
      for (const [lx, ly, dx2, dy2] of legs) {
        if (board[xqIdx(x + lx, y + ly)]) continue;
        push(x + dx2, y + dy2);
      }
      continue;
    }

    if (t === "B") {
      const diags = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
      for (const [dx, dy] of diags) {
        const nx = x + dx;
        const ny = y + dy;
        if (!xqInside(nx, ny)) continue;
        if (!xqOnOwnSide(ny, side)) continue; /* 象不过河 */
        if (board[xqIdx(x + dx / 2, y + dy / 2)]) continue; /* 塞象眼 */
        push(nx, ny);
      }
      continue;
    }

    if (t === "A") {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!xqInPalace(nx, ny, side)) continue;
        push(nx, ny);
      }
      continue;
    }

    if (t === "K") {
      for (const [dx, dy] of XQ_DIRS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!xqInPalace(nx, ny, side)) continue;
        push(nx, ny);
      }
      continue;
    }

    if (t === "P") {
      const fwd = side === XQ_RED ? -1 : 1;
      push(x, y + fwd);
      /* 过河才能横走 */
      if (!xqOnOwnSide(y, side)) {
        push(x - 1, y);
        push(x + 1, y);
      }
      continue;
    }
  }
  return out;
}

/** 两将是否在同一列且中间无子（白脸将） */
function xqKingsFacing(board) {
  let rk = -1;
  let bk = -1;
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === "rK") rk = i;
    else if (board[i] === "bK") bk = i;
  }
  if (rk < 0 || bk < 0) return false;
  const rx = rk % XQ_W;
  const bx = bk % XQ_W;
  if (rx !== bx) return false;
  const ry = Math.floor(rk / XQ_W);
  const by = Math.floor(bk / XQ_W);
  const lo = Math.min(ry, by) + 1;
  const hi = Math.max(ry, by);
  for (let y = lo; y < hi; y += 1) {
    if (board[xqIdx(rx, y)]) return false;
  }
  return true;
}

/** 某方的将是否正被攻击 */
function xqInCheck(board, side) {
  const kingCode = side === XQ_RED ? "rK" : "bK";
  let ki = -1;
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === kingCode) {
      ki = i;
      break;
    }
  }
  if (ki < 0) return true; /* 将没了就是死 */
  const opp = xqOther(side);
  const moves = xqPseudoMoves(board, opp);
  for (const m of moves) {
    if (m.to === ki) return true;
  }
  /* 白脸将也等于被将 */
  return xqKingsFacing(board);
}

/** 试走一步，看自己是否被将军 */
function xqMoveLeavesCheck(board, mv, side) {
  const saved = board[mv.to];
  const moved = board[mv.from];
  board[mv.to] = moved;
  board[mv.from] = null;
  const bad = xqInCheck(board, side);
  board[mv.from] = moved;
  board[mv.to] = saved;
  return bad;
}

/** 合法着法（过滤送将/白脸将） */
function xqLegalMoves(board, side, pre) {
  const src = pre || xqPseudoMoves(board, side);
  const out = [];
  for (const m of src) {
    if (!xqMoveLeavesCheck(board, m, side)) out.push(m);
  }
  return out;
}

/** 纯函数落子，返回新 state */
function xqApply(state, mv) {
  const board = state.board.slice();
  const moving = board[mv.from];
  if (!moving) return state;
  board[mv.to] = moving;
  board[mv.from] = null;
  const history = state.history.concat([
    { from: mv.from, to: mv.to, piece: moving, cap: mv.cap || null },
  ]);
  const next = { ...state, board, history, turn: xqOther(state.turn) };
  /* 结算：对方无合法着法 = 被将死或困毙（象棋里困毙也算输） */
  const reply = xqLegalMoves(board, next.turn);
  if (!reply.length) {
    next.over = true;
    next.winner = state.turn;
  }
  return next;
}

/* ------------------------------------------------------------ AI */

/** 子力位置估值：兵越靠前越值钱，马炮居中更好 */
function xqPosBonus(p, x, y) {
  const t = p[1];
  const side = p[0] === "r" ? XQ_RED : XQ_BLACK;
  if (t === "P") {
    /* 红兵向上（y 减小）推进，过河后加分 */
    const adv = side === XQ_RED ? 6 - y : y - 3;
    return adv * 12 + (xqOnOwnSide(y, side) ? 0 : 45);
  }
  if (t === "N" || t === "C") {
    const cx = Math.abs(x - 4);
    const cy = Math.abs(y - 4.5);
    return Math.round((8 - cx) * 4 + (8 - cy) * 2);
  }
  if (t === "R") {
    return Math.round((8 - Math.abs(x - 4)) * 2);
  }
  return 0;
}

/** 从 side 视角的静态估值 */
function xqEval(board, side) {
  let score = 0;
  for (let i = 0; i < board.length; i += 1) {
    const p = board[i];
    if (!p) continue;
    const v = XQ_VALUE[p[1]] + xqPosBonus(p, i % XQ_W, Math.floor(i / XQ_W));
    if (xqSide(p) === side) score += v;
    else score -= v;
  }
  return score;
}

const XQ_NODES = { n: 0, deadline: 0 };

function xqNegamax(board, side, depth, alpha, beta) {
  XQ_NODES.n += 1;
  if ((XQ_NODES.n & 1023) === 0 && Date.now() > XQ_NODES.deadline) {
    /* 超时：直接返回静态估值，上层会拿已有最优解 */
    throw { timeout: true };
  }
  if (depth <= 0) return xqEval(board, side);

  const moves = xqLegalMoves(board, side);
  if (!moves.length) return -XQ_VALUE.K; /* 无着可走 = 输 */

  /* 简单排序：吃子优先 */
  const ordered = moves
    .map((m) => ({ m, k: m.cap ? XQ_VALUE[m.cap[1]] : 0 }))
    .sort((a, b) => b.k - a.k)
    .map((o) => o.m);

  let best = -Infinity;
  for (const mv of ordered) {
    const saved = board[mv.to];
    const moved = board[mv.from];
    board[mv.to] = moved;
    board[mv.from] = null;
    let v;
    try {
      v = -xqNegamax(board, xqOther(side), depth - 1, -beta, -alpha);
    } finally {
      board[mv.from] = moved;
      board[mv.to] = saved;
    }
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * AI 选着。
 * @param {object} state
 * @param {number} level 1=简单 2=普通 3=困难
 * @param {number} [budget] 思考时间预算（毫秒）。不传则用各档默认值。
 *   测试里传一个大预算，可让搜索跑满目标深度、不受机器负载影响；
 *   否则同样的局面在慢机上会提前超时截断，断言随之抖动。
 */
function xqAi(state, level, budget) {
  const lv = level || 2;
  const side = state.turn;
  const board = state.board.slice();
  const moves = xqLegalMoves(board, side);
  if (!moves.length) return null;

  /* 简单档：只看一步吃子 + 小随机，能陪练但不难赢 */
  if (lv === 1) {
    let best = null;
    let bestScore = -Infinity;
    for (const mv of moves) {
      let v = mv.cap ? XQ_VALUE[mv.cap[1]] : 0;
      v += Math.random() * 60;
      if (v > bestScore) {
        bestScore = v;
        best = mv;
      }
    }
    return best;
  }

  const maxDepth = lv >= 3 ? 4 : 3;
  XQ_NODES.deadline = Date.now() + (budget || (lv >= 3 ? 1400 : 700));

  /* 吃子价值高的先搜，能让剪枝早点生效 */
  const orderKey = (m) => (m.cap ? XQ_VALUE[m.cap[1]] : 0);
  moves.sort((a, b) => orderKey(b) - orderKey(a));

  /* 迭代加深：从浅到深逐层算，某层超时就退回上一层已完整算完的结果。
     旧写法是单层搜索 + 超时直接 break，会用「只算了一半的深度 4」跟「算完的
     深度 3」混着比，层内排序还只是吃子价值，导致困难档偶发输给简单档。 */
  let frontier = moves;
  let best = moves[0];
  let bestScores = null;
  let bestVal = -Infinity;

  for (let d = 2; d <= maxDepth; d += 1) {
    let alpha = -Infinity;
    let roundVal = -Infinity;
    let timedOut = false;
    const scored = [];
    for (const mv of frontier) {
      const saved = board[mv.to];
      const moved = board[mv.from];
      board[mv.to] = moved;
      board[mv.from] = null;
      XQ_NODES.n = 0;
      let v;
      try {
        v = -xqNegamax(board, xqOther(side), d - 1, -Infinity, -alpha);
      } catch (e) {
        board[mv.from] = moved;
        board[mv.to] = saved;
        if (e && e.timeout) {
          timedOut = true;
          break;
        }
        throw e;
      }
      board[mv.from] = moved;
      board[mv.to] = saved;
      scored.push({ mv, v });
      if (v > roundVal) roundVal = v;
      if (v > alpha) alpha = v;
    }
    if (timedOut) break; /* 半截结果不采纳，保留上一层 */

    scored.sort((a, b) => b.v - a.v);
    bestScores = scored;
    bestVal = roundVal;
    best = scored[0].mv;
    frontier = scored.map((x) => x.mv);
  }

  /* 同分（或几乎同分）之间随机挑一个，避免每局走出完全一样的棋 */
  if (bestScores && bestScores.length > 1) {
    const eps = lv >= 3 ? 6 : 12;
    const pool = bestScores.filter((x) => x.v >= bestVal - eps);
    best = pool[Math.floor(Math.random() * pool.length)].mv;
  }
  return best;
}

/* ------------------------------------------------------------ 组件 */

const XQ_CELL = 56;
const XQ_PAD = 34;
const XQ_CANVAS_W = XQ_PAD * 2 + XQ_CELL * (XQ_W - 1);
const XQ_CANVAS_H = XQ_PAD * 2 + XQ_CELL * (XQ_H - 1);

function XiangqiGame({ onExit }) {
  const [st, setSt] = useState(() => xqNew());
  const [level, setLevel] = useState(2);
  const [humanSide, setHumanSide] = useState(XQ_RED);
  const [selected, setSelected] = useState(-1);
  const [thinking, setThinking] = useState(false);
  const [legal, setLegal] = useState([]);
  const cvRef = useFitCanvas(XQ_CANVAS_W, XQ_CANVAS_H);

  const reset = useCallback((side, lv) => {
    const s = side === undefined ? humanSide : side;
    const l = lv === undefined ? level : lv;
    setHumanSide(s);
    setLevel(l);
    setSt(xqNew());
    setSelected(-1);
    setLegal([]);
    setThinking(false);
  }, [humanSide, level]);

  /* AI 回合 */
  useEffect(() => {
    if (st.over) return undefined;
    if (st.turn === humanSide) return undefined;
    setThinking(true);
    const timer = setTimeout(() => {
      setSt((prev) => {
        if (prev.over || prev.turn === humanSide) return prev;
        const mv = xqAi(prev, level);
        setThinking(false);
        if (!mv) return prev;
        return xqApply(prev, mv);
      });
    }, 60);
    return () => clearTimeout(timer);
  }, [st, humanSide, level]);

  const onDown = (e) => {
    if (st.over || st.turn !== humanSide) return;
    const cv = cvRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sc = cv.__scale || 1;
    const px = (e.clientX - rect.left) / sc;
    const py = (e.clientY - rect.top) / sc;
    const x = Math.round((px - XQ_PAD) / XQ_CELL);
    const y = Math.round((py - XQ_PAD) / XQ_CELL);
    if (!xqInside(x, y)) return;
    const idx = xqIdx(x, y);

    /* 已选中且点是合法目标 → 走子 */
    if (selected >= 0) {
      const mv = legal.find((m) => m.to === idx);
      if (mv) {
        setSt((prev) => xqApply(prev, mv));
        setSelected(-1);
        setLegal([]);
        return;
      }
    }
    /* 选自己的子 */
    const p = st.board[idx];
    if (p && xqSide(p) === humanSide) {
      setSelected(idx);
      setLegal(
        xqLegalMoves(st.board, humanSide).filter((m) => m.from === idx),
      );
      return;
    }
    setSelected(-1);
    setLegal([]);
  };

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const T = gcTheme();

    /* 底色：木纹 */
    ctx.fillStyle = T.dark ? "#2a2118" : "#e8d3a8";
    ctx.fillRect(0, 0, XQ_CANVAS_W, XQ_CANVAS_H);

    const lineColor = T.dark ? "rgba(232,211,168,.42)" : "rgba(70,45,20,.65)";
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.2;

    /* 横线 */
    for (let y = 0; y < XQ_H; y += 1) {
      const py = XQ_PAD + y * XQ_CELL;
      ctx.beginPath();
      ctx.moveTo(XQ_PAD, py);
      ctx.lineTo(XQ_PAD + (XQ_W - 1) * XQ_CELL, py);
      ctx.stroke();
    }
    /* 竖线：中间河界断开 */
    for (let x = 0; x < XQ_W; x += 1) {
      const px = XQ_PAD + x * XQ_CELL;
      if (x === 0 || x === XQ_W - 1) {
        ctx.beginPath();
        ctx.moveTo(px, XQ_PAD);
        ctx.lineTo(px, XQ_PAD + (XQ_H - 1) * XQ_CELL);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(px, XQ_PAD);
        ctx.lineTo(px, XQ_PAD + 4 * XQ_CELL);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px, XQ_PAD + 5 * XQ_CELL);
        ctx.lineTo(px, XQ_PAD + (XQ_H - 1) * XQ_CELL);
        ctx.stroke();
      }
    }

    /* 九宫斜线 */
    for (const [y0, y1] of [[0, 2], [7, 9]]) {
      ctx.beginPath();
      ctx.moveTo(XQ_PAD + 3 * XQ_CELL, XQ_PAD + y0 * XQ_CELL);
      ctx.lineTo(XQ_PAD + 5 * XQ_CELL, XQ_PAD + y1 * XQ_CELL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(XQ_PAD + 5 * XQ_CELL, XQ_PAD + y0 * XQ_CELL);
      ctx.lineTo(XQ_PAD + 3 * XQ_CELL, XQ_PAD + y1 * XQ_CELL);
      ctx.stroke();
    }

    /* 楚河汉界 */
    ctx.fillStyle = T.dark ? "rgba(232,211,168,.5)" : "rgba(70,45,20,.6)";
    ctx.font = "600 17px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("楚 河", XQ_PAD + 2 * XQ_CELL, XQ_PAD + 4.5 * XQ_CELL);
    ctx.fillText("漢 界", XQ_PAD + 6 * XQ_CELL, XQ_PAD + 4.5 * XQ_CELL);

    /* 合法落点提示 */
    for (const m of legal) {
      const { x, y } = xqXY(m.to);
      const px = XQ_PAD + x * XQ_CELL;
      const py = XQ_PAD + y * XQ_CELL;
      ctx.beginPath();
      ctx.arc(px, py, m.cap ? XQ_CELL * 0.42 : 7, 0, Math.PI * 2);
      if (m.cap) {
        ctx.strokeStyle = "rgba(224,90,70,.85)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(90,199,116,.55)";
        ctx.fill();
      }
    }

    /* 棋子 */
    for (let i = 0; i < st.board.length; i += 1) {
      const p = st.board[i];
      if (!p) continue;
      const { x, y } = xqXY(i);
      const px = XQ_PAD + x * XQ_CELL;
      const py = XQ_PAD + y * XQ_CELL;
      const r = XQ_CELL * 0.42;
      const isRed = p[0] === "r";

      /* 选中环 */
      if (i === selected) {
        ctx.strokeStyle = "#5ac774";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      const grad = ctx.createRadialGradient(px - r * 0.35, py - r * 0.4, r * 0.1, px, py, r);
      if (T.dark) {
        grad.addColorStop(0, isRed ? "#4a2a24" : "#2d2f36");
        grad.addColorStop(1, isRed ? "#2a1612" : "#17181d");
      } else {
        grad.addColorStop(0, "#fdf6e6");
        grad.addColorStop(1, "#e0cba2");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = T.dark
        ? isRed ? "rgba(224,120,100,.85)" : "rgba(150,160,180,.7)"
        : isRed ? "#b4362a" : "#2a2d36";
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = T.dark
        ? isRed ? "#f0a090" : "#c8cede"
        : isRed ? "#b4362a" : "#2a2d36";
      ctx.font = `700 ${Math.round(XQ_CELL * 0.46)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(XQ_CHAR[p] || "?", px, py + 1);
    }
    ctx.textBaseline = "alphabetic";

    if (st.over) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(0, 0, XQ_CANVAS_W, XQ_CANVAS_H);
      ctx.fillStyle = "#fff";
      ctx.font = "700 24px -apple-system,PingFang SC,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        st.winner === humanSide ? "你赢了" : "你被将死了",
        XQ_CANVAS_W / 2,
        XQ_CANVAS_H / 2,
      );
      ctx.textBaseline = "alphabetic";
    }
  }, [st, selected, legal, humanSide, cvRef]);

  useLoop(true, () => {}, draw, 30);

  const checked = !st.over && xqInCheck(st.board, st.turn);

  return h(
    GameChrome,
    {
      hud: [
        { k: "你", v: humanSide === XQ_RED ? "红" : "黑" },
        { k: "走子", v: String(st.history.length) },
        { k: "难度", v: ["", "简单", "普通", "困难"][level] },
        {
          k: "状态",
          v: st.over ? "结束" : thinking ? "AI 思考…" : checked ? "被将军" : "你的回合",
        },
      ],
      onRestart: () => reset(),
      overlay:
        st.over || st.history.length === 0
          ? h(GameOverlay, {
              title: st.over ? (st.winner === humanSide ? "你赢了" : "你被将死了") : "中国象棋",
              lines: st.over
                ? [`共走了 ${st.history.length} 步。`]
                : [
                    "点自己的子选中，再点绿点落子。",
                    "红先。困难档会算到 4 层。",
                  ],
              actions: [
                { label: "我执红（先手）", primary: humanSide === XQ_RED, onClick: () => reset(XQ_RED) },
                { label: "我执黑（后手）", primary: humanSide === XQ_BLACK, onClick: () => reset(XQ_BLACK) },
                { label: "简单", onClick: () => reset(humanSide, 1) },
                { label: "普通", onClick: () => reset(humanSide, 2) },
                { label: "困难", onClick: () => reset(humanSide, 3) },
              ],
            })
          : null,
    },
    h("canvas", { ref: cvRef, onPointerDown: onDown, style: { cursor: "pointer" } }),
    h("span", null, "点选自己的子 → 点绿点落子 · 红圈表示可吃子"),
  );
}

attachKernel("xiangqi", {
  W: XQ_W,
  H: XQ_H,
  RED: XQ_RED,
  BLACK: XQ_BLACK,
  newState: xqNew,
  pseudoMoves: xqPseudoMoves,
  legalMoves: xqLegalMoves,
  apply: xqApply,
  inCheck: xqInCheck,
  kingsFacing: xqKingsFacing,
  ai: xqAi,
  eval: xqEval,
  char: XQ_CHAR,
});

defineGame({
  id: "xiangqi",
  name: "中国象棋",
  sub: "XIANGQI",
  icon: "帥",
  tag: "棋牌",
  color: "#e0887e",
  desc: "完整规则（马腿、象眼、炮架、白脸将），AI 三档深度 2/3/4。",
  order: 100,
  component: XiangqiGame,
});

/* ================= game/110-guandan.js ================= */
/* ============================================================================
 * 掼蛋 —— 完整规则 + 3 个 AI 同场。
 *
 * 牌：两副共 108 张（含两小王两大王）。
 * 级牌：当前打哪一级，那一级的所有花色都升到 A 之上、王之下。
 * 逢人配：红桃级牌是万能牌，可当除大小王以外的任何牌。
 *
 * 牌型强弱（同一牌型比点数，炸弹通吃普通牌型）：
 *   单张 < 对子 < 三张 < 三带二 < 顺子(5) < 连对(3对) < 钢板(2个三张)
 *   炸弹：4张 < 5张 < 同花顺 < 6张 < 7张 < 8张 < 四大天王
 *
 * 升级：双上 +3、1/3 +2、1/4 +1；打过 A 才算通关。
 * ========================================================================== */

const GD_SUIT = ["♠", "♥", "♦", "♣"];
const GD_RN = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};

/** 牌型 id。>=10 都是炸弹类，可以压普通牌型 */
const GD_T = {
  SINGLE: 1, PAIR: 2, TRIPLE: 3, FULL: 4, STRAIGHT: 5, CONPAIR: 6, PLATE: 7,
  B4: 10, B5: 11, FLUSH: 12, B6: 13, B7: 14, B8: 15, KINGS: 20,
};

const GD_TNAME = {
  1: "单张", 2: "对子", 3: "三张", 4: "三带二", 5: "顺子", 6: "连对", 7: "钢板",
  10: "四炸", 11: "五炸", 12: "同花顺", 13: "六炸", 14: "七炸", 15: "八炸", 20: "四大天王",
};

const GD_SEATS = 4;
const GD_TEAM = (seat) => seat % 2; /* 0 和 2 一队，1 和 3 一队 */

/** 两副牌 108 张。r: 2..14 正常牌点，15 小王，16 大王；s: 0..3 花色，-1 王 */
function gdDeck() {
  const out = [];
  let id = 0;
  for (let d = 0; d < 2; d += 1) {
    for (let s = 0; s < 4; s += 1) {
      for (let r = 2; r <= 14; r += 1) out.push({ r, s, id: id++ });
    }
    out.push({ r: 15, s: -1, id: id++ });
    out.push({ r: 16, s: -1, id: id++ });
  }
  return out;
}

function gdIsJoker(c) {
  return c.r >= 15;
}

/** 逢人配：红桃级牌 */
function gdIsWild(c, level) {
  return c.s === 1 && c.r === level;
}

/** 比较用点数：大王18 > 小王17 > 级牌15 > A14 > K13 …… > 2 */
function gdVal(c, level) {
  if (c.r === 16) return 18;
  if (c.r === 15) return 17;
  if (c.r === level) return 15;
  return c.r;
}

function gdRankVal(r, level) {
  if (r === 16) return 18;
  if (r === 15) return 17;
  if (r === level) return 15;
  return r;
}

/** 顺子类窗口：A 可当 1 也可当 14 */
function gdWindows(len) {
  const out = [];
  for (let s = 1; s <= 14 - len + 1; s += 1) {
    const w = [];
    for (let i = 0; i < len; i += 1) {
      const p = s + i;
      w.push(p === 1 ? 14 : p);
    }
    out.push({ ranks: w, top: s === 1 ? len : s + len - 1 });
  }
  return out;
}

const GD_WIN5 = gdWindows(5);
const GD_WIN3 = gdWindows(3);
const GD_WIN2 = gdWindows(2);

/* ---------------------------------------------------------------- 牌型识别 */

/**
 * 识别一组牌是什么牌型。cards 可以含逢人配（自动当任意牌用）。
 * 返回 {type, key} 或 null。key 用于同型比较。
 */
function gdAnalyze(cards, level) {
  const n = cards.length;
  if (!n) return null;
  const wilds = [];
  const norm = [];
  for (const c of cards) {
    if (gdIsWild(c, level)) wilds.push(c);
    else norm.push(c);
  }
  const W = wilds.length;
  const cnt = new Map();
  for (const c of norm) cnt.set(c.r, (cnt.get(c.r) || 0) + 1);
  const ranks = [...cnt.keys()];
  const distinct = ranks.length;
  const lv = (r) => gdRankVal(r, level);

  /* 四大天王 */
  if (n === 4 && W === 0 && distinct === 2 && ranks[0] === 15 && ranks[1] === 16
    && cnt.get(15) === 2 && cnt.get(16) === 2) {
    return { type: GD_T.KINGS, key: 0 };
  }

  /* 炸弹：除逢人配外同点 */
  if (distinct === 1 && n >= 4 && n <= 8 && W <= n) {
    const r = ranks[0];
    if (r < 15) {
      const t = n === 4 ? GD_T.B4 : n === 5 ? GD_T.B5 : n === 6 ? GD_T.B6
        : n === 7 ? GD_T.B7 : GD_T.B8;
      return { type: t, key: lv(r) };
    }
    return null;
  }

  if (n === 1) return { type: GD_T.SINGLE, key: lv(cards[0].r) };

  if (n === 2) {
    if (distinct === 0) return { type: GD_T.PAIR, key: 15 }; /* 两张逢人配 = 一对级牌 */
    if (distinct === 1) return { type: GD_T.PAIR, key: lv(ranks[0]) };
    return null;
  }

  if (n === 3) {
    if (distinct === 0) return { type: GD_T.TRIPLE, key: 15 };
    if (distinct === 1 && W <= 2) return { type: GD_T.TRIPLE, key: lv(ranks[0]) };
    return null;
  }

  if (n === 5) {
    /* 三带二 */
    let best = null;
    for (const a of ranks) {
      for (const b of ranks) {
        if (a === b) continue;
        const ca = cnt.get(a);
        const cb = cnt.get(b);
        if (ca + cb + W !== 5) continue;
        if (Math.max(0, 3 - ca) + Math.max(0, 2 - cb) !== W) continue;
        const k = lv(a);
        if (!best || k > best.key) best = { type: GD_T.FULL, key: k };
      }
    }
    if (best) return best;

    /* 同花顺 */
    if (distinct >= 3 && norm.every((c) => !gdIsJoker(c))) {
      const suits = new Set(norm.map((c) => c.s));
      if (suits.size === 1) {
        for (const win of GD_WIN5) {
          const set = new Set(win.ranks);
          if (!ranks.every((r) => set.has(r))) continue;
          if (distinct + W !== 5) continue;
          return { type: GD_T.FLUSH, key: win.top };
        }
      }
    }

    /* 顺子 */
    if (distinct >= 3 && norm.every((c) => !gdIsJoker(c))) {
      for (const win of GD_WIN5) {
        const set = new Set(win.ranks);
        if (!ranks.every((r) => set.has(r))) continue;
        if (distinct + W !== 5) continue;
        return { type: GD_T.STRAIGHT, key: win.top };
      }
    }
    return null;
  }

  if (n === 6) {
    /* 钢板：两个连续点数各三张 */
    for (const win of GD_WIN2) {
      const [a, b] = win.ranks;
      if (ranks.some((r) => r !== a && r !== b)) continue;
      const ca = cnt.get(a) || 0;
      const cb = cnt.get(b) || 0;
      if (Math.max(0, 3 - ca) + Math.max(0, 3 - cb) !== W) continue;
      if (ca + cb + W !== 6) continue;
      return { type: GD_T.PLATE, key: win.top };
    }
    /* 连对：三个连续点数各两张 */
    for (const win of GD_WIN3) {
      const set = new Set(win.ranks);
      if (ranks.some((r) => !set.has(r))) continue;
      /* 每个点数最多两张，缺的由逢人配补（旧写法用 distinct + W 比 6，
         distinct 是「不同点数个数」(3)，永远对不上 6，连对因此从来识别不出来）。 */
      let ok = true;
      for (const r of win.ranks) {
        const c = cnt.get(r) || 0;
        if (c > 2) { ok = false; break; }
      }
      if (!ok) continue;
      let need = 0;
      for (const r of win.ranks) need += Math.max(0, 2 - (cnt.get(r) || 0));
      if (need !== W) continue;
      return { type: GD_T.CONPAIR, key: win.top };
    }
    return null;
  }

  return null;
}

/** a 能不能压 b（b 为空表示自由出牌） */
function gdBeats(a, b) {
  if (!a) return false;
  if (!b) return true;
  const ab = a.type >= 10;
  const bb = b.type >= 10;
  if (ab && bb) {
    if (a.type !== b.type) return a.type > b.type;
    return a.key > b.key;
  }
  if (ab) return true;
  if (bb) return false;
  return a.type === b.type && a.key > b.key;
}

/* ---------------------------------------------------------------- 出牌枚举 */

function gdSplit(hand, level) {
  const wilds = [];
  const byRank = new Map();
  for (const c of hand) {
    if (gdIsWild(c, level)) wilds.push(c);
    else {
      if (!byRank.has(c.r)) byRank.set(c.r, []);
      byRank.get(c.r).push(c);
    }
  }
  return { wilds, byRank };
}

/**
 * 枚举手牌所有可能的出牌。为了不爆量，只生成"每种牌型一档最省的形态"。
 * 返回 [{cards, type, key, size}]
 */
function gdGenPlays(hand, level) {
  const out = [];
  const seen = new Set();
  const { wilds, byRank } = gdSplit(hand, level);
  const W = wilds.length;
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  const add = (cards) => {
    if (!cards || cards.length !== cards.length) return;
    const ids = cards.map((c) => c.id).sort((a, b) => a - b).join(",");
    if (seen.has(ids)) return;
    const a = gdAnalyze(cards, level);
    if (!a) return;
    seen.add(ids);
    out.push({ cards, type: a.type, key: a.key, size: cards.length });
  };

  /* 单张 */
  for (const c of hand) add([c]);

  /* 对子 */
  for (const r of ranks) {
    const g = byRank.get(r);
    if (g.length >= 2) add([g[0], g[1]]);
    if (g.length >= 1 && W >= 1) add([g[0], wilds[0]]);
  }
  if (W >= 2) add([wilds[0], wilds[1]]);

  /* 三张 */
  for (const r of ranks) {
    const g = byRank.get(r);
    if (g.length >= 3) add([g[0], g[1], g[2]]);
    if (g.length >= 2 && W >= 1) add([g[0], g[1], wilds[0]]);
    if (g.length >= 1 && W >= 2) add([g[0], wilds[0], wilds[1]]);
  }

  /* 炸弹 4~8 张 */
  for (const r of ranks) {
    if (r >= 15) continue;
    const g = byRank.get(r);
    for (let size = 4; size <= 8; size += 1) {
      const needWild = Math.max(0, size - g.length);
      if (needWild > W) break;
      if (size > g.length + W) break;
      const useNat = Math.min(g.length, size);
      const cards = g.slice(0, useNat).concat(wilds.slice(0, size - useNat));
      if (cards.length === size) add(cards);
    }
  }

  /* 四大天王 */
  const big = hand.filter((c) => c.r === 16);
  const small = hand.filter((c) => c.r === 15);
  if (big.length === 2 && small.length === 2) add([big[0], big[1], small[0], small[1]]);

  /* 三带二 */
  for (const a of ranks) {
    const ga = byRank.get(a);
    for (const b of ranks) {
      if (a === b) continue;
      const gb = byRank.get(b);
      for (let useA = 3; useA >= 1; useA -= 1) {
        const needA = Math.max(0, useA - ga.length);
        if (useA > ga.length + W) continue;
        const cardsA = ga.slice(0, Math.min(ga.length, useA)).concat(wilds.slice(0, needA));
        if (cardsA.length !== useA) continue;
        const restW = W - needA;
        for (let useB = 2; useB >= 1; useB -= 1) {
          const needB = Math.max(0, useB - gb.length);
          if (needB > restW) continue;
          const cardsB = gb.slice(0, Math.min(gb.length, useB)).concat(wilds.slice(needA, needA + needB));
          if (cardsB.length !== useB) continue;
          add(cardsA.concat(cardsB));
        }
      }
    }
  }

  /* 顺子 / 同花顺 */
  for (const win of GD_WIN5) {
    /* 顺子 */
    {
      const picked = [];
      const usedW = [];
      let ok = true;
      for (const r of win.ranks) {
        const g = byRank.get(r) || [];
        if (g.length) picked.push(g[0]);
        else if (usedW.length < W) usedW.push(wilds[usedW.length]);
        else { ok = false; break; }
      }
      if (ok && picked.length + usedW.length === 5) add(picked.concat(usedW));
    }
    /* 同花顺：逐花色试 */
    for (let s = 0; s < 4; s += 1) {
      const picked = [];
      let usedW = 0;
      let ok = true;
      for (const r of win.ranks) {
        const g = (byRank.get(r) || []).filter((c) => c.s === s);
        if (g.length) picked.push(g[0]);
        else if (usedW < W) usedW += 1;
        else { ok = false; break; }
      }
      if (ok && picked.length + usedW === 5) add(picked.concat(wilds.slice(0, usedW)));
    }
  }

  /* 连对 */
  for (const win of GD_WIN3) {
    const picked = [];
    let usedW = 0;
    let ok = true;
    for (const r of win.ranks) {
      const g = byRank.get(r) || [];
      const take = Math.min(2, g.length);
      picked.push(...g.slice(0, take));
      const need = 2 - take;
      if (usedW + need > W) { ok = false; break; }
      usedW += need;
    }
    if (ok && picked.length + usedW === 6) add(picked.concat(wilds.slice(0, usedW)));
  }

  /* 钢板 */
  for (const win of GD_WIN2) {
    const picked = [];
    let usedW = 0;
    let ok = true;
    for (const r of win.ranks) {
      const g = byRank.get(r) || [];
      const take = Math.min(3, g.length);
      picked.push(...g.slice(0, take));
      const need = 3 - take;
      if (usedW + need > W) { ok = false; break; }
      usedW += need;
    }
    if (ok && picked.length + usedW === 6) add(picked.concat(wilds.slice(0, usedW)));
  }

  return out;
}

/** 手牌里能压过 last 的所有出牌 */
function gdResponses(hand, level, last) {
  const all = gdGenPlays(hand, level);
  return all.filter((p) => gdBeats(p, last));
}

/* ---------------------------------------------------------------- 对局状态 */

const GD_SEAT_NAME = ["你", "下家", "对家", "上家"];

function gdShuffle(deck) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = d[i];
    d[i] = d[j];
    d[j] = t;
  }
  return d;
}

function gdSortHand(hand, level) {
  return hand.slice().sort((a, b) => {
    if (a.r !== b.r) return gdVal(b, level) - gdVal(a, level);
    return a.s - b.s;
  });
}

/**
 * 开一局。
 * @param {[number,number]} levels 两队当前级别（0 队 = 座位 0/2，1 队 = 座位 1/3）
 * @param {number} level 本局级牌
 * @param {number} first 首出座位
 * @param {number} humanSeat 玩家座位
 */
function gdNewDeal(opts) {
  const o = opts || {};
  const level = o.level || 2;
  const deck = gdShuffle(gdDeck());
  const hands = [[], [], [], []];
  for (let i = 0; i < deck.length; i += 1) hands[i % 4].push(deck[i]);
  for (let s = 0; s < 4; s += 1) hands[s] = gdSortHand(hands[s], level);
  return {
    level,
    levels: o.levels || [level, level],
    hands,
    turn: typeof o.first === "number" ? o.first : 0,
    leadSeat: typeof o.first === "number" ? o.first : 0,
    lastPlay: null,
    pass: 0,
    out: [],
    phase: "play",
    log: [],
    tribute: null,
    humanSeat: typeof o.humanSeat === "number" ? o.humanSeat : 0,
    over: false,
    result: null,
  };
}

function gdActive(st) {
  const out = [];
  for (let s = 0; s < 4; s += 1) if (!st.out.includes(s) && st.hands[s].length > 0) out.push(s);
  return out;
}

function gdNextActive(st, seat) {
  for (let i = 1; i <= 4; i += 1) {
    const s = (seat + i) % 4;
    if (!st.out.includes(s) && st.hands[s].length > 0) return s;
  }
  return seat;
}

function gdPushLog(st, text) {
  st.log = st.log.concat([text]);
  if (st.log.length > 60) st.log = st.log.slice(-60);
}

/** 出牌。返回新 state（纯函数式浅拷贝） */
function gdPlay(st, seat, cards) {
  if (st.phase !== "play" || st.over) return st;
  if (st.turn !== seat) return st;
  const ids = new Set(cards.map((c) => c.id));
  const mine = st.hands[seat];
  if (![...ids].every((id) => mine.some((c) => c.id === id))) return st;
  const a = gdAnalyze(cards, st.level);
  if (!a) return st;
  if (st.lastPlay && st.lastPlay.seat !== seat) {
    if (!gdBeats({ type: a.type, key: a.key }, st.lastPlay)) return st;
  }
  const next = {
    ...st,
    hands: st.hands.map((h, i) => (i === seat ? h.filter((c) => !ids.has(c.id)) : h)),
    lastPlay: { seat, cards: cards.slice(), type: a.type, key: a.key, size: cards.length },
    pass: 0,
    /* 谁最后出牌谁就是本轮领出者：一轮三家全过之后把牌权交回给他。
       旧写法只在「领出人自己出完」时才改 leadSeat，导致 leadSeat 永远是
       开局那个人，一轮结束牌权总是还给他 —— 先手 20 局 20 胜。 */
    leadSeat: seat,
  };
  gdPushLog(next, `${GD_SEAT_NAME[seat]} 出 ${gdCardText(cards, next.level)}（${GD_TNAME[a.type]}）`);

  if (next.hands[seat].length === 0) {
    next.out = next.out.concat([seat]);
    gdPushLog(next, `${GD_SEAT_NAME[seat]} 出完了，第 ${next.out.length} 名`);
    if (next.out.length >= 3) {
      for (let s = 0; s < 4; s += 1) if (!next.out.includes(s)) next.out = next.out.concat([s]);
      return gdSettle(next);
    }
    /* 出完的人已经离场，牌权交给他下一位还在打的人 */
    if (next.out.includes(next.leadSeat)) {
      next.leadSeat = gdNextActive(next, seat);
      next.turn = next.leadSeat;
      return next;
    }
  }
  next.turn = gdNextActive(next, seat);
  return next;
}

function gdPass(st, seat) {
  if (st.phase !== "play" || st.over) return st;
  if (st.turn !== seat) return st;
  if (!st.lastPlay) return st; /* 领出不能过 */
  const next = { ...st, pass: st.pass + 1 };
  gdPushLog(next, `${GD_SEAT_NAME[seat]} 过`);
  const others = gdActive(next).length - 1;
  if (next.pass >= others) {
    /* 一轮结束，出牌者重新领出 */
    next.lastPlay = null;
    next.pass = 0;
    const lead = next.leadSeat;
    next.turn = next.out.includes(lead) ? gdNextActive(next, lead) : lead;
    if (next.out.includes(lead)) next.leadSeat = next.turn;
  } else {
    next.turn = gdNextActive(next, seat);
  }
  return next;
}

/* ---------------------------------------------------------------- 结算 + 进贡 */

function gdTeamOf(seat) {
  return seat % 2;
}

function gdSettle(st) {
  const out = st.out.slice();
  const first = out[0];
  const second = out[1];
  const last = out[3];
  const winTeam = gdTeamOf(first);
  const loseTeam = 1 - winTeam;
  const same = gdTeamOf(second) === winTeam;

  /* 1&4 时 second 是输家 —— 双上才是同队连坐 */
  const up = same ? 3 : gdTeamOf(out[2]) === winTeam ? 2 : 1;
  const levels = st.levels.slice();
  const before = levels[winTeam];
  let after = before + up;
  let finished = false;
  let stuckAtA = false;
  if (before >= 14) {
    /* 真规则：打 A 必须双下（双上）才能过 A 通关；
       赢成 1、3 或 1、4 都只能留在 A 继续打。 */
    if (same) {
      finished = true;
      after = 14;
    } else {
      after = 14;
      stuckAtA = true;
    }
  } else if (after > 14) {
    after = 14; /* 升级封顶在 A */
  }
  levels[winTeam] = after;

  const next = {
    ...st,
    over: true,
    phase: "done",
    levels,
    result: {
      out,
      winTeam,
      loseTeam,
      up,
      same,
      finished,
      stuckAtA,
      levelBefore: before,
      levelAfter: after,
      levels: levels.slice(),
    },
  };
  gdPushLog(
    next,
    `${winTeam === gdTeamOf(st.humanSeat) ? "你方" : "对方"}${same ? "双上" : "获胜"}，`
      + `${stuckAtA ? "打 A 未双下，留在 A" : `升 ${up} 级`}，${before} → ${after}`
      + `${finished ? "，过 A 通关！" : ""}`,
  );
  return next;
}

/** 下一局要打的级牌：赢方升级后的级别 */
function gdNextLevel(st) {
  if (!st.result) return st.level;
  const lv = (st.result.levels || st.levels || [])[st.result.winTeam];
  return typeof lv === "number" ? lv : st.level;
}

/**
 * 计算进贡需求。返回 null 表示抗贡或无需进贡。
 * 主流规则：双下 → 两个输家各进一张最大牌给两个赢家；1/3 或 1/4 → 末游进给头游。
 */
function gdTributeNeed(st, handsMaybe) {
  if (!st.result && !st.out) return null;
  const hands = handsMaybe || st.hands;
  const out = st.result ? st.result.out : st.out;
  if (st.result.same) {
    const winners = [out[0], out[1]];
    const losers = [out[2], out[3]];
    /* 抗贡：两个输家合计摸到两张大王 */
    let kings = 0;
    for (const s of losers) kings += hands[s].filter((c) => c.r === 16).length;
    if (kings >= 2) return { resist: true, winners, losers };
    return { resist: false, winners, losers, count: 2 };
  }
  const winner = out[0];
  const loser = out[3];
  const kings = hands[loser].filter((c) => c.r === 16).length;
  if (kings >= 2) return { resist: true, winners: [winner], losers: [loser] };
  return { resist: false, winners: [winner], losers: [loser], count: 1 };
}

/** 进贡牌：手里除红桃级牌外最大的一张 */
function gdTributeCard(hand, level) {
  let best = null;
  for (const c of hand) {
    if (gdIsWild(c, level)) continue;
    if (!best || gdVal(c, level) > gdVal(best, level)) best = c;
  }
  return best || hand[0];
}

/** 还贡牌：不大于 10 的最小牌（优先还最小） */
function gdReturnCard(hand, level) {
  const cand = hand.filter((c) => !gdIsWild(c, level) && c.r <= 10);
  const pool = cand.length ? cand : hand.filter((c) => !gdIsWild(c, level));
  const use = pool.length ? pool : hand;
  let best = use[0];
  for (const c of use) if (gdVal(c, level) < gdVal(best, level)) best = c;
  return best;
}

/**
 * 执行进贡（自动）：输家交出最大牌，赢家收下。
 * 还贡的牌由 gdReturnCard 自动选，人机一致的规则口径。
 * 返回 {hands: [[...]], log, first}
 */
function gdApplyTribute(hands, level, need) {
  const h = hands.map((x) => x.slice());
  const logs = [];
  if (!need || need.resist) {
    return { hands: h, logs: need ? ["抗贡，不进贡。"] : [], first: -1 };
  }
  const gives = [];
  for (const loser of need.losers) {
    const card = gdTributeCard(h[loser], level);
    if (!card) continue;
    h[loser] = h[loser].filter((c) => c.id !== card.id);
    gives.push({ loser, card });
  }
  /* 贡牌大的给头游 */
  gives.sort((a, b) => gdVal(b.card, level) - gdVal(a.card, level));
  const receivers = need.winners.slice();
  const pairs = [];
  for (let i = 0; i < gives.length; i += 1) {
    const giver = gives[i];
    const recv = receivers[Math.min(i, receivers.length - 1)];
    h[recv] = h[recv].concat([giver.card]);
    logs.push(`${GD_SEAT_NAME[giver.loser]} 进贡 ${gdCardText([giver.card], level)} 给 ${GD_SEAT_NAME[recv]}`);
    pairs.push({ giver: giver.loser, recv });
  }
  /* 还贡 */
  for (const p of pairs) {
    const back = gdReturnCard(h[p.recv], level);
    if (!back) continue;
    h[p.recv] = h[p.recv].filter((c) => c.id !== back.id);
    h[p.giver] = h[p.giver].concat([back]);
    logs.push(`${GD_SEAT_NAME[p.recv]} 还贡 ${gdCardText([back], level)} 给 ${GD_SEAT_NAME[p.giver]}`);
  }
  for (let s = 0; s < 4; s += 1) h[s] = gdSortHand(h[s], level);
  return { hands: h, logs, first: need.winners[0] };
}

/* ---------------------------------------------------------------- AI */

function gdHandCount(st, seat) {
  return st.hands[seat].length;
}

/** 对手里最少的牌数（判断要不要放炸弹） */
function gdMinOpponent(st, seat, level) {
  let min = 99;
  for (let s = 0; s < 4; s += 1) {
    if (s === seat) continue;
    if (gdTeamOf(s) === gdTeamOf(seat)) continue;
    if (st.out.includes(s)) continue;
    min = Math.min(min, st.hands[s].length);
  }
  return min;
}

const GD_AI_NAMES = ["稳", "狠", "算"];

/**
 * AI 决策。返回 {cards} 或 {pass:true}
 * level: 1 简单 / 2 普通 / 3 困难
 */
function gdAiDecide(st, seat, level) {
  const lv = level || 2;
  const hand = st.hands[seat];
  if (!hand.length) return { pass: true };
  const lead = !st.lastPlay || st.lastPlay.seat === seat;

  if (lead) {
    const plays = gdGenPlays(hand, st.level);
    if (!plays.length) return { pass: true };
    const oppMin = gdMinOpponent(st, seat, st.level);
    /* 能一把走完就一把走完 */
    const finisher = plays.filter((p) => p.cards.length === hand.length);
    if (finisher.length) {
      finisher.sort((a, b) => a.type - b.type);
      return { cards: finisher[0].cards };
    }
    /* 领出优先甩长牌型、先小后大；炸弹留到收尾 */
    const normal = plays.filter((p) => p.type < 10);
    const pool = normal.length ? normal : plays;
    pool.sort((a, b) => {
      if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
      return a.key - b.key;
    });
    if (lv === 1) return { cards: pool[Math.floor(Math.random() * pool.length)].cards };
    /* 普通/困难：对手快出完时改用能压住对方的最强牌型 */
    if (oppMin <= 2 && normal.length) {
      const bombs = plays.filter((p) => p.type >= 10);
      if (bombs.length && lv >= 3) {
        bombs.sort((a, b) => a.type - b.type || a.key - b.key);
        return { cards: bombs[0].cards };
      }
    }
    return { cards: pool[0].cards };
  }

  const last = st.lastPlay;
  const sameTeam = gdTeamOf(last.seat) === gdTeamOf(seat);
  const resps = gdResponses(hand, st.level, last);
  if (!resps.length) return { pass: true };

  /* 能出完就出完 */
  const finisher = resps.filter((p) => p.cards.length === hand.length);
  if (finisher.length) return { cards: finisher[0].cards };

  /* 队友在领出，一般让过，除非队友的牌很小而自己有大牌可以抢回主动 */
  if (sameTeam) {
    if (lv >= 3 && last.size <= 2 && resps.some((p) => p.type < 10 && p.key > last.key + 3)) {
      const cheap = resps.filter((p) => p.type < 10).sort((a, b) => a.key - b.key);
      if (cheap.length) return { cards: cheap[0].cards };
    }
    return { pass: true };
  }

  const normal = resps.filter((p) => p.type < 10).sort((a, b) => a.key - b.key || a.cards.length - b.cards.length);
  if (normal.length) {
    /* 简单档随便压一张 */
    if (lv === 1) return { cards: normal[Math.floor(Math.random() * Math.min(3, normal.length))].cards };
    return { cards: normal[0].cards };
  }

  /* 只剩炸弹可用 */
  const bombs = resps.sort((a, b) => a.type - b.type || a.key - b.key);
  const oppMin = gdMinOpponent(st, seat, st.level);
  const myCount = hand.length;
  const worth = oppMin <= 4 || myCount <= 8 || last.size >= 5 || lv >= 3;
  if (!worth) return { pass: true };
  return { cards: bombs[0].cards };
}

/* ---------------------------------------------------------------- 文本 */

function gdCardText(cards, level) {
  return cards
    .slice()
    .sort((a, b) => gdVal(b, level) - gdVal(a, level))
    .map((c) => {
      if (c.r === 16) return "大王";
      if (c.r === 15) return "小王";
      return GD_SUIT[c.s] + GD_RN[c.r];
    })
    .join(" ");
}

function gdCardColor(c, dark) {
  if (c.r === 16) return dark ? "#f0b0b0" : "#c0392b";
  if (c.r === 15) return dark ? "#d8d8e0" : "#3a3a44";
  if (c.s === 1 || c.s === 2) return dark ? "#f08878" : "#c0392b";
  return dark ? "#dfe3ee" : "#22262e";
}

/* ---------------------------------------------------------------- 对局推进 */

/**
 * 开下一局：接上一局的升级与进贡。
 * prevSt 为上一局已结算的状态；没有就是首局。
 */
function gdStartDeal(prevSt, humanSeat, keepLevels) {
  const hs = typeof humanSeat === "number" ? humanSeat : 0;
  let levels = [2, 2];
  let level = 2;
  let first = 0;
  let prevResult = null;

  if (prevSt && prevSt.result) {
    prevResult = prevSt.result;
    if (prevResult.finished) {
      levels = [2, 2];
      level = 2;
      first = 0;
    } else {
      levels = (prevResult.levels || prevSt.levels || [2, 2]).slice();
      level = gdNextLevel(prevSt);
      first = prevResult.out[0];
    }
  } else if (keepLevels) {
    levels = keepLevels.slice();
    level = levels[0];
  }

  /* 先发牌，再判进贡：抗贡要看的是「这一局新摸到的手牌里有没有两张大王」，
     拿上一局已经打空的手牌去判永远不会抗贡。 */
  let st = gdNewDeal({ level, levels, first, humanSeat: hs });
  if (!prevResult || prevResult.finished) return st;

  const need = gdTributeNeed({ result: prevResult }, st.hands);
  if (!need) return st;

  if (need.resist) {
    const logs = ["抗贡，不进贡。"];
    return { ...st, tribute: { need, logs }, log: logs.slice() };
  }
  const r = gdApplyTribute(st.hands, level, need);
  return {
    ...st,
    hands: r.hands,
    tribute: { need, logs: r.logs },
    log: r.logs.slice(),
    turn: r.first,
    leadSeat: r.first,
  };
}

/** 某个座位最后一句日志 */
function gdSeatTip(st, seat) {
  const name = GD_SEAT_NAME[seat];
  for (let i = st.log.length - 1; i >= 0; i -= 1) {
    const line = st.log[i];
    if (line.slice(0, name.length + 1) === name + " ") return line.slice(name.length + 1);
  }
  return "";
}

/* ---------------------------------------------------------------- 界面 */

const GD_CSS = `
.gd-wrap{width:100%;height:100%;display:flex;flex-direction:column;min-height:0;gap:5px;font-size:12px}
.gd-opps{display:flex;gap:8px;flex:none}
.gd-opp{display:flex;flex-direction:column;align-items:center;gap:3px;flex:1 1 0;min-width:0}
.gd-opp-name{font-size:10.5px;letter-spacing:.14em;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gd-opp-name.on{color:var(--gc-accent);font-weight:700}
.gd-cnt{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));font-variant-numeric:tabular-nums}
.gd-tip{font-size:10.5px;min-height:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gd-mid{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:7px;overflow:hidden}
.gd-lv{display:inline-flex;align-items:center;gap:8px;padding:3px 12px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));font-size:11px}
.gd-lv b{font-weight:700;font-variant-numeric:tabular-nums}
.gd-lv .me{color:var(--gc-accent)}
.gd-lv .foe{color:var(--gc-warn,#e8b64a)}
.gd-last{display:flex;align-items:center;gap:8px;min-height:46px}
.gd-lastlbl{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gd-msg{font-size:11.5px;min-height:15px;color:var(--gc-warn,#e8b64a)}
.gd-hand{display:flex;justify-content:center;padding:12px 2px 0;flex:none;min-height:62px}
.gd-card{position:relative;width:34px;height:48px;border-radius:5px;flex:none;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
  background:linear-gradient(160deg,#fefefe,#e4e7ef);border:1px solid rgba(0,0,0,.28);
  font-weight:700;line-height:1;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,.32);
  transition:transform .1s ease,box-shadow .1s ease}
.gd-card+.gd-card{margin-left:-9px}
.gd-card:hover{transform:translateY(-5px)}
.gd-card.sel{transform:translateY(-14px);border-color:var(--gc-accent);
  box-shadow:0 5px 14px rgba(124,140,255,.55)}
.gd-card.wild{border-color:#d9a520;box-shadow:0 0 0 2px rgba(232,182,74,.75)}
.gd-card.wild.sel{box-shadow:0 5px 14px rgba(124,140,255,.55),0 0 0 2px rgba(232,182,74,.9)}
.gd-card .r{font-size:13px}
.gd-card .s{font-size:10px;margin-top:-1px}
.gd-card .big{font-size:9.5px;letter-spacing:-.04em}
.gd-card.mini{width:26px;height:37px;cursor:default;opacity:.92}
.gd-card.mini .r{font-size:10.5px}
.gd-card.mini .s{font-size:8px}
.gd-card.mini+.gd-card.mini{margin-left:-7px}
.gd-back{width:18px;height:26px;border-radius:3px;flex:none;
  background:linear-gradient(150deg,#3d4d92,#1e2650);border:1px solid rgba(255,255,255,.16)}
.gd-backs{display:flex}
.gd-backs .gd-back+.gd-back{margin-left:-11px}
.gd-act{display:flex;gap:8px;justify-content:center;flex:none;padding:2px 0}
.gd-tribute{font-size:10.5px;line-height:1.5;max-width:420px;text-align:center;
  color:var(--dsw-alias-label-tertiary,#8b8f98)}
`;

function gdCardEl(c, level, opts) {
  const o = opts || {};
  const txt = c.r === 16 ? "大王" : c.r === 15 ? "小王" : GD_RN[c.r];
  const small = c.r >= 15;
  return h(
    "div",
    {
      key: o.key === undefined ? c.id : o.key,
      className: `gd-card${o.sel ? " sel" : ""}${gdIsWild(c, level) ? " wild" : ""}${o.mini ? " mini" : ""}`,
      style: { color: gdCardColor(c, false) },
      onClick: o.onClick || undefined,
      title: gdIsWild(c, level) ? "红桃级牌（逢人配）" : undefined,
    },
    small
      ? h("span", { className: "big" }, txt)
      : [
          h("span", { className: "r", key: "r" }, txt),
          h("span", { className: "s", key: "s" }, GD_SUIT[c.s]),
        ],
  );
}

function GuandanGame({ onExit }) {
  const HUMAN = 0;
  const [diff, setDiff] = useState(2);
  const [st, setSt] = useState(() => gdStartDeal(null, HUMAN));
  const [sel, setSel] = useState([]);
  const [msg, setMsg] = useState("");
  const [hintIdx, setHintIdx] = useState(0);
  const aiLv = diff <= 1 ? [1, 1, 1] : diff === 2 ? [2, 2, 2] : [2, 3, 3];

  /* 座位 0 是玩家，AI 座位 1/2/3 对应 aiLv 的 0/1/2 号档位 */
  const seatLv = (seat) => aiLv[Math.max(0, Math.min(2, seat - 1))];

  /* AI 回合 */
  useEffect(() => {
    if (st.over) return undefined;
    const seat = st.turn;
    if (seat === HUMAN) return undefined;
    const t = setTimeout(() => {
      setSt((cur) => {
        if (cur.over || cur.turn !== seat) return cur;
        const dec = gdAiDecide(cur, seat, seatLv(seat));
        let nxt = dec.pass ? gdPass(cur, seat) : gdPlay(cur, seat, dec.cards);
        if (nxt === cur) nxt = gdPass(cur, seat);
        if (nxt === cur) {
          /* 兜底：领出环节 AI 判空时也要走一手，否则会卡死 */
          const plays = gdGenPlays(cur.hands[seat], cur.level);
          if (plays.length) nxt = gdPlay(cur, seat, plays[plays.length - 1].cards);
        }
        return nxt;
      });
    }, 460);
    return () => clearTimeout(t);
  }, [st, diff]);

  const reset = useCallback(() => {
    setSt(gdStartDeal(null, HUMAN));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  }, []);

  const humanTurn = !st.over && st.turn === HUMAN;

  const toggle = (id) => {
    if (!humanTurn) return;
    setMsg("");
    setSel((p) => (p.indexOf(id) >= 0 ? p.filter((x) => x !== id) : p.concat([id])));
  };

  const doPlay = () => {
    if (!humanTurn) return;
    const cards = st.hands[HUMAN].filter((c) => sel.indexOf(c.id) >= 0);
    if (!cards.length) {
      setMsg("先点牌选中");
      return;
    }
    const a = gdAnalyze(cards, st.level);
    if (!a) {
      setMsg("这不是合法牌型");
      return;
    }
    if (st.lastPlay && st.lastPlay.seat !== HUMAN && !gdBeats({ type: a.type, key: a.key }, st.lastPlay)) {
      setMsg(`压不过上家的${GD_TNAME[st.lastPlay.type]}`);
      return;
    }
    setSt(gdPlay(st, HUMAN, cards));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  };

  const doPass = () => {
    if (!humanTurn) return;
    if (!st.lastPlay) {
      setMsg("你是本轮领出，必须出牌");
      return;
    }
    setSt(gdPass(st, HUMAN));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  };

  const doHint = () => {
    if (!humanTurn) return;
    const resps = st.lastPlay
      ? gdResponses(st.hands[HUMAN], st.level, st.lastPlay)
      : gdGenPlays(st.hands[HUMAN], st.level);
    if (!resps.length) {
      setMsg(st.lastPlay ? "没有能压过的牌，过吧" : "无牌可出");
      return;
    }
    const p = resps[hintIdx % resps.length];
    setSel(p.cards.map((c) => c.id));
    setHintIdx(hintIdx + 1);
    setMsg(`${GD_TNAME[p.type]}（提示 ${((hintIdx % resps.length) + 1)}/${resps.length}）`);
  };

  const nextRound = () => {
    setSt(gdStartDeal(st, HUMAN));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  };

  /* 结算面板上换难度要连下一局一起开，否则难度点了没反应 */
  const changeDiff = (d) => {
    setDiff(d);
    setSt(gdStartDeal(st, HUMAN));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  };

  const myLevels = st.levels[gdTeamOf(HUMAN)];
  const foeLevels = st.levels[1 - gdTeamOf(HUMAN)];
  const nameOf = (lv) => (lv >= 15 ? "A" : GD_RN[lv] || String(lv));
  const lastCards = st.lastPlay ? st.lastPlay.cards : null;

  const oppRows = [3, 2, 1].map((s) => {
    const on = !st.over && st.turn === s;
    const done = st.out.indexOf(s) >= 0;
    return h(
      "div",
      { className: "gd-opp", key: s },
      h("div", { className: `gd-opp-name${on ? " on" : ""}` }, `${GD_SEAT_NAME[s]}${s === 2 ? "(队友)" : ""}`),
      h(
        "div",
        { className: "gd-cnt" },
        h("div", { className: "gd-backs" }, [0, 1, 2].map((i) => h("div", { className: "gd-back", key: i }))),
        h("b", null, done ? "完" : String(st.hands[s].length)),
      ),
      h("div", { className: "gd-tip" }, gdSeatTip(st, s)),
    );
  });

  const result = st.result;
  const myTeamWon = result ? result.winTeam === gdTeamOf(HUMAN) : false;

  return h(
    GameChrome,
    {
      hud: [
        { k: "级牌", v: nameOf(st.level) },
        { k: "我方", v: nameOf(myLevels) },
        { k: "对方", v: nameOf(foeLevels) },
        { k: "状态", v: st.over ? "本局结束" : humanTurn ? "轮到你" : `${GD_SEAT_NAME[st.turn]} 出牌` },
      ],
      onRestart: reset,
      overlay: st.over
        ? h(GameOverlay, {
            title: result && result.finished ? (myTeamWon ? "打过 A，通关！" : "对方通关") : myTeamWon ? "你方这局赢了" : "这局输了",
            lines: [
              result
                ? `名次：${result.out.map((s, i) => `${i + 1}.${GD_SEAT_NAME[s]}`).join("  ")}`
                : "",
              result
                ? `${result.same ? "双上" : "单下"}，升 ${result.up} 级（${nameOf(result.levelBefore)} → ${nameOf(result.levelAfter)}）`
                : "",
              result && result.finished ? "一队打过 A，本次对局结束。" : "下一局按进贡规则发牌。",
            ].filter(Boolean),
            actions: [
              { label: result && result.finished ? "重新开始" : "下一局", primary: true, onClick: nextRound },
              { label: "难度 简单", onClick: () => changeDiff(1) },
              { label: "难度 普通", onClick: () => changeDiff(2) },
              { label: "难度 困难", onClick: () => changeDiff(3) },
            ],
          })
        : null,
    },
    h("style", null, GD_CSS),
    h(
      "div",
      { className: "gd-wrap" },
      h("div", { className: "gd-opps" }, oppRows),
      h(
        "div",
        { className: "gd-mid" },
        h(
          "div",
          { className: "gd-lv" },
          h("span", null, "级牌 "),
          h("b", null, nameOf(st.level)),
          h("span", { className: "me" }, `我方 ${nameOf(myLevels)}`),
          h("span", { className: "foe" }, `对方 ${nameOf(foeLevels)}`),
        ),
        lastCards
          ? h(
              "div",
              { className: "gd-last" },
              h("span", { className: "gd-lastlbl" }, `${GD_SEAT_NAME[st.lastPlay.seat]} 出`),
              lastCards.map((c) => gdCardEl(c, st.level, { mini: true })),
              h("span", { className: "gd-lastlbl" }, GD_TNAME[st.lastPlay.type]),
            )
          : h("div", { className: "gd-last" }, h("span", { className: "gd-lastlbl" }, "新一轮，由领出方随意出牌")),
        st.tribute && st.tribute.logs.length
          ? h("div", { className: "gd-tribute" }, st.tribute.logs.join("　"))
          : null,
        h("div", { className: "gd-msg" }, msg || (humanTurn ? "" : " ")),
      ),
      h(
        "div",
        { className: "gd-hand" },
        st.hands[HUMAN].map((c) => gdCardEl(c, st.level, { sel: sel.indexOf(c.id) >= 0, onClick: () => toggle(c.id) })),
      ),
      h(
        "div",
        { className: "gd-act" },
        h("button", { type: "button", className: "gc-btn primary", onClick: doPlay, disabled: !humanTurn }, `出牌${sel.length ? `（${sel.length}）` : ""}`),
        h("button", { type: "button", className: "gc-btn", onClick: doPass, disabled: !humanTurn }, "过"),
        h("button", { type: "button", className: "gc-btn", onClick: doHint, disabled: !humanTurn }, "提示"),
        h("button", { type: "button", className: "gc-btn", onClick: () => setSel([]), disabled: !sel.length }, "清空"),
      ),
    ),
  );
}

attachKernel("guandan", {
  T: GD_T,
  TNAME: GD_TNAME,
  SEAT_NAME: GD_SEAT_NAME,
  deck: gdDeck,
  val: gdVal,
  isWild: gdIsWild,
  analyze: gdAnalyze,
  beats: gdBeats,
  genPlays: gdGenPlays,
  responses: gdResponses,
  newDeal: gdNewDeal,
  startDeal: gdStartDeal,
  play: gdPlay,
  pass: gdPass,
  settle: gdSettle,
  tributeNeed: gdTributeNeed,
  applyTribute: gdApplyTribute,
  aiDecide: gdAiDecide,
  sortHand: gdSortHand,
  teamOf: gdTeamOf,
});

defineGame({
  id: "guandan",
  name: "掼蛋",
  sub: "GUANDAN",
  icon: "♦",
  tag: "棋牌",
  color: "#e6a23c",
  desc: "四人两队的完整掼蛋：级牌、逢人配、进贡还贡、全套牌型，三个 AI 陪你打。",
  order: 110,
  component: GuandanGame,
});

/* ================= game/30-snake.js ================= */
/* ============================================================================
 * 贪吃蛇 —— 诺基亚 Snake II 的手感。
 *
 * 手感要点（这几个细节决定了是不是"那个味道"）：
 *   · 匀速前进，不加速；吃食才变长
 *   · 方向键不能 180° 回头（会撞自己）
 *   · 撞墙即死，不穿墙（Snake II 的 maze 模式）
 *   · 蛇身是一串方块，头略亮
 * ========================================================================== */

const SNAKE_COLS = 20;
const SNAKE_ROWS = 20;

/** 变速档位：数值越大越慢 */
const SNAKE_SPEEDS = [
  { name: "慢", ms: 170 },
  { name: "中", ms: 115 },
  { name: "快", ms: 80 },
];

function snakeNewState(speedIdx) {
  const cx = Math.floor(SNAKE_COLS / 2);
  const cy = Math.floor(SNAKE_ROWS / 2);
  return {
    /* 初始四节，头在右，朝右走 */
    body: [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
      { x: cx - 3, y: cy },
    ],
    dir: { x: 1, y: 0 },
    /* 本帧待生效的方向：连按两下不能在同一帧内叠成反向 */
    pending: [],
    food: { x: cx + 4, y: cy },
    score: 0,
    alive: true,
    speedIdx: speedIdx || 1,
    grew: false,
  };
}

function snakeSpawnFood(st) {
  const taken = new Set(st.body.map((p) => `${p.x},${p.y}`));
  const free = [];
  for (let y = 0; y < SNAKE_ROWS; y += 1) {
    for (let x = 0; x < SNAKE_COLS; x += 1) {
      if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (!free.length) return st;
  return { ...st, food: free[Math.floor(Math.random() * free.length)] };
}

/** 推进一步。返回新 state（不改入参，便于测试与重放） */
function snakeStep(st) {
  if (!st.alive) return st;

  /* 队列里取一个合法转向：不能与本帧方向相反 */
  let dir = st.dir;
  const pending = st.pending.slice();
  while (pending.length) {
    const cand = pending.shift();
    if (cand.x === -dir.x && cand.y === -dir.y) continue;
    dir = cand;
    break;
  }

  const head = st.body[0];
  const nx = head.x + dir.x;
  const ny = head.y + dir.y;

  /* 撞墙 */
  if (nx < 0 || ny < 0 || nx >= SNAKE_COLS || ny >= SNAKE_ROWS) {
    return { ...st, dir, pending, alive: false };
  }

  const ate = nx === st.food.x && ny === st.food.y;
  /* 不吃的这一帧，尾巴会移走 —— 所以"移到尾巴原位"不算撞 */
  const bodyForHit = ate ? st.body : st.body.slice(0, -1);
  if (bodyForHit.some((p) => p.x === nx && p.y === ny)) {
    return { ...st, dir, pending, alive: false };
  }

  const body = [{ x: nx, y: ny }, ...st.body];
  if (!ate) body.pop();

  let out = {
    ...st,
    body,
    dir,
    pending,
    score: ate ? st.score + 1 : st.score,
    grew: ate,
  };
  if (ate) out = snakeSpawnFood(out);
  return out;
}

function SnakeGame({ onExit }) {
  const [speedIdx, setSpeedIdx] = useState(1);
  const [st, setSt] = useState(() => snakeNewState(1));
  const [running, setRunning] = useState(false);
  const [hi, setHi] = useState(() => bestScore("snake"));

  const cvRef = useFitCanvas(SNAKE_COLS * 22, SNAKE_ROWS * 22);
  const stRef = useRef(st);
  stRef.current = st;

  const reset = useCallback(
    (si) => {
      const idx = typeof si === "number" ? si : speedIdx;
      setSt(snakeNewState(idx));
      setRunning(false);
    },
    [speedIdx],
  );

  const turn = useCallback((x, y) => {
    setSt((prev) => {
      if (!prev.alive) return prev;
      /* 队尾是"上一帧按下的方向"，跟它反向的按键直接丢弃 */
      const last = prev.pending.length ? prev.pending[prev.pending.length - 1] : prev.dir;
      if (last.x === -x && last.y === -y) return prev;
      if (last.x === x && last.y === y) return prev;
      return { ...prev, pending: [...prev.pending, { x, y }] };
    });
  }, []);

  useKeys(running, {
    ArrowUp: () => turn(0, -1),
    ArrowDown: () => turn(0, 1),
    ArrowLeft: () => turn(-1, 0),
    ArrowRight: () => turn(1, 0),
    w: () => turn(0, -1),
    s: () => turn(0, 1),
    a: () => turn(-1, 0),
    d: () => turn(1, 0),
    Space: () => (running ? setRunning(false) : setRunning(true)),
  });

  const accRef = useRef(0);

  /* 死亡时落分 */
  const deadRef = useRef(false);
  useEffect(() => {
    if (!st.alive && !deadRef.current) {
      deadRef.current = true;
      setRunning(false);
      const board = saveScore("snake", st.score, "玩家");
      setHi(board.length ? board[0].score : st.score);
    }
    if (st.alive) deadRef.current = false;
  }, [st.alive, st.score]);

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const T = gcTheme();
    const cell = 22;

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, SNAKE_COLS * cell, SNAKE_ROWS * cell);

    /* 极淡的网格，给"格子感"但不抢眼 */
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < SNAKE_COLS; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, SNAKE_ROWS * cell);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(SNAKE_COLS * cell, i * cell);
      ctx.stroke();
    }

    /* 食物：圆点 + 微光 */
    const f = st.food;
    const fx = f.x * cell + cell / 2;
    const fy = f.y * cell + cell / 2;
    ctx.fillStyle = T.danger;
    ctx.beginPath();
    ctx.arc(fx, fy, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(fx, fy, cell * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* 蛇身：尾到头渐亮 */
    const n = st.body.length;
    for (let i = n - 1; i >= 0; i -= 1) {
      const p = st.body[i];
      const t = n <= 1 ? 1 : 1 - i / (n - 1);
      ctx.fillStyle = i === 0 ? T.accent : mixHex(T.accent2, T.accent, t * 0.75);
      const inset = i === 0 ? 1 : 2.5;
      roundRect(ctx, p.x * cell + inset, p.y * cell + inset, cell - inset * 2, cell - inset * 2, 3);
      ctx.fill();
    }

    if (!st.alive) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, SNAKE_COLS * cell, SNAKE_ROWS * cell);
      ctx.fillStyle = "#fff";
      ctx.font = "700 20px -apple-system,PingFang SC,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", (SNAKE_COLS * cell) / 2, (SNAKE_ROWS * cell) / 2 - 8);
      ctx.font = "13px -apple-system,PingFang SC,sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillText(`长度 ${st.body.length}`, (SNAKE_COLS * cell) / 2, (SNAKE_ROWS * cell) / 2 + 16);
    }
  }, [st, cvRef]);

  /* 逻辑固定 60fps 步进，内部按档位累积够一格才走 —— 这样换档不用重挂循环，
     也避免"一档一个 rAF 循环"导致换速时旧循环还在跑。
     必须放在 draw 定义之后：旧代码把它放在前面，引用 const draw 撞上暂时性死区，
     一进贪吃蛇就 Cannot access 'draw' before initialization。 */
  useLoop(running, (dt) => {
    accRef.current += dt * 1000;
    const need = SNAKE_SPEEDS[speedIdx].ms;
    if (accRef.current < need) return;
    accRef.current -= need;
    setSt((prev) => snakeStep(prev));
  }, draw, 60);

  const start = () => {
    if (!st.alive) setSt(snakeNewState(speedIdx));
    setRunning(true);
  };

  return h(
    GameChrome,
    {
      hud: [
        { k: "长度", v: String(st.body.length) },
        { k: "吃到", v: String(st.score) },
        { k: "最高", v: String(hi) },
      ],
      onRestart: () => reset(),
      overlay: !running
        ? h(GameOverlay, {
            title: st.alive ? "贪吃蛇" : "撞上了",
            lines: st.alive
              ? ["方向键 / WASD 转向，撞墙或撞自己就结束。", "长得越长越难，别把自己堵死。"]
              : [`吃到 ${st.score} 个，长度 ${st.body.length}。`],
            actions: [
              { label: st.alive ? "开始" : "再来一局", primary: true, onClick: start },
              ...SNAKE_SPEEDS.map((s, i) => ({
                label: s.name,
                primary: false,
                onClick: () => {
                  setSpeedIdx(i);
                  setSt(snakeNewState(i));
                  setRunning(true);
                },
              })),
            ],
          })
        : null,
    },
    h("canvas", { ref: cvRef }),
    h(
      "span",
      null,
      h("span", { className: "gc-key" }, "↑"),
      h("span", { className: "gc-key" }, "↓"),
      h("span", { className: "gc-key" }, "←"),
      h("span", { className: "gc-key" }, "→"),
      " 转向 · ",
      h("span", { className: "gc-key" }, "空格"),
      " 暂停",
    ),
  );
}

/** 两个 #rrggbb 之间线性插值 */
function mixHex(a, b, t) {
  const pa = hexParts(a);
  const pb = hexParts(b);
  const m = (i) => Math.round(pa[i] + (pb[i] - pa[i]) * Math.max(0, Math.min(1, t)));
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}

function hexParts(s) {
  const v = s.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/* ctx.roundRect 在旧 Chromium 上不一定有，自己画 */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

attachKernel("snake", {
  COLS: SNAKE_COLS,
  ROWS: SNAKE_ROWS,
  SPEEDS: SNAKE_SPEEDS,
  newState: snakeNewState,
  step: snakeStep,
  spawnFood: snakeSpawnFood,
});

defineGame({
  id: "snake",
  name: "贪吃蛇",
  sub: "SNAKE II",
  icon: "🐍",
  tag: "经典",
  color: "#4fd1c5",
  desc: "诺基亚 Snake II 的手感：匀速、撞墙即死、越吃越长。",
  order: 30,
  component: SnakeGame,
});

/* ================= game/40-tetris.js ================= */
/* ============================================================================
 * 俄罗斯方块 —— 落块、消行、幽灵投影。
 *
 * 规则按经典标准（非 SRS，简单版）：
 *   · 7 种方块，10×20 棋盘
 *   · 旋转按下、右、上、左 四档偏移尝试墙踢（够用且不复杂）
 *   · 硬降（空格）立即落地并锁块
 *   · 消 1/2/3/4 行分别 100/300/500/800 分，乘以等级
 *   · 每消 10 行升一级，下落速度变快
 * ========================================================================== */

const TET_COLS = 10;
const TET_ROWS = 20;

/* 每种方块用 4x4 网格里的偏移定义，旋转就是绕中心转 90° */
const TET_SHAPES = {
  I: { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: "#4fd1c5" },
  O: { cells: [[1, 0], [2, 0], [1, 1], [2, 1]], color: "#e8b64a" },
  T: { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: "#a97bff" },
  S: { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: "#5ac774" },
  Z: { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: "#e0887e" },
  J: { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: "#5b8def" },
  L: { cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: "#e8994a" },
};
const TET_KEYS = Object.keys(TET_SHAPES);

/** 绕 (1.5, 0.5) —— 4x4 网格中心 —— 顺时针转 90° */
function tetRotate(cells) {
  return cells.map(([x, y]) => [4 - 1 - y, x]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** 7-bag：每 7 个方块一轮，避免连续来 6 个 S */
function tetNewBag() {
  const bag = TET_KEYS.slice();
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function tetSpawn(kind, board) {
  const shape = TET_SHAPES[kind];
  const cells = shape.cells.map(([x, y]) => [x, y]);
  const piece = { kind, cells, color: shape.color, x: 3, y: 0 };
  /* 出生位置被占就是顶死了 */
  return { piece, dead: tetCollide(board, piece.cells, piece.x, piece.y) };
}

function tetCollide(board, cells, px, py) {
  for (const [cx, cy] of cells) {
    const x = px + cx;
    const y = py + cy;
    if (x < 0 || x >= TET_COLS || y >= TET_ROWS) return true;
    if (y >= 0 && board[y][x]) return true;
  }
  return false;
}

/** 把方块落到棋盘上，返回新棋盘 */
function tetMerge(board, piece) {
  const next = board.map((row) => row.slice());
  for (const [cx, cy] of piece.cells) {
    const x = piece.x + cx;
    const y = piece.y + cy;
    if (y >= 0 && y < TET_ROWS && x >= 0 && x < TET_COLS) next[y][x] = piece.color;
  }
  return next;
}

/** 消行：返回 [新棋盘, 消掉的行数] */
function tetClear(board) {
  const kept = board.filter((row) => row.some((c) => !c));
  const cleared = TET_ROWS - kept.length;
  const fresh = [];
  for (let i = 0; i < cleared; i += 1) fresh.push(new Array(TET_COLS).fill(null));
  return [fresh.concat(kept), cleared];
}

/** 幽灵落点：当前方块直落到底的 y */
function tetGhostY(board, piece) {
  let y = piece.y;
  while (!tetCollide(board, piece.cells, piece.x, y + 1)) y += 1;
  return y;
}

/** 每级下落间隔（毫秒）：等级越高越快，但有下限免得没法玩 */
function tetDropMs(level) {
  return Math.max(90, 800 - (level - 1) * 65);
}

function tetNewState() {
  const bag = tetNewBag();
  const first = tetSpawn(bag[0], emptyTetBoard());
  return {
    board: emptyTetBoard(),
    piece: first.piece,
    bag: bag.slice(1),
    next: bag[1],
    score: 0,
    lines: 0,
    level: 1,
    alive: !first.dead,
    paused: false,
  };
}

function emptyTetBoard() {
  const rows = [];
  for (let y = 0; y < TET_ROWS; y += 1) rows.push(new Array(TET_COLS).fill(null));
  return rows;
}

/** 锁定当前方块并生成下一块。返回新 state */
function tetLock(st) {
  const merged = tetMerge(st.board, st.piece);
  const [board, cleared] = tetClear(merged);
  const lines = st.lines + cleared;
  const level = Math.floor(lines / 10) + 1;
  const gain = [0, 100, 300, 500, 800][cleared] * st.level;
  const score = st.score + gain;

  let bag = st.bag.slice();
  if (!bag.length) bag = tetNewBag();
  const kind = bag[0];
  const rest = bag.slice(1);
  if (!rest.length) rest.push(...tetNewBag());
  const spawned = tetSpawn(kind, board);

  return {
    ...st,
    board,
    piece: spawned.piece,
    bag: rest,
    next: rest[0],
    score,
    lines,
    level,
    alive: !spawned.dead,
  };
}

function TetrisGame({ onExit }) {
  const [st, setSt] = useState(tetNewState);
  const [running, setRunning] = useState(false);
  const [hi, setHi] = useState(() => bestScore("tetris"));
  const cvRef = useFitCanvas(TET_COLS * 26 + 90, TET_ROWS * 26);
  const accRef = useRef(0);
  const deadRef = useRef(false);

  const reset = useCallback(() => {
    setSt(tetNewState());
    setRunning(false);
  }, []);

  /** 左右移动 / 旋转 / 软降 都走这一个函数，逻辑集中好验证 */
  const op = useCallback((kind) => {
    setSt((prev) => {
      if (!prev.alive || prev.paused) return prev;
      const p = prev.piece;
      if (kind === "left") {
        return tetCollide(prev.board, p.cells, p.x - 1, p.y)
          ? prev
          : { ...prev, piece: { ...p, x: p.x - 1 } };
      }
      if (kind === "right") {
        return tetCollide(prev.board, p.cells, p.x + 1, p.y)
          ? prev
          : { ...prev, piece: { ...p, x: p.x + 1 } };
      }
      if (kind === "rotate") {
        const rc = tetRotate(p.cells);
        /* 墙踢：原地 → 左 1 → 右 1 → 左 2 → 右 2 */
        for (const dx of [0, -1, 1, -2, 2]) {
          if (!tetCollide(prev.board, rc, p.x + dx, p.y)) {
            return { ...prev, piece: { ...p, cells: rc, x: p.x + dx } };
          }
        }
        return prev;
      }
      if (kind === "down") {
        if (!tetCollide(prev.board, p.cells, p.x, p.y + 1)) {
          return { ...prev, piece: { ...p, y: p.y + 1 }, score: prev.score + 1 };
        }
        return tetLock(prev);
      }
      if (kind === "hard") {
        const gy = tetGhostY(prev.board, p);
        const dropped = { ...prev, piece: { ...p, y: gy }, score: prev.score + (gy - p.y) * 2 };
        return tetLock(dropped);
      }
      return prev;
    });
  }, []);

  useLoop(running, (dt) => {
    accRef.current += dt * 1000;
    const need = tetDropMs(st.level);
    if (accRef.current < need) return;
    accRef.current -= need;
    setSt((prev) => {
      if (!prev.alive || prev.paused) return prev;
      const p = prev.piece;
      if (!tetCollide(prev.board, p.cells, p.x, p.y + 1)) {
        return { ...prev, piece: { ...p, y: p.y + 1 } };
      }
      return tetLock(prev);
    });
  }, undefined, 60);

  useKeys(running, {
    ArrowLeft: () => op("left"),
    ArrowRight: () => op("right"),
    ArrowDown: () => op("down"),
    ArrowUp: () => op("rotate"),
    Space: () => op("hard"),
    p: () => setSt((prev) => ({ ...prev, paused: !prev.paused })),
    P: () => setSt((prev) => ({ ...prev, paused: !prev.paused })),
  });

  useEffect(() => {
    if (!st.alive && !deadRef.current) {
      deadRef.current = true;
      setRunning(false);
      const board = saveScore("tetris", st.score, "玩家");
      setHi(board.length ? board[0].score : st.score);
    }
    if (st.alive) deadRef.current = false;
  }, [st.alive, st.score]);

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const T = gcTheme();
    const cell = 26;
    const boardW = TET_COLS * cell;
    const boardH = TET_ROWS * cell;
    const panelW = 90;

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, boardW + panelW, boardH);

    /* 棋盘底 + 网格 */
    ctx.fillStyle = T.bg2;
    ctx.fillRect(0, 0, boardW, boardH);
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 0.5;
    for (let x = 1; x < TET_COLS; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, boardH);
      ctx.stroke();
    }
    for (let y = 1; y < TET_ROWS; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell);
      ctx.lineTo(boardW, y * cell);
      ctx.stroke();
    }

    /* 已落定的方块 */
    for (let y = 0; y < TET_ROWS; y += 1) {
      for (let x = 0; x < TET_COLS; x += 1) {
        const c = st.board[y][x];
        if (c) drawBlock(ctx, x * cell, y * cell, cell, c);
      }
    }

    /* 幽灵 + 当前方块 */
    if (st.piece && st.alive) {
      const gy = tetGhostY(st.board, st.piece);
      ctx.globalAlpha = 0.18;
      for (const [cx, cy] of st.piece.cells) {
        drawBlock(ctx, (st.piece.x + cx) * cell, (gy + cy) * cell, cell, st.piece.color);
      }
      ctx.globalAlpha = 1;
      for (const [cx, cy] of st.piece.cells) {
        drawBlock(ctx, (st.piece.x + cx) * cell, (st.piece.y + cy) * cell, cell, st.piece.color);
      }
    }

    /* 右侧：下一个 */
    const px = boardW + 10;
    ctx.fillStyle = T.dim;
    ctx.font = "600 9px -apple-system,PingFang SC,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("NEXT", px, 16);
    if (st.next) {
      const shape = TET_SHAPES[st.next];
      const small = 18;
      for (const [cx, cy] of shape.cells) {
        drawBlock(ctx, px + cx * small, 26 + cy * small, small, shape.color);
      }
    }

    ctx.fillStyle = T.dim;
    ctx.fillText("LEVEL", px, 140);
    ctx.fillStyle = T.fg;
    ctx.font = "700 18px -apple-system,PingFang SC,sans-serif";
    ctx.fillText(String(st.level), px, 162);
    ctx.fillStyle = T.dim;
    ctx.font = "600 9px -apple-system,PingFang SC,sans-serif";
    ctx.fillText("LINES", px, 190);
    ctx.fillStyle = T.fg;
    ctx.font = "700 18px -apple-system,PingFang SC,sans-serif";
    ctx.fillText(String(st.lines), px, 212);

    if (!st.alive) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(0, 0, boardW, boardH);
      ctx.fillStyle = "#fff";
      ctx.font = "700 18px -apple-system,PingFang SC,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", boardW / 2, boardH / 2);
      ctx.font = "12px -apple-system,PingFang SC,sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillText(`消 ${st.lines} 行`, boardW / 2, boardH / 2 + 22);
    } else if (st.paused) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, boardW, boardH);
      ctx.fillStyle = "#fff";
      ctx.font = "700 16px -apple-system,PingFang SC,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("暂停", boardW / 2, boardH / 2);
    }
  }, [st, cvRef]);

  useLoop(running, () => {}, draw, 30);

  const start = () => {
    if (!st.alive) setSt(tetNewState());
    setSt((prev) => ({ ...prev, paused: false }));
    setRunning(true);
  };

  return h(
    GameChrome,
    {
      hud: [
        { k: "分数", v: fmtNum(st.score) },
        { k: "行数", v: String(st.lines) },
        { k: "等级", v: String(st.level) },
        { k: "最高", v: fmtNum(hi) },
      ],
      onRestart: reset,
      overlay: !running
        ? h(GameOverlay, {
            title: st.alive ? "俄罗斯方块" : "堆到顶了",
            lines: st.alive
              ? ["← → 移动，↑ 旋转，↓ 软降，空格硬降。", "消 4 行 800 分，每 10 行升一级。"]
              : [`得分 ${fmtNum(st.score)}，消了 ${st.lines} 行。`],
            actions: [
              { label: st.alive ? "开始" : "再来一局", primary: true, onClick: start },
              { label: "换一局", onClick: reset },
            ],
          })
        : null,
    },
    h("canvas", { ref: cvRef }),
    h(
      "span",
      null,
      h("span", { className: "gc-key" }, "←"),
      h("span", { className: "gc-key" }, "→"),
      " 移动 · ",
      h("span", { className: "gc-key" }, "↑"),
      " 旋转 · ",
      h("span", { className: "gc-key" }, "空格"),
      " 硬降 · ",
      h("span", { className: "gc-key" }, "P"),
      " 暂停",
    ),
  );
}

function drawBlock(ctx, x, y, size, color) {
  const inset = 1;
  ctx.fillStyle = color;
  roundRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2, 3);
  ctx.fill();
  /* 顶部高光，让方块有厚度感 */
  ctx.fillStyle = "rgba(255,255,255,.22)";
  roundRect(ctx, x + inset + 1, y + inset + 1, size - inset * 2 - 2, 3, 2);
  ctx.fill();
}

attachKernel("tetris", {
  COLS: TET_COLS,
  ROWS: TET_ROWS,
  SHAPES: TET_SHAPES,
  newState: tetNewState,
  rotate: tetRotate,
  collide: tetCollide,
  merge: tetMerge,
  clear: tetClear,
  ghostY: tetGhostY,
  dropMs: tetDropMs,
  lock: tetLock,
});

defineGame({
  id: "tetris",
  name: "俄罗斯方块",
  sub: "TETRIS",
  icon: "🧱",
  tag: "经典",
  color: "#a97bff",
  desc: "7-bag 出块、幽灵投影、硬降加速；消 4 行 800 分。",
  order: 40,
  component: TetrisGame,
});

/* ================= game/50-breakout.js ================= */
/* ============================================================================
 * 打砖块 —— Breakout / 快打砖的快感，靠三件事：
 *   1. 板子反弹角度由命中位置决定（打到边角角度大，可打出弧线）
 *   2. 球速逐关提高，但有上限（不然鼠标跟不上）
 *   3. 砖块按行分色，打掉一行给"这行清空"的反馈
 *
 * 物理用「上一步/下一步」的位置插值做连续碰撞检测，
 * 否则球速快时（>30px/帧）会直接穿墙穿过砖块。
 * ========================================================================== */

const BRK_W = 480;
const BRK_H = 560;

const BRK_ROWS = 6;
const BRK_COLS = 10;
const BRK_BRICK_H = 20;
const BRK_BRICK_GAP = 4;
const BRK_TOP = 58;

/* 从上到下的行颜色与分数 */
const BRK_ROW_STYLE = [
  { color: "#e0887e", score: 70 },
  { color: "#e8994a", score: 60 },
  { color: "#e8b64a", score: 50 },
  { color: "#5ac774", score: 40 },
  { color: "#4fd1c5", score: 30 },
  { color: "#7c8cff", score: 20 },
];

const BRK_PADDLE_W = 84;
const BRK_PADDLE_H = 12;
const BRK_PADDLE_Y = BRK_H - 40;
const BRK_BASE_SPEED = 340;
const BRK_MAX_SPEED = 720;

function brkBrickRect(row, col) {
  const gap = BRK_BRICK_GAP;
  const totalGap = gap * (BRK_COLS + 1);
  const w = (BRK_W - totalGap) / BRK_COLS;
  return {
    x: gap + col * (w + gap),
    y: BRK_TOP + row * (BRK_BRICK_H + gap),
    w,
    h: BRK_BRICK_H,
  };
}

function brkNewState(level) {
  const lv = level || 1;
  const bricks = [];
  for (let r = 0; r < BRK_ROWS; r += 1) {
    for (let c = 0; c < BRK_COLS; c += 1) {
      const rect = brkBrickRect(r, c);
      bricks.push({ ...rect, row: r, alive: true });
    }
  }
  /* 每关随机留几块空的，形状不至于太像一堵墙 */
  const holes = Math.min(10, 3 + lv);
  for (let i = 0; i < holes; i += 1) {
    const idx = 1 + Math.floor(Math.random() * (bricks.length - 2));
    bricks[idx].alive = false;
  }

  const speed = Math.min(BRK_MAX_SPEED, BRK_BASE_SPEED + (lv - 1) * 34);
  return {
    level: lv,
    bricks,
    /* 球从板子中间偏上出发，向右上 */
    ball: { x: BRK_W / 2, y: BRK_PADDLE_Y - 30, vx: speed * 0.55, vy: -speed * 0.83, r: 6 },
    paddle: { x: BRK_W / 2 - BRK_PADDLE_W / 2, w: BRK_PADDLE_W, h: BRK_PADDLE_H, vx: 0 },
    score: 0,
    lives: 3,
    phase: "serve", /* serve | play | over | clear */
    speed,
  };
}

/**
 * 推进一帧。
 * @param {object} st
 * @param {number} dt 秒
 * @param {{left:boolean,right:boolean,targetX:number|null}} input
 */
function brkStep(st, dt, input) {
  if (st.phase === "over" || st.phase === "clear") return st;
  const out = { ...st, bricks: st.bricks, ball: { ...st.ball }, paddle: { ...st.paddle } };

  /* ---- 板子 ---- */
  const p = out.paddle;
  const prevPx = p.x;
  const kbSpeed = 620;
  if (input && input.targetX != null) {
    /* 鼠标/触摸：板子中心追指针 */
    const want = input.targetX - p.w / 2;
    const delta = want - p.x;
    p.x += Math.max(-kbSpeed * 1.7 * dt, Math.min(kbSpeed * 1.7 * dt, delta));
  } else {
    let dir = 0;
    if (input && input.left) dir -= 1;
    if (input && input.right) dir += 1;
    p.x += dir * kbSpeed * dt;
  }
  p.x = Math.max(0, Math.min(BRK_W - p.w, p.x));
  /* 击球时按板子横向速度加一点角度，滑着打能拉出更斜的球 */
  p.vx = dt > 0 ? (p.x - prevPx) / dt : 0;

  if (out.phase === "serve") {
    /* 发球前球贴在板子上 */
    out.ball.x = p.x + p.w / 2;
    out.ball.y = BRK_PADDLE_Y - 30;
    return out;
  }

  const b = out.ball;
  const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 6));
  const sub = dt / steps;

  for (let s = 0; s < steps; s += 1) {
    const prevX = b.x;
    const prevY = b.y;
    b.x += b.vx * sub;
    b.y += b.vy * sub;

    /* 左右墙 */
    if (b.x - b.r < 0) {
      b.x = b.r;
      b.vx = Math.abs(b.vx);
    } else if (b.x + b.r > BRK_W) {
      b.x = BRK_W - b.r;
      b.vx = -Math.abs(b.vx);
    }
    /* 顶 */
    if (b.y - b.r < 0) {
      b.y = b.r;
      b.vy = Math.abs(b.vy);
    }

    /* 板子：只有当球往下走时才碰 */
    if (b.vy > 0 && b.y + b.r >= BRK_PADDLE_Y && b.y - b.r <= BRK_PADDLE_Y + p.h) {
      if (b.x >= p.x - b.r && b.x <= p.x + p.w + b.r) {
        b.y = BRK_PADDLE_Y - b.r;
        /* 命中位置 → 反弹角度，[-1,1] 映射到 ±60° */
        const hit = (b.x - (p.x + p.w / 2)) / (p.w / 2);
        const angle = (Math.max(-1, Math.min(1, hit)) * Math.PI) / 3;
        const sp = Math.min(BRK_MAX_SPEED, Math.hypot(b.vx, b.vy));
        b.vx = Math.sin(angle) * sp;
        b.vy = -Math.abs(Math.cos(angle) * sp);
        /* 给一点板子速度：边滑边弹能拉出更斜的角度 */
        b.vx += p.vx * 0.18;
      }
    }

    /* 砖块：用上一步位置做线段与矩形相交，避免高速穿透 */
    let hit = -1;
    for (let i = 0; i < out.bricks.length; i += 1) {
      const br = out.bricks[i];
      if (!br.alive) continue;
      if (segRectHit(prevX, prevY, b.x, b.y, br, b.r)) {
        hit = i;
        break;
      }
    }
    if (hit >= 0) {
      const br = out.bricks[hit];
      out.bricks = out.bricks.slice();
      out.bricks[hit] = { ...br, alive: false };
      out.score += BRK_ROW_STYLE[br.row].score * out.level;

      /* 判断从哪边撞进来的：比较重叠深度，取穿透最小的轴反射 */
      const overlapX = Math.min(
        Math.abs(b.x + b.r - br.x),
        Math.abs(br.x + br.w - (b.x - b.r)),
      );
      const overlapY = Math.min(
        Math.abs(b.y + b.r - br.y),
        Math.abs(br.y + br.h - (b.y - b.r)),
      );
      if (overlapX < overlapY) b.vx = -b.vx;
      else b.vy = -b.vy;

      /* 每块砖轻微加速，让清场过程越来越快 */
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < BRK_MAX_SPEED) {
        const k = Math.min(BRK_MAX_SPEED, sp * 1.012) / sp;
        b.vx *= k;
        b.vy *= k;
      }
      break;
    }

    /* 掉下去 */
    if (b.y - b.r > BRK_H) {
      out.lives -= 1;
      if (out.lives <= 0) {
        out.phase = "over";
        return out;
      }
      out.phase = "serve";
      out.ball = { x: p.x + p.w / 2, y: BRK_PADDLE_Y - 30, vx: 0, vy: 0, r: b.r };
      return out;
    }
  }

  if (out.bricks.every((br) => !br.alive)) out.phase = "clear";
  return out;
}

/** 线段与矩形（外扩 r）是否相交 —— 连续碰撞检测的核心 */
function segRectHit(x0, y0, x1, y1, rect, r) {
  const rx = rect.x - r;
  const ry = rect.y - r;
  const rw = rect.w + r * 2;
  const rh = rect.h + r * 2;
  /* 快速排除 */
  if (Math.max(x0, x1) < rx || Math.min(x0, x1) > rx + rw) return false;
  if (Math.max(y0, y1) < ry || Math.min(y0, y1) > ry + rh) return false;
  /* 段两端都在框内 */
  const inside = (x, y) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
  if (inside(x0, y0) || inside(x1, y1)) return true;
  /* 四条边各自求交 */
  return (
    segSegHit(x0, y0, x1, y1, rx, ry, rx + rw, ry) ||
    segSegHit(x0, y0, x1, y1, rx, ry + rh, rx + rw, ry + rh) ||
    segSegHit(x0, y0, x1, y1, rx, ry, rx, ry + rh) ||
    segSegHit(x0, y0, x1, y1, rx + rw, ry, rx + rw, ry + rh)
  );
}

function segSegHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function cross(ax, ay, bx, by, px, py) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

function BreakoutGame({ onExit }) {
  const [st, setSt] = useState(() => brkNewState(1));
  const [running, setRunning] = useState(false);
  const [hi, setHi] = useState(() => bestScore("breakout"));
  const cvRef = useFitCanvas(BRK_W, BRK_H);
  const inputRef = useRef({ left: false, right: false, targetX: null });
  const deadRef = useRef(false);

  /* 键盘一按就交还控制权给键盘，否则鼠标停在某处会一直把板子吸过去 */
  const kbTake = useCallback((dir) => {
    inputRef.current.targetX = null;
    inputRef.current[dir] = true;
  }, []);

  useKeys(running, {
    down: {
      ArrowLeft: () => kbTake("left"),
      ArrowRight: () => kbTake("right"),
      a: () => kbTake("left"),
      d: () => kbTake("right"),
      Space: () => {
        setSt((prev) => (prev.phase === "serve" ? brkLaunch(prev) : prev));
      },
    },
    up: {
      ArrowLeft: () => (inputRef.current.left = false),
      ArrowRight: () => (inputRef.current.right = false),
      a: () => (inputRef.current.left = false),
      d: () => (inputRef.current.right = false),
    },
  });

  useLoop(running, (dt) => {
    setSt((prev) => brkStep(prev, dt, inputRef.current));
  }, undefined, 120);

  useEffect(() => {
    if ((st.phase === "over" || st.phase === "clear") && !deadRef.current) {
      deadRef.current = true;
      setRunning(false);
      const board = saveScore("breakout", st.score, "玩家");
      setHi(board.length ? board[0].score : st.score);
    }
    if (st.phase === "play" || st.phase === "serve") deadRef.current = false;
  }, [st.phase, st.score]);

  /* 指针控制：用 pointermove 拿 canvas 内的逻辑坐标 */
  const onPointer = useCallback(
    (e) => {
      const cv = cvRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const sc = cv.__scale || 1;
      const x = (e.clientX - rect.left) / sc;
      inputRef.current.targetX = x;
      inputRef.current.left = false;
      inputRef.current.right = false;
    },
    [cvRef],
  );

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const T = gcTheme();

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, BRK_W, BRK_H);

    /* 顶部分数条 */
    ctx.fillStyle = T.dim;
    ctx.font = "600 11px -apple-system,PingFang SC,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`第 ${st.level} 关`, 10, 22);
    ctx.textAlign = "right";
    ctx.fillStyle = T.fg;
    ctx.font = "700 13px -apple-system,PingFang SC,sans-serif";
    ctx.fillText(String(st.score), BRK_W - 10, 22);
    ctx.textAlign = "center";
    ctx.fillStyle = T.dim;
    ctx.font = "600 11px -apple-system,PingFang SC,sans-serif";
    ctx.fillText("♥".repeat(Math.max(0, st.lives)), BRK_W / 2, 22);

    /* 砖块 */
    for (const br of st.bricks) {
      if (!br.alive) continue;
      const style = BRK_ROW_STYLE[br.row];
      ctx.fillStyle = style.color;
      roundRect(ctx, br.x, br.y, br.w, br.h, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.25)";
      roundRect(ctx, br.x + 2, br.y + 2, br.w - 4, 3, 1.5);
      ctx.fill();
    }

    /* 板子 */
    const p = st.paddle;
    const grad = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
    grad.addColorStop(0, T.accent2);
    grad.addColorStop(1, T.accent);
    ctx.fillStyle = grad;
    roundRect(ctx, p.x, BRK_PADDLE_Y, p.w, p.h, 6);
    ctx.fill();

    /* 球（带拖尾） */
    const b = st.ball;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = T.fg;
    ctx.beginPath();
    ctx.arc(b.x - b.vx * 0.012, b.y - b.vy * 0.012, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();

    if (st.phase === "over" || st.phase === "clear") {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(0, 0, BRK_W, BRK_H);
      ctx.fillStyle = "#fff";
      ctx.font = "700 20px -apple-system,PingFang SC,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(st.phase === "clear" ? "过关" : "GAME OVER", BRK_W / 2, BRK_H / 2);
      ctx.font = "12px -apple-system,PingFang SC,sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillText(`得分 ${fmtNum(st.score)}`, BRK_W / 2, BRK_H / 2 + 24);
    } else if (st.phase === "serve") {
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "600 12px -apple-system,PingFang SC,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("点一下 或 按空格 发球", BRK_W / 2, BRK_H - 80);
    }
  }, [st, cvRef]);

  useLoop(running, () => {}, draw, 60);

  const start = () => {
    setSt((prev) => {
      if (prev.phase === "over" || prev.phase === "clear") return brkNewState(prev.level);
      return prev;
    });
    setRunning(true);
  };

  const nextLevel = () => {
    setSt((prev) => {
      const next = brkNewState(prev.level + 1);
      return { ...next, score: prev.score };
    });
    setRunning(true);
  };

  return h(
    GameChrome,
    {
      hud: [
        { k: "分数", v: fmtNum(st.score) },
        { k: "关卡", v: String(st.level) },
        { k: "命", v: String(st.lives) },
        { k: "最高", v: fmtNum(hi) },
      ],
      onRestart: () => {
        setSt(brkNewState(1));
        setRunning(false);
      },
      overlay: !running
        ? h(GameOverlay, {
            title:
              st.phase === "clear" ? "过关" : st.phase === "over" ? "球掉光了" : "打砖块",
            lines:
              st.phase === "over"
                ? [`得分 ${fmtNum(st.score)}，第 ${st.level} 关。`]
                : st.phase === "clear"
                  ? ["砖块清空了。", "下一关球更快、砖更多洞。"]
                  : [
                      "移动鼠标或按 ← → 控制板子。",
                      "空格发球。打在板子边缘角度更斜。",
                    ],
            actions:
              st.phase === "clear"
                ? [{ label: "下一关", primary: true, onClick: nextLevel }]
                : [
                    {
                      label: st.phase === "over" ? "再来一局" : "开始",
                      primary: true,
                      onClick: start,
                    },
                  ],
          })
        : null,
    },
    h("canvas", {
      ref: cvRef,
      onPointerMove: onPointer,
      onPointerDown: (e) => {
        onPointer(e);
        setSt((prev) => (prev.phase === "serve" ? brkLaunch(prev) : prev));
      },
    }),
    h(
      "span",
      null,
      h("span", { className: "gc-key" }, "←"),
      h("span", { className: "gc-key" }, "→"),
      " 移动 · ",
      h("span", { className: "gc-key" }, "空格"),
      " 发球 · 鼠标直接拖也行",
    ),
  );
}

/** 发球：给一个随机但不打横的初始方向 */
function brkLaunch(st) {
  if (st.phase !== "serve") return st;
  const sp = st.speed;
  const ang = (-Math.PI / 2) + (Math.random() * 0.9 - 0.45);
  return {
    ...st,
    phase: "play",
    ball: {
      ...st.ball,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
    },
  };
}

attachKernel("breakout", {
  W: BRK_W,
  H: BRK_H,
  newState: brkNewState,
  step: brkStep,
  launch: brkLaunch,
  brickRect: brkBrickRect,
});

defineGame({
  id: "breakout",
  name: "打砖块",
  sub: "BREAKOUT",
  icon: "🧨",
  tag: "经典",
  color: "#e8994a",
  desc: "板子边缘反弹角度更斜；6 行 60 块，越打越快。",
  order: 50,
  component: BreakoutGame,
});

/* ================= game/60-2048.js ================= */
/* ============================================================================
 * 2048 —— 四个方向滑动合并，凑出 2048。
 *
 * 滑动的正确做法：把一行/一列先压缩（去掉空格），再从左往右扫描合并
 * 相同且"本回合没合过"的相邻对，最后补空格。每一格用 merged 标记，
 * 防止 [2,2,2,2] 被错误合成 [4,8]（正确是 [4,4]）。
 * ========================================================================== */

const G2048_SIZE = 4;
const G2048_TARGET = 2048;

const G2048_COLORS = {
  2: ["#2f3445", "#dfe3ea"],
  4: ["#3a4152", "#dfe3ea"],
  8: ["#d98a4a", "#fff"],
  16: ["#d97a44", "#fff"],
  32: ["#d9694a", "#fff"],
  64: ["#d9544a", "#fff"],
  128: ["#c9a83f", "#fff"],
  256: ["#c19b2f", "#fff"],
  512: ["#b58c1f", "#fff"],
  1024: ["#a97bff", "#fff"],
  2048: ["#7c8cff", "#fff"],
  4096: ["#4fd1c5", "#0b1114"],
  8192: ["#3fb8a8", "#0b1114"],
};

function g2048NewState() {
  const board = emptyG2048();
  g2048Spawn(board);
  g2048Spawn(board);
  return { board, score: 0, best: 0, won: false, over: false, moves: 0 };
}

function emptyG2048() {
  const b = [];
  for (let y = 0; y < G2048_SIZE; y += 1) b.push(new Array(G2048_SIZE).fill(0));
  return b;
}

/** 随机放一个 2（90%）或 4（10%） */
function g2048Spawn(board) {
  const free = [];
  for (let y = 0; y < G2048_SIZE; y += 1) {
    for (let x = 0; x < G2048_SIZE; x += 1) {
      if (!board[y][x]) free.push({ x, y });
    }
  }
  if (!free.length) return null;
  const p = free[Math.floor(Math.random() * free.length)];
  board[p.y][p.x] = Math.random() < 0.9 ? 2 : 4;
  return p;
}

/**
 * 把一条线（长度 4 的数组，按"往哪个方向流的顺序"排好）压缩合并。
 * 返回 { line, gain }
 */
function g2048SlideLine(line) {
  const nums = line.filter((v) => v !== 0);
  const out = [];
  let gain = 0;
  for (let i = 0; i < nums.length; i += 1) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      out.push(v);
      gain += v;
      i += 1; /* 跳过被吃掉的那个 —— 这一步就是防 [2,2,2,2]→[4,8] 的关键 */
    } else {
      out.push(nums[i]);
    }
  }
  while (out.length < G2048_SIZE) out.push(0);
  return { line: out, gain };
}

/** 取第 y 行的"流动顺序"数组 */
function g2048Row(board, y, dir) {
  const row = board[y].slice();
  return dir === "left" ? row : row.slice().reverse();
}

/** 取第 x 列的"流动顺序"数组（自上而下 / 自下而上） */
function g2048Col(board, x, dir) {
  const col = [];
  for (let y = 0; y < G2048_SIZE; y += 1) col.push(board[y][x]);
  return dir === "up" ? col : col.slice().reverse();
}

/**
 * 走一步。
 * @param {object} st
 * @param {"left"|"right"|"up"|"down"} dir
 * @returns {object} 新 state；如果这一步没改变任何格子，返回原 state（调用方据此判断要不要生成新块）
 */
function g2048Move(st, dir) {
  if (st.over) return st;
  const board = st.board.map((r) => r.slice());
  let gain = 0;
  let moved = false;

  const horizontal = dir === "left" || dir === "right";
  for (let i = 0; i < G2048_SIZE; i += 1) {
    const src = horizontal ? g2048Row(board, i, dir) : g2048Col(board, i, dir);
    const { line, gain: g } = g2048SlideLine(src);
    gain += g;
    const back = dir === "left" || dir === "up" ? line : line.slice().reverse();
    for (let j = 0; j < G2048_SIZE; j += 1) {
      const before = horizontal ? board[i][j] : board[j][i];
      const after = back[j];
      if (before !== after) moved = true;
      if (horizontal) board[i][j] = after;
      else board[j][i] = after;
    }
  }

  if (!moved) return st;

  const next = {
    ...st,
    board,
    score: st.score + gain,
    moves: st.moves + 1,
  };
  g2048Spawn(next.board);
  next.won = next.board.some((row) => row.some((v) => v >= G2048_TARGET));
  next.over = !g2048CanMove(next.board);
  return next;
}

function g2048CanMove(board) {
  for (let y = 0; y < G2048_SIZE; y += 1) {
    for (let x = 0; x < G2048_SIZE; x += 1) {
      if (!board[y][x]) return true;
      const v = board[y][x];
      if (x + 1 < G2048_SIZE && board[y][x + 1] === v) return true;
      if (y + 1 < G2048_SIZE && board[y + 1][x] === v) return true;
    }
  }
  return false;
}

function Game2048({ onExit }) {
  const [st, setSt] = useState(g2048NewState);
  const [hi, setHi] = useState(() => bestScore("2048"));
  const [keepGoing, setKeepGoing] = useState(false);
  const cvRef = useFitCanvas(420, 420);
  const touchRef = useRef(null);

  const move = useCallback((dir) => {
    setSt((prev) => {
      const next = g2048Move(prev, dir);
      if (next !== prev && next.score > bestScore("2048")) {
        /* 分数实时刷最高分，玩到一半关掉也不丢 */
        saveScore("2048", next.score, "玩家");
        setHi(next.score);
      }
      return next;
    });
  }, []);

  useKeys(true, {
    ArrowLeft: () => move("left"),
    ArrowRight: () => move("right"),
    ArrowUp: () => move("up"),
    ArrowDown: () => move("down"),
    a: () => move("left"),
    d: () => move("right"),
    w: () => move("up"),
    s: () => move("down"),
  });

  /* 触屏：记录起点，松手时按位移主轴判方向 */
  const onDown = (e) => {
    touchRef.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    const s0 = touchRef.current;
    touchRef.current = null;
    if (!s0) return;
    const dx = e.clientX - s0.x;
    const dy = e.clientY - s0.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  };

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const T = gcTheme();
    const pad = 10;
    const cell = (420 - pad * (G2048_SIZE + 1)) / G2048_SIZE;

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, 420, 420);

    /* 底格 */
    for (let y = 0; y < G2048_SIZE; y += 1) {
      for (let x = 0; x < G2048_SIZE; x += 1) {
        ctx.fillStyle = T.dark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.05)";
        roundRect(ctx, pad + x * (cell + pad), pad + y * (cell + pad), cell, cell, 8);
        ctx.fill();
      }
    }

    for (let y = 0; y < G2048_SIZE; y += 1) {
      for (let x = 0; x < G2048_SIZE; x += 1) {
        const v = st.board[y][x];
        if (!v) continue;
        const pair = G2048_COLORS[v] || ["#333a4d", "#fff"];
        /* 浅色主题下把深色格子换亮一点 */
        let bg = pair[0];
        if (!T.dark) bg = g2048Lighten(pair[0], v);
        const fg = T.dark ? pair[1] : v <= 4 ? "#2a2d36" : "#fff";
        const px = pad + x * (cell + pad);
        const py = pad + y * (cell + pad);
        ctx.fillStyle = bg;
        roundRect(ctx, px, py, cell, cell, 8);
        ctx.fill();

        const digits = String(v).length;
        const fs = digits <= 2 ? cell * 0.42 : digits === 3 ? cell * 0.34 : cell * 0.27;
        ctx.fillStyle = fg;
        ctx.font = `700 ${fs}px -apple-system,PingFang SC,sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(v), px + cell / 2, py + cell / 2 + 1);
      }
    }
    ctx.textBaseline = "alphabetic";
  }, [st, cvRef]);

  useLoop(true, () => {}, draw, 30);

  const won = st.won && !keepGoing;

  return h(
    GameChrome,
    {
      hud: [
        { k: "分数", v: fmtNum(st.score) },
        { k: "最高", v: fmtNum(hi) },
        { k: "步数", v: String(st.moves) },
        { k: "最大", v: String(Math.max(...st.board.flat())) },
      ],
      onRestart: () => {
        setSt(g2048NewState());
        setKeepGoing(false);
      },
      overlay: won
        ? h(GameOverlay, {
            title: "2048 了",
            lines: ["合出 2048 就算通关。", "还能继续往上堆，试试 4096。"],
            actions: [
              { label: "继续玩", primary: true, onClick: () => setKeepGoing(true) },
              {
                label: "重开",
                onClick: () => {
                  setSt(g2048NewState());
                  setKeepGoing(false);
                },
              },
            ],
          })
        : st.over
          ? h(GameOverlay, {
              title: "没有可走的了",
              lines: [`得分 ${fmtNum(st.score)}，走了 ${st.moves} 步。`],
              actions: [
                {
                  label: "再来一局",
                  primary: true,
                  onClick: () => {
                    setSt(g2048NewState());
                    setKeepGoing(false);
                  },
                },
              ],
            })
          : null,
    },
    h("canvas", {
      ref: cvRef,
      onPointerDown: onDown,
      onPointerUp: onUp,
      style: { cursor: "grab" },
    }),
    h(
      "span",
      null,
      h("span", { className: "gc-key" }, "←"),
      h("span", { className: "gc-key" }, "↑"),
      h("span", { className: "gc-key" }, "↓"),
      h("span", { className: "gc-key" }, "→"),
      " 或 WASD 滑动 · 触屏可拖",
    ),
  );
}

/** 浅色主题下按数值把格色调亮 */
function g2048Lighten(hex, v) {
  const [r, g, b] = hexParts(hex);
  const k = v <= 4 ? 0.12 : v <= 64 ? 0.35 : 0.55;
  const mixTo = (c) => Math.round(c + (255 - c) * k);
  return `rgb(${mixTo(r)},${mixTo(g)},${mixTo(b)})`;
}

attachKernel("2048", {
  SIZE: G2048_SIZE,
  TARGET: G2048_TARGET,
  newState: g2048NewState,
  move: g2048Move,
  slideLine: g2048SlideLine,
  canMove: g2048CanMove,
  spawn: g2048Spawn,
});

defineGame({
  id: "2048",
  name: "2048",
  sub: "2048",
  icon: "🔢",
  tag: "休闲",
  color: "#e8b64a",
  desc: "四向滑动合并，凑出 2048 还能继续往上堆。",
  order: 60,
  component: Game2048,
});

/* ================= game/70-minesweeper.js ================= */
/* ============================================================================
 * 扫雷 —— 三档难度，首点必安全，双键和弦展开。
 *
 * 三个必须做对的细节：
 *   1. 首点必安全：地雷在第一次点击之后才布置，且首点及其 8 邻格一定无雷
 *   2. 空格自动扩散：显示 0 的格子要把 8 邻格一起翻出来（否则要点到手断）
 *   3. 和弦（chord）：已翻开的数字格，周围插满旗时再点一下展开剩余邻居
 *      —— 老手 90% 的操作都在用这个，没有它这游戏没法玩
 * ========================================================================== */

const MS_LEVELS = [
  { name: "初级", w: 9, h: 9, mines: 10 },
  { name: "中级", w: 16, h: 16, mines: 40 },
  { name: "高级", w: 30, h: 16, mines: 99 },
];

const MS_NUM_COLOR = ["", "#5b8def", "#3f9d6b", "#d9694a", "#a0538f", "#b58c1f", "#3fb8a8", "#c0c4cc", "#8b8f98"];

function msNewState(levelIdx) {
  const lv = MS_LEVELS[levelIdx || 0];
  const cells = [];
  for (let i = 0; i < lv.w * lv.h; i += 1) {
    cells.push({ mine: false, adj: 0, state: "hidden" }); /* state: hidden | revealed | flag */
  }
  return {
    levelIdx: levelIdx || 0,
    w: lv.w,
    h: lv.h,
    mineCount: lv.mines,
    cells,
    started: false,
    over: false,
    won: false,
    flags: 0,
    revealed: 0,
    hit: -1,
  };
}

function msNeighbors(st, idx) {
  const x = idx % st.w;
  const y = Math.floor(idx / st.w);
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue;
      out.push(ny * st.w + nx);
    }
  }
  return out;
}

/** 首点后布雷：首点及其邻居挖空 */
function msPlace(st, safeIdx) {
  const cells = st.cells.map((c) => ({ ...c }));
  const banned = new Set([safeIdx, ...msNeighbors(st, safeIdx)]);
  const pool = [];
  for (let i = 0; i < cells.length; i += 1) if (!banned.has(i)) pool.push(i);
  /* 高级图空位足够；初级图也够（81-9=72 > 10）。兜底从全图取 */
  if (pool.length < st.mineCount) {
    pool.length = 0;
    for (let i = 0; i < cells.length; i += 1) if (i !== safeIdx) pool.push(i);
  }
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 0; i < st.mineCount; i += 1) cells[pool[i]].mine = true;
  /* 算每格周围雷数 */
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i].mine) continue;
    cells[i].adj = msNeighbors(st, i).filter((n) => cells[n].mine).length;
  }
  const next = { ...st, cells, started: true };
  return next;
}

/**
 * 翻开一格。返回新 state。
 * 已插旗的格子点不动（要取消旗得右键）。
 */
function msReveal(st, idx) {
  if (st.over || st.won) return st;
  let cur = st.started ? st : msPlace(st, idx);
  const cell = cur.cells[idx];
  if (!cell || cell.state !== "hidden") {
    /* 已翻开的数字 → 尝试和弦 */
    if (cell && cell.state === "revealed" && cell.adj > 0) return msChord(cur, idx);
    return cur;
  }

  const cells = cur.cells.map((c) => ({ ...c }));
  if (cell.mine) {
    cells[idx].state = "revealed";
    /* 踩雷：把所有雷亮出来，标错旗的也标出来 */
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i].mine) cells[i].state = "revealed";
    }
    return { ...cur, cells, over: true, hit: idx };
  }

  /* 广度展开：0 的格子继续扩 */
  const queue = [idx];
  let revealed = cur.revealed;
  while (queue.length) {
    const i = queue.shift();
    if (cells[i].state === "revealed" || cells[i].state === "flag") continue;
    cells[i].state = "revealed";
    revealed += 1;
    if (cells[i].adj === 0) {
      for (const n of msNeighbors(cur, i)) {
        if (cells[n].state === "hidden") queue.push(n);
      }
    }
  }

  const won = revealed >= cells.length - cur.mineCount;
  return { ...cur, cells, revealed, won, over: won };
}

/** 和弦：数字格的旗数够了，展开其余邻居；旗插错了就直接踩雷 */
function msChord(st, idx) {
  const cell = st.cells[idx];
  const nb = msNeighbors(st, idx);
  const flagged = nb.filter((n) => st.cells[n].state === "flag").length;
  if (flagged !== cell.adj) return st;

  const cells = st.cells.map((c) => ({ ...c }));
  let revealed = st.revealed;
  let boom = -1;

  const queue = [];
  for (const n of nb) {
    if (cells[n].state === "hidden") queue.push(n);
  }
  while (queue.length) {
    const i = queue.shift();
    if (cells[i].state === "revealed" || cells[i].state === "flag") continue;
    if (cells[i].mine) {
      boom = i;
      break;
    }
    cells[i].state = "revealed";
    revealed += 1;
    if (cells[i].adj === 0) {
      for (const n of msNeighbors(st, i)) {
        if (cells[n].state === "hidden") queue.push(n);
      }
    }
  }

  if (boom >= 0) {
    for (let i = 0; i < cells.length; i += 1) if (cells[i].mine) cells[i].state = "revealed";
    return { ...st, cells, over: true, hit: boom, revealed };
  }
  const won = revealed >= cells.length - st.mineCount;
  return { ...st, cells, revealed, won, over: won };
}

/** 右键：插旗 / 取消旗 */
function msFlag(st, idx) {
  if (st.over || st.won || !st.started) return st;
  const cell = st.cells[idx];
  if (!cell || cell.state === "revealed") return st;
  const cells = st.cells.map((c) => ({ ...c }));
  if (cell.state === "flag") {
    cells[idx].state = "hidden";
    return { ...st, cells, flags: st.flags - 1 };
  }
  if (st.flags >= st.mineCount) return st;
  cells[idx].state = "flag";
  return { ...st, cells, flags: st.flags + 1 };
}

function MinesweeperGame({ onExit }) {
  const [levelIdx, setLevelIdx] = useState(0);
  const [st, setSt] = useState(() => msNewState(0));
  const [hi, setHi] = useState(() => bestScore(`minesweeper-${0}`));
  const [mouse, setMouse] = useState({ x: -1, y: -1 });
  const cvRef = useFitCanvas(st.w * 30, st.h * 30);
  const wonRef = useRef(false);

  const reset = useCallback((li) => {
    const idx = typeof li === "number" ? li : levelIdx;
    setLevelIdx(idx);
    setSt(msNewState(idx));
    setHi(bestScore(`minesweeper-${idx}`));
    wonRef.current = false;
  }, [levelIdx]);

  const cellFromEvent = useCallback(
    (e) => {
      const cv = cvRef.current;
      if (!cv) return -1;
      const rect = cv.getBoundingClientRect();
      const sc = cv.__scale || 1;
      const cell = 30;
      const x = Math.floor((e.clientX - rect.left) / sc / cell);
      const y = Math.floor((e.clientY - rect.top) / sc / cell);
      if (x < 0 || y < 0 || x >= st.w || y >= st.h) return -1;
      return y * st.w + x;
    },
    [cvRef, st.w, st.h],
  );

  const onDown = (e) => {
    const idx = cellFromEvent(e);
    if (idx < 0) return;
    e.preventDefault();
    if (e.button === 2) {
      setSt((prev) => msFlag(prev, idx));
    } else if (e.button === 0) {
      setSt((prev) => msReveal(prev, idx));
    }
  };

  const onMove = (e) => {
    const cv = cvRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sc = cv.__scale || 1;
    const cell = 30;
    setMouse({
      x: Math.floor((e.clientX - rect.left) / sc / cell),
      y: Math.floor((e.clientY - rect.top) / sc / cell),
    });
  };

  /* 赢了记最快时间不现实（没计时器），记"最少旗数浪费"没意义，
     所以这里记的是该难度的最佳完成次数之外的单一指标：用最少点击。
     简化：只记「是否通关」到最高分榜（分数=难度权重）。 */
  useEffect(() => {
    if (st.won && !wonRef.current) {
      wonRef.current = true;
      const weight = [1000, 3000, 8000][st.levelIdx] || 1000;
      saveScore(`minesweeper-${st.levelIdx}`, weight, "玩家");
      setHi(weight);
    }
    if (!st.won) wonRef.current = false;
  }, [st.won, st.levelIdx]);

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const T = gcTheme();
    const cell = 30;

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, st.w * cell, st.h * cell);

    for (let i = 0; i < st.cells.length; i += 1) {
      const c = st.cells[i];
      const x = (i % st.w) * cell;
      const y = Math.floor(i / st.w) * cell;

      /* 未翻开的格子：凸起感 */
      if (c.state === "hidden") {
        ctx.fillStyle = T.dark ? "#2a2f3d" : "#c8ccd6";
        roundRect(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, 4);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.14)";
        roundRect(ctx, x + 2.5, y + 2.5, cell - 5, 4, 2);
        ctx.fill();
      } else if (c.state === "flag") {
        ctx.fillStyle = T.dark ? "#2a2f3d" : "#c8ccd6";
        roundRect(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, 4);
        ctx.fill();
        /* 小旗 */
        ctx.fillStyle = T.danger;
        ctx.beginPath();
        ctx.moveTo(x + cell * 0.38, y + cell * 0.26);
        ctx.lineTo(x + cell * 0.68, y + cell * 0.38);
        ctx.lineTo(x + cell * 0.38, y + cell * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = T.dark ? "#6a7080" : "#7a8090";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + cell * 0.38, y + cell * 0.26);
        ctx.lineTo(x + cell * 0.38, y + cell * 0.72);
        ctx.stroke();
      } else {
        const isHit = i === st.hit;
        if (c.mine) {
          ctx.fillStyle = isHit ? "rgba(224,136,126,.5)" : T.dark ? "#1e222c" : "#dfe2ea";
          roundRect(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, 4);
          ctx.fill();
          ctx.fillStyle = isHit ? "#fff" : T.dim;
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.22, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = T.dark ? "#191c25" : "#e6e9f0";
          roundRect(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, 4);
          ctx.fill();
          if (c.adj > 0) {
            ctx.fillStyle = MS_NUM_COLOR[c.adj];
            ctx.font = "700 15px -apple-system,PingFang SC,sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(c.adj), x + cell / 2, y + cell / 2 + 1);
          }
        }
      }
    }
    ctx.textBaseline = "alphabetic";

    if (st.over || st.won) {
      ctx.fillStyle = st.won ? "rgba(90,199,116,.22)" : "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, st.w * cell, st.h * cell);
      ctx.fillStyle = "#fff";
      ctx.font = "700 22px -apple-system,PingFang SC,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(st.won ? "扫清了" : "踩雷了", (st.w * cell) / 2, (st.h * cell) / 2);
    }
  }, [st, cvRef]);

  useLoop(true, () => {}, draw, 30);

  const remain = st.mineCount - st.flags;

  return h(
    GameChrome,
    {
      hud: [
        { k: "剩雷", v: String(Math.max(0, remain)) },
        { k: "难度", v: MS_LEVELS[st.levelIdx].name },
        { k: "翻开", v: `${st.revealed}/${st.w * st.h - st.mineCount}` },
      ],
      onRestart: () => reset(),
      overlay: st.over || st.won
        ? h(GameOverlay, {
            title: st.won ? "扫清了" : "踩雷了",
            lines: st.won
              ? [`${MS_LEVELS[st.levelIdx].name}通关。`, "换更高难度试试？"]
              : [`还剩 ${Math.max(0, remain)} 颗没标出来。`, "右键插旗，数字格周围旗插满后左键可一键展开。"],
            actions: [
              { label: "再来一局", primary: true, onClick: () => reset() },
              ...MS_LEVELS.map((l, i) =>
                i === st.levelIdx
                  ? null
                  : { label: l.name, onClick: () => reset(i) },
              ).filter(Boolean),
            ],
          })
        : !st.started
          ? h(GameOverlay, {
              title: "扫雷",
              lines: ["左键翻开，右键插旗。", "第一下点开的格子周围保证没雷。"],
              actions: MS_LEVELS.map((l, i) => ({
                label: `${l.name} ${l.w}×${l.h}`,
                primary: i === 0,
                onClick: () => reset(i),
              })),
            })
          : null,
    },
    h("canvas", {
      ref: cvRef,
      onContextMenu: (e) => e.preventDefault(),
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerLeave: () => setMouse({ x: -1, y: -1 }),
      style: { cursor: "pointer" },
    }),
    h(
      "span",
      null,
      "左键翻开 · 右键插旗 · 数字格旗插满后左键一键展开",
    ),
  );
}

attachKernel("minesweeper", {
  LEVELS: MS_LEVELS,
  newState: msNewState,
  place: msPlace,
  reveal: msReveal,
  flag: msFlag,
  chord: msChord,
  neighbors: msNeighbors,
});

defineGame({
  id: "minesweeper",
  name: "扫雷",
  sub: "MINESWEEPER",
  icon: "💣",
  tag: "经典",
  color: "#7c8cff",
  desc: "首点必安全、空格自动扩散、数字格可一键和弦展开。",
  order: 70,
  component: MinesweeperGame,
});

/* ================= game/80-invaders.js ================= */
/* ============================================================================
 * 小蜜蜂 / 太空侵略者 —— 经典街机的骨架：
 *   · 一排排敌人左右横移，撞到边就整体下降一格
 *   · 敌人越少移得越快（紧张感就来自这里）
 *   · 敌人自己的子弹随机乱飘，玩家只能躲
 *   · 底下的掩体可以被双方子弹打掉，逐块剥落
 *
 * 敌人被打光就进下一波，一波比一波快、一排比一排低。
 * ========================================================================== */

const INV_W = 480;
const INV_H = 560;

const INV_COLS = 8;
const INV_ROWS = 4;
const INV_CW = 34; /* 单只敌人占格 */
const INV_CH = 26;
const INV_TOP = 60;
const INV_LEFT = 34;

const INV_PLAYER_W = 34;
const INV_PLAYER_H = 16;
const INV_PLAYER_Y = INV_H - 42;
const INV_PLAYER_SPEED = 300;
const INV_BULLET_SPEED = 460;
const INV_ENEMY_BULLET_SPEED = 210;

/* 三行三种敌人，分值不同（越靠上越值钱） */
const INV_ROW_STYLE = [
  { color: "#e0887e", score: 30 },
  { color: "#e8b64a", score: 20 },
  { color: "#4fd1c5", score: 15 },
  { color: "#7c8cff", score: 10 },
];

const INV_BUNKER_ROWS = 4;
const INV_BUNKER_COLS = 7;
const INV_BUNKER_CELL = 5;

function invNewWave(st, wave) {
  const wk = wave || 1;
  const enemies = [];
  for (let r = 0; r < INV_ROWS; r += 1) {
    for (let c = 0; c < INV_COLS; c += 1) {
      enemies.push({
        x: INV_LEFT + c * (INV_CW + 12),
        y: INV_TOP + r * (INV_CH + 12),
        row: r,
        alive: true,
      });
    }
  }
  return {
    ...(st || {}),
    wave: wk,
    enemies,
    dir: 1,
    /* 一波比一波快；敌人少了还会再快（见 invStep） */
    baseSpeed: 40 + (wk - 1) * 14,
    player: { x: INV_W / 2 - INV_PLAYER_W / 2, w: INV_PLAYER_W, h: INV_PLAYER_H },
    bullet: null,
    enemyBullets: [],
    bunkers: st && st.bunkers ? st.bunkers : invNewBunkers(),
    lives: st && typeof st.lives === "number" ? st.lives : 3,
    score: st ? st.score : 0,
    phase: "ready", /* ready | play | over */
    dropPending: false,
  };
}

function invNewBunkers() {
  const out = [];
  const count = 3;
  const bw = INV_BUNKER_COLS * INV_BUNKER_CELL;
  const gap = (INV_W - count * bw) / (count + 1);
  for (let b = 0; b < count; b += 1) {
    const ox = gap + b * (bw + gap);
    const oy = INV_H - 130;
    const cells = [];
    for (let r = 0; r < INV_BUNKER_ROWS; r += 1) {
      for (let c = 0; c < INV_BUNKER_COLS; c += 1) {
        /* 顶部两角挖掉，做出拱形 */
        if (r === 0 && (c === 0 || c === INV_BUNKER_COLS - 1)) continue;
        cells.push({ x: ox + c * INV_BUNKER_CELL, y: oy + r * INV_BUNKER_CELL, alive: true });
      }
    }
    out.push({ cells });
  }
  return out;
}

/**
 * 推进一帧。
 * @param {object} st
 * @param {number} dt 秒
 * @param {{left:boolean,right:boolean,fire:boolean}} input
 */
function invStep(st, dt, input) {
  if (st.phase === "over") return st;
  const out = {
    ...st,
    enemies: st.enemies.map((e) => ({ ...e })),
    player: { ...st.player },
    enemyBullets: st.enemyBullets.map((b) => ({ ...b })),
    bunkers: st.bunkers.map((b) => ({ cells: b.cells.map((c) => ({ ...c })) })),
    bullet: st.bullet ? { ...st.bullet } : null,
  };

  /* ---- 玩家 ---- */
  const inp = input || {};
  if (inp.targetX != null) {
    const want = inp.targetX - out.player.w / 2;
    out.player.x += Math.max(-INV_PLAYER_SPEED * 2 * dt, Math.min(INV_PLAYER_SPEED * 2 * dt, want - out.player.x));
  } else {
    const dir = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
    out.player.x += dir * INV_PLAYER_SPEED * dt;
  }
  out.player.x = Math.max(0, Math.min(INV_W - out.player.w, out.player.x));

  /* ---- 开火 ---- */
  if (inp.fire && !out.bullet) {
    out.bullet = { x: out.player.x + out.player.w / 2, y: INV_PLAYER_Y - 4, r: 2.5 };
  }
  if (out.bullet) {
    out.bullet.y -= INV_BULLET_SPEED * dt;
    if (out.bullet.y < -10) out.bullet = null;
  }

  /* ---- 敌人横移 ---- */
  const alive = out.enemies.filter((e) => e.alive);
  if (!alive.length) {
    /* 清屏 → 下一波 */
    const next = invNewWave(out, out.wave + 1);
    next.phase = "play";
    return next;
  }
  const ratio = alive.length / (INV_COLS * INV_ROWS);
  const speed = out.baseSpeed * (1 + (1 - ratio) * 2.4);

  let minX = Infinity;
  let maxX = -Infinity;
  for (const e of alive) {
    minX = Math.min(minX, e.x);
    maxX = Math.max(maxX, e.x + INV_CW);
  }
  const nextX = out.dir > 0 ? maxX + speed * dt : minX - speed * dt;
  if (nextX > INV_W - 8 || nextX < 8) {
    out.dir = -out.dir;
    for (const e of alive) e.y += 12;
  } else {
    for (const e of alive) e.x += out.dir * speed * dt;
  }

  /* ---- 敌人开火 ---- */
  const fireChance = 0.55 + (out.wave - 1) * 0.08;
  if (Math.random() < fireChance * dt * 6 && out.enemyBullets.length < 4) {
    const shooter = alive[Math.floor(Math.random() * alive.length)];
    out.enemyBullets.push({ x: shooter.x + INV_CW / 2, y: shooter.y + INV_CH });
  }
  for (let i = out.enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = out.enemyBullets[i];
    b.y += INV_ENEMY_BULLET_SPEED * dt;
    /* 打掉掩体 */
    let hitBunker = false;
    for (const bk of out.bunkers) {
      for (const c of bk.cells) {
        if (!c.alive) continue;
        if (b.x >= c.x && b.x <= c.x + INV_BUNKER_CELL && b.y >= c.y && b.y <= c.y + INV_BUNKER_CELL) {
          c.alive = false;
          hitBunker = true;
          break;
        }
      }
      if (hitBunker) break;
    }
    if (hitBunker) {
      out.enemyBullets.splice(i, 1);
      continue;
    }
    /* 打到玩家 */
    if (
      b.y >= INV_PLAYER_Y &&
      b.y <= INV_PLAYER_Y + INV_PLAYER_H &&
      b.x >= out.player.x &&
      b.x <= out.player.x + out.player.w
    ) {
      out.enemyBullets.splice(i, 1);
      out.lives -= 1;
      if (out.lives <= 0) {
        out.phase = "over";
        return out;
      }
      /* 复活后短暂无敌感：清掉所有敌弹。
       * 这里必须 length = 0 而不是重新赋值数组，并且要 break —— 外层是
       * 倒序 for 循环，缓存的是索引 i，把数组换掉后下一轮读 out.enemyBullets[i]
       * 就是 undefined，会抛 Cannot read properties of undefined。 */
      out.enemyBullets.length = 0;
      break;
    }
    if (b.y > INV_H) out.enemyBullets.splice(i, 1);
  }

  /* ---- 玩家子弹命中 ---- */
  if (out.bullet) {
    const b = out.bullet;
    /* 先撞掩体（自己的子弹也会打坏掩体） */
    let gone = false;
    for (const bk of out.bunkers) {
      for (const c of bk.cells) {
        if (!c.alive) continue;
        if (b.x >= c.x && b.x <= c.x + INV_BUNKER_CELL && b.y >= c.y && b.y <= c.y + INV_BUNKER_CELL) {
          c.alive = false;
          gone = true;
          break;
        }
      }
      if (gone) break;
    }
    if (!gone) {
      for (const e of out.enemies) {
        if (!e.alive) continue;
        if (b.x >= e.x && b.x <= e.x + INV_CW && b.y >= e.y && b.y <= e.y + INV_CH) {
          e.alive = false;
          out.score += INV_ROW_STYLE[e.row].score * out.wave;
          gone = true;
          break;
        }
      }
    }
    if (gone) out.bullet = null;
  }

  /* ---- 敌人压到底线 = 输 ---- */
  if (out.enemies.some((e) => e.alive && e.y + INV_CH >= INV_PLAYER_Y - 6)) {
    out.phase = "over";
  }
  return out;
}

function InvadersGame({ onExit }) {
  const [st, setSt] = useState(() => invNewWave(null, 1));
  const [running, setRunning] = useState(false);
  const [hi, setHi] = useState(() => bestScore("invaders"));
  const cvRef = useFitCanvas(INV_W, INV_H);
  const inputRef = useRef({ left: false, right: false, fire: false, targetX: null });
  const deadRef = useRef(false);

  const kb = useCallback((key, val) => {
    inputRef.current.targetX = null;
    inputRef.current[key] = val;
  }, []);

  useKeys(running, {
    down: {
      ArrowLeft: () => kb("left", true),
      ArrowRight: () => kb("right", true),
      a: () => kb("left", true),
      d: () => kb("right", true),
      Space: () => kb("fire", true),
    },
    up: {
      ArrowLeft: () => kb("left", false),
      ArrowRight: () => kb("right", false),
      a: () => kb("left", false),
      d: () => kb("right", false),
      Space: () => kb("fire", false),
    },
  });

  useLoop(running, (dt) => {
    setSt((prev) => invStep(prev, dt, inputRef.current));
  }, undefined, 120);

  useEffect(() => {
    if (st.phase === "over" && !deadRef.current) {
      deadRef.current = true;
      setRunning(false);
      const board = saveScore("invaders", st.score, "玩家");
      setHi(board.length ? board[0].score : st.score);
    }
    if (st.phase !== "over") deadRef.current = false;
  }, [st.phase, st.score]);

  const onPointer = useCallback((e) => {
    const cv = cvRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sc = cv.__scale || 1;
    inputRef.current.targetX = (e.clientX - rect.left) / sc;
    inputRef.current.left = false;
    inputRef.current.right = false;
  }, [cvRef]);

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const T = gcTheme();

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, INV_W, INV_H);

    /* 星点背景 */
    ctx.fillStyle = T.dark ? "rgba(255,255,255,.09)" : "rgba(0,0,0,.08)";
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 97) % INV_W;
      const y = (i * 173) % INV_H;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    /* 顶栏 */
    ctx.textAlign = "left";
    ctx.fillStyle = T.dim;
    ctx.font = "600 11px -apple-system,PingFang SC,sans-serif";
    ctx.fillText(`第 ${st.wave} 波`, 10, 22);
    ctx.textAlign = "right";
    ctx.fillStyle = T.fg;
    ctx.font = "700 13px -apple-system,PingFang SC,sans-serif";
    ctx.fillText(String(st.score), INV_W - 10, 22);
    ctx.textAlign = "center";
    ctx.fillStyle = T.dim;
    ctx.font = "600 11px -apple-system,PingFang SC,sans-serif";
    ctx.fillText("♥".repeat(Math.max(0, st.lives)), INV_W / 2, 22);

    /* 掩体 */
    for (const bk of st.bunkers) {
      for (const c of bk.cells) {
        if (!c.alive) continue;
        ctx.fillStyle = T.dark ? "#3f7a5c" : "#3f8a63";
        ctx.fillRect(c.x, c.y, INV_BUNKER_CELL, INV_BUNKER_CELL);
      }
    }

    /* 敌人 */
    for (const e of st.enemies) {
      if (!e.alive) continue;
      const style = INV_ROW_STYLE[e.row];
      ctx.fillStyle = style.color;
      /* 简笔小蜜蜂：身体 + 两侧翼 */
      roundRect(ctx, e.x + 5, e.y + 6, INV_CW - 10, INV_CH - 12, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e.x + 4, e.y + INV_CH / 2, 4, 0, Math.PI * 2);
      ctx.arc(e.x + INV_CW - 4, e.y + INV_CH / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      /* 眼睛 */
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(e.x + 12, e.y + 11, 3, 3);
      ctx.fillRect(e.x + INV_CW - 15, e.y + 11, 3, 3);
    }

    /* 玩家 */
    ctx.fillStyle = T.accent2;
    ctx.beginPath();
    ctx.moveTo(st.player.x + st.player.w / 2, INV_PLAYER_Y);
    ctx.lineTo(st.player.x + st.player.w, INV_PLAYER_Y + st.player.h);
    ctx.lineTo(st.player.x, INV_PLAYER_Y + st.player.h);
    ctx.closePath();
    ctx.fill();

    /* 子弹 */
    if (st.bullet) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(st.bullet.x - 1.5, st.bullet.y - 7, 3, 10);
    }
    ctx.fillStyle = T.danger;
    for (const b of st.enemyBullets) {
      ctx.fillRect(b.x - 1.5, b.y, 3, 9);
    }

    if (st.phase === "over") {
      ctx.fillStyle = "rgba(0,0,0,.62)";
      ctx.fillRect(0, 0, INV_W, INV_H);
      ctx.fillStyle = "#fff";
      ctx.font = "700 22px -apple-system,PingFang SC,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", INV_W / 2, INV_H / 2);
      ctx.font = "12px -apple-system,PingFang SC,sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillText(`第 ${st.wave} 波 · ${fmtNum(st.score)} 分`, INV_W / 2, INV_H / 2 + 24);
    }
  }, [st, cvRef]);

  useLoop(running, () => {}, draw, 60);

  const start = () => {
    const fresh = invNewWave(null, 1);
    setSt({ ...fresh, phase: "play" });
    inputRef.current = { left: false, right: false, fire: false, targetX: null };
    setRunning(true);
  };

  return h(
    GameChrome,
    {
      hud: [
        { k: "分数", v: fmtNum(st.score) },
        { k: "波次", v: String(st.wave) },
        { k: "命", v: String(Math.max(0, st.lives)) },
        { k: "最高", v: fmtNum(hi) },
      ],
      onRestart: () => {
        setSt(invNewWave(null, 1));
        setRunning(false);
      },
      overlay: !running
        ? h(GameOverlay, {
            title: st.phase === "over" ? "被打穿了" : "小蜜蜂",
            lines:
              st.phase === "over"
                ? [`打到第 ${st.wave} 波，${fmtNum(st.score)} 分。`]
                : [
                    "← → 或鼠标移动，空格开火。",
                    "敌人越少飞得越快，别被压到底线。",
                  ],
            actions: [{ label: st.phase === "over" ? "再来一局" : "开始", primary: true, onClick: start }],
          })
        : null,
    },
    h("canvas", {
      ref: cvRef,
      onPointerMove: onPointer,
      onPointerDown: (e) => {
        onPointer(e);
        inputRef.current.fire = true;
      },
      onPointerUp: () => {
        inputRef.current.fire = false;
      },
    }),
    h(
      "span",
      null,
      h("span", { className: "gc-key" }, "←"),
      h("span", { className: "gc-key" }, "→"),
      " 移动 · ",
      h("span", { className: "gc-key" }, "空格"),
      " 开火 · 也可鼠标移动+点射",
    ),
  );
}

attachKernel("invaders", {
  W: INV_W,
  H: INV_H,
  newWave: invNewWave,
  step: invStep,
  newBunkers: invNewBunkers,
});

defineGame({
  id: "invaders",
  name: "小蜜蜂",
  sub: "SPACE INVADERS",
  icon: "👾",
  tag: "街机",
  color: "#5ac774",
  desc: "越打越快，敌人压到底线就输；掩体会被双方的子弹打掉。",
  order: 80,
  component: InvadersGame,
});

/* ================= game/90-gomoku.js ================= */
/* ============================================================================
 * 五子棋 —— 15×15 标准盘，人机对战。
 *
 * AI 不用 minimax（分支太多，JS 单线程算不动），用「棋型打分 + 候选点筛选」：
 *   1. 只考虑已有棋子 2 格范围内的空点（开局 225 点缩到 20-40 点）
 *   2. 每个候选点分别算"我下这里值多少"和"对手下这里值多少"，取大者
 *   3. 打分靠棋型：连五 > 活四 > 冲四/活三 > 眠三/活二 > 眠二
 *   4. 同时成两个活三（双三）或一个活三一个冲四，额外给分 —— 这是必胜手
 *
 * 这套打法强度够业余中上，而且单步 <10ms，不会卡界面。
 * ========================================================================== */

const GOMOKU_N = 15;
const GOMOKU_EMPTY = 0;
const GOMOKU_BLACK = 1;
const GOMOKU_WHITE = 2;

/* 棋型分值。数值是相对权重，不是胜率 */
const GOMOKU_SCORE = {
  FIVE: 10000000, /* 连五 */
  OPEN_FOUR: 500000, /* 活四：两头都空，挡不住 */
  FOUR: 60000, /* 冲四：一头被堵，必须应 */
  OPEN_THREE: 25000, /* 活三：下一步成活四 */
  THREE: 3000, /* 眠三 */
  OPEN_TWO: 1200, /* 活二 */
  TWO: 300, /* 眠二 */
  ONE: 30,
};

const GOMOKU_DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function gomokuNewState(aiFirst) {
  const board = [];
  for (let y = 0; y < GOMOKU_N; y += 1) board.push(new Array(GOMOKU_N).fill(GOMOKU_EMPTY));
  return {
    board,
    turn: GOMOKU_BLACK, /* 黑先 */
    moves: [],
    over: false,
    winner: 0, /* 0=无 1=黑 2=白 3=和 */
    winLine: null,
    aiFirst: !!aiFirst,
  };
}

function gomokuInBounds(x, y) {
  return x >= 0 && y >= 0 && x < GOMOKU_N && y < GOMOKU_N;
}

/** 落子。返回新 state；非法落子返回原 state */
function gomokuPlace(st, x, y) {
  if (st.over) return st;
  if (!gomokuInBounds(x, y) || st.board[y][x] !== GOMOKU_EMPTY) return st;
  const board = st.board.map((r) => r.slice());
  board[y][x] = st.turn;
  const line = gomokuWinLineAt(board, x, y, st.turn);
  const moves = st.moves.concat([{ x, y, c: st.turn }]);
  return {
    ...st,
    board,
    moves,
    turn: st.turn === GOMOKU_BLACK ? GOMOKU_WHITE : GOMOKU_BLACK,
    over: !!line || moves.length >= GOMOKU_N * GOMOKU_N,
    winner: line ? (st.turn === GOMOKU_BLACK ? GOMOKU_BLACK : GOMOKU_WHITE) : moves.length >= GOMOKU_N * GOMOKU_N ? 3 : 0,
    winLine: line,
  };
}

/** 刚从 (x,y) 落子后是否成五，返回五连线或 null */
function gomokuWinLineAt(board, x, y, c) {
  for (const [dx, dy] of GOMOKU_DIRS) {
    const line = [{ x, y }];
    for (let s = 1; s < 5; s += 1) {
      const nx = x + dx * s;
      const ny = y + dy * s;
      if (!gomokuInBounds(nx, ny) || board[ny][nx] !== c) break;
      line.push({ x: nx, y: ny });
    }
    for (let s = 1; s < 5; s += 1) {
      const nx = x - dx * s;
      const ny = y - dy * s;
      if (!gomokuInBounds(nx, ny) || board[ny][nx] !== c) break;
      line.unshift({ x: nx, y: ny });
    }
    if (line.length >= 5) return line.slice(0, 5);
  }
  return null;
}

/**
 * 评估在 (x,y) 落 c 色之后，这一点的棋型总分。
 * 做法：四个方向各自把「假设落子后」的字符串取出来，扫棋型。
 */
function gomokuPointScore(board, x, y, c, plain) {
  let total = 0;
  let openThrees = 0;
  let fours = 0;
  for (const [dx, dy] of GOMOKU_DIRS) {
    /* 取 -4..+4 共 9 格，中心强制视为 c */
    let s = "";
    for (let k = -4; k <= 4; k += 1) {
      if (k === 0) {
        s += "X";
        continue;
      }
      const nx = x + dx * k;
      const ny = y + dy * k;
      if (!gomokuInBounds(nx, ny)) s += "B"; /* 墙当对手子，堵死 */
      else if (board[ny][nx] === c) s += "X";
      else if (board[ny][nx] === GOMOKU_EMPTY) s += "_";
      else s += "B";
    }
    const r = gomokuScanPattern(s);
    total += r.score;
    if (r.openFour) fours += 2;
    else if (r.four) fours += 1;
    if (r.openThree) openThrees += 1;
  }
  /* 双活三 / 四三 / 双四 —— 攻击端的必胜手。简单档不算这一层，
     否则"看起来随机"和"其实会算杀"混在一起，难度档次分不开。 */
  if (!plain) {
    if (openThrees >= 2) total += GOMOKU_SCORE.OPEN_THREE * 3;
    if (fours >= 1 && openThrees >= 1) total += GOMOKU_SCORE.OPEN_FOUR * 2;
    if (fours >= 2) total += GOMOKU_SCORE.OPEN_FOUR * 3;
  }
  return total;
}

/** 扫一段 9 字符的模式串（X=己方 _=空 B=对手/墙），返回该方向的最高棋型 */
function gomokuScanPattern(s) {
  const has = (sub) => s.indexOf(sub) >= 0;
  const out = { score: 0, openFour: false, four: false, openThree: false };

  if (has("XXXXX")) {
    out.score += GOMOKU_SCORE.FIVE;
    return out;
  }
  /* 活四：_XXXX_ */
  if (has("_XXXX_")) {
    out.score += GOMOKU_SCORE.OPEN_FOUR;
    out.openFour = true;
    out.four = true;
    return out;
  }
  /* 冲四：XXXX_ / _XXXX / XX_XX / X_XXX / XXX_X */
  if (has("XXXX_") || has("_XXXX") || has("XX_XX") || has("X_XXX") || has("XXX_X")) {
    out.score += GOMOKU_SCORE.FOUR;
    out.four = true;
    return out;
  }
  /* 活三：_XXX_ / _X_XX_ / _XX_X_ */
  if (has("_XXX_") || has("_X_XX_") || has("_XX_X_")) {
    out.score += GOMOKU_SCORE.OPEN_THREE;
    out.openThree = true;
    return out;
  }
  /* 眠三 */
  if (has("XXX__") || has("__XXX") || has("XX_X") || has("X_XX") || has("X_X_X")) {
    out.score += GOMOKU_SCORE.THREE;
    return out;
  }
  /* 活二 */
  if (has("_XX_") || has("_X_X_")) {
    out.score += GOMOKU_SCORE.OPEN_TWO;
    return out;
  }
  /* 眠二 */
  if (has("XX__") || has("__XX") || has("X__X")) {
    out.score += GOMOKU_SCORE.TWO;
    return out;
  }
  if (has("_X_")) out.score += GOMOKU_SCORE.ONE;
  return out;
}


/**
 * 攻守优先级阶梯。
 *
 * 为什么不能只用 mine*A + theirs 的加权和：那样"堵对手活四"的分数总是高于
 * "自己成活四"，AI 会永远在堵、永远不成杀，两边互相堵满 225 手就是死和棋。
 * 这里按"这一步之后谁先赢"的真实优先级分层：
 *
 *   1. 我能连五           —— 立刻赢，最高
 *   2. 对手能连五         —— 不堵就死，必须堵
 *   3. 我能成活四         —— 两头都空，对手挡不住，等于赢
 *   4. 对手能成活四       —— 同上，反过来
 *   5. 其余按 攻 × 1.15 + 守 排
 *
 * 第 5 层的 1.15 让 AI 在同等条件下偏向进攻，而不是一味防守。
 */
function gomokuRank(mine, theirs) {
  const S = GOMOKU_SCORE;
  if (mine >= S.FIVE) return 1e9 + mine;
  if (theirs >= S.FIVE) return 1e8 + theirs;
  if (mine >= S.OPEN_FOUR) return 1e7 + mine;
  if (theirs >= S.OPEN_FOUR) return 1e6 + theirs;
  return mine * 1.15 + theirs;
}


/** 对手在 (x,y) 落子后是否立刻连五 —— 简单档的最低限度防守判据 */
function gomokuWouldWin(board, x, y, c) {
  const after = placeOnCopy(board, x, y, c);
  return !!gomokuWinLineAt(after, x, y, c);
}

/** 复制棋盘并落子，供 AI 试算用 */
function placeOnCopy(board, x, y, c) {
  const next = board.map((r) => r.slice());
  next[y][x] = c;
  return next;
}

/**
 * 对手在 thisBoard 上最好的一手能得多少分（只看一步，够用）。
 * 只扫「我方刚落子附近」的候选点，范围 1，速度最快的近似。
 */
function bestReplyScore(thisBoard, oppColor, myColor) {
  const cands = gomokuCandidates(thisBoard, 1);
  let best = 0;
  for (const p of cands) {
    const theirs = gomokuPointScore(thisBoard, p.x, p.y, oppColor);
    /* 对手也会顺手堵我，所以取他"进攻分 + 我在这点原本的价值"的最大值 */
    const v = theirs;
    if (v > best) best = v;
  }
  return best;
}

/** 候选点：已有棋子 2 格内的空点 */
function gomokuCandidates(board, range) {
  const r = range || 2;
  const seen = new Set();
  const out = [];
  for (let y = 0; y < GOMOKU_N; y += 1) {
    for (let x = 0; x < GOMOKU_N; x += 1) {
      if (board[y][x] !== GOMOKU_EMPTY) continue;
      let near = false;
      for (let dy = -r; dy <= r && !near; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (!gomokuInBounds(nx, ny)) continue;
          if (board[ny][nx] !== GOMOKU_EMPTY) {
            near = true;
            break;
          }
        }
      }
      if (near && !seen.has(`${x},${y}`)) {
        seen.add(`${x},${y}`);
        out.push({ x, y });
      }
    }
  }
  return out;
}

/**
 * AI 选点。
 * @param {object} st
 * @param {number} me  己方颜色
 * @param {number} [level] 难度 1=简单 2=普通 3=困难
 * @returns {{x:number,y:number}|null}
 */
function gomokuAiMove(st, me, level) {
  const lv = level || 2;
  const opp = me === GOMOKU_BLACK ? GOMOKU_WHITE : GOMOKU_BLACK;
  const board = st.board;

  /* 空盘：走天元 */
  if (!st.moves.length) return { x: 7, y: 7 };

  const cands = gomokuCandidates(board, lv >= 3 ? 2 : 1);
  if (!cands.length) return null;

  /* 简单档：只看自己怎么连，不做双三计算，随机扰动大 */
  const plain = lv === 1;
  const jitter = lv === 1 ? 0.5 : lv === 2 ? 0.06 : 0;

  const scored = [];
  for (const p of cands) {
    const mine = gomokuPointScore(board, p.x, p.y, me, plain);
    const theirs = plain ? 0 : gomokuPointScore(board, p.x, p.y, opp);
    let score = gomokuRank(mine, theirs);
    /* 简单档不主动防守，但对手马上要连五时还是得堵 —— 完全不堵就太假了 */
    if (plain && gomokuWouldWin(board, p.x, p.y, opp)) score += GOMOKU_SCORE.FIVE * 0.8;

    if (jitter > 0) score *= 1 + (Math.random() * 2 - 1) * jitter;

    /* 中心偏好，避免开局乱飞 */
    const cx = Math.abs(p.x - 7);
    const cy = Math.abs(p.y - 7);
    score -= (cx + cy) * (lv === 1 ? 60 : 12);

    scored.push({ p, score, mine, theirs });
  }
  scored.sort((a, b) => b.score - a.score);

  /* 前两档只看一步。困难档再往后看一手：模拟我落子后，
     对手最好的那一手能拿多少分，选"对手最难受"的点 —— 这样才不会
     只顾自己成形，把双三送给对方。 */
  if (lv < 3) return scored[0].p;

  const top = scored.slice(0, 8);
  let best = top[0].p;
  let bestVal = -Infinity;
  for (const cand of top) {
    /* 已经必胜/必堵的点不用再看后续 */
    if (cand.mine >= GOMOKU_SCORE.FIVE) return cand.p;
    const after = placeOnCopy(board, cand.p.x, cand.p.y, me);
    const reply = bestReplyScore(after, opp, me);
    /* 我的收益高、对手回应分低 —— 两者相减 */
    const val = cand.mine + cand.theirs * 0.9 - reply * 1.25;
    if (val > bestVal) {
      bestVal = val;
      best = cand.p;
    }
  }
  return best;
}

function GomokuGame({ onExit }) {
  const [st, setSt] = useState(() => gomokuNewState(false));
  const [level, setLevel] = useState(2);
  const [humanColor, setHumanColor] = useState(GOMOKU_BLACK);
  const [thinking, setThinking] = useState(false);
  const cvRef = useFitCanvas(600, 600);
  const busyRef = useRef(false);

  const reset = useCallback((color, lv) => {
    const c = color === undefined ? humanColor : color;
    const l = lv === undefined ? level : lv;
    setHumanColor(c);
    setLevel(l);
    setSt(gomokuNewState(false));
    setThinking(false);
    busyRef.current = false;
  }, [humanColor, level]);

  /* AI 回合：放到下一个 tick 里算，避免阻塞点击响应 */
  useEffect(() => {
    if (st.over) return undefined;
    const aiColor = humanColor === GOMOKU_BLACK ? GOMOKU_WHITE : GOMOKU_BLACK;
    if (st.turn !== aiColor) return undefined;
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setThinking(true);
    const timer = setTimeout(() => {
      setSt((prev) => {
        if (prev.over || prev.turn !== aiColor) return prev;
        const mv = gomokuAiMove(prev, aiColor, level);
        busyRef.current = false;
        setThinking(false);
        if (!mv) return prev;
        return gomokuPlace(prev, mv.x, mv.y);
      });
    }, 90);
    return () => {
      clearTimeout(timer);
      busyRef.current = false;
    };
  }, [st, humanColor, level]);

  const humanPlay = useCallback(
    (x, y) => {
      setSt((prev) => {
        if (prev.over || prev.turn !== humanColor) return prev;
        return gomokuPlace(prev, x, y);
      });
    },
    [humanColor],
  );

  const onDown = (e) => {
    const cv = cvRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const sc = cv.__scale || 1;
    const px = (e.clientX - rect.left) / sc;
    const py = (e.clientY - rect.top) / sc;
    /* 网格：边距 30，格宽 (600-60)/14 */
    const pad = 30;
    const step = (600 - pad * 2) / (GOMOKU_N - 1);
    const x = Math.round((px - pad) / step);
    const y = Math.round((py - pad) / step);
    if (x < 0 || y < 0 || x >= GOMOKU_N || y >= GOMOKU_N) return;
    humanPlay(x, y);
  };

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const T = gcTheme();
    const pad = 30;
    const step = (600 - pad * 2) / (GOMOKU_N - 1);

    /* 棋盘底色：浅色主题用木色，深色主题用暗木 */
    ctx.fillStyle = T.dark ? "#241f18" : "#dcbf8a";
    ctx.fillRect(0, 0, 600, 600);

    /* 网格 */
    ctx.strokeStyle = T.dark ? "rgba(220,190,138,.28)" : "rgba(60,40,20,.42)";
    ctx.lineWidth = 1;
    for (let i = 0; i < GOMOKU_N; i += 1) {
      const p = pad + i * step;
      ctx.beginPath();
      ctx.moveTo(pad, p);
      ctx.lineTo(600 - pad, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, pad);
      ctx.lineTo(p, 600 - pad);
      ctx.stroke();
    }
    /* 星位 */
    ctx.fillStyle = T.dark ? "rgba(220,190,138,.55)" : "rgba(60,40,20,.7)";
    for (const [sx, sy] of [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]]) {
      ctx.beginPath();
      ctx.arc(pad + sx * step, pad + sy * step, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 棋子 */
    for (let y = 0; y < GOMOKU_N; y += 1) {
      for (let x = 0; x < GOMOKU_N; x += 1) {
        const c = st.board[y][x];
        if (!c) continue;
        const cx = pad + x * step;
        const cy = pad + y * step;
        const r = step * 0.44;
        const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r);
        if (c === GOMOKU_BLACK) {
          grad.addColorStop(0, "#5a5f6b");
          grad.addColorStop(1, "#14161c");
        } else {
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(1, "#c9ced8");
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = T.dark ? "rgba(0,0,0,.5)" : "rgba(70,50,20,.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    /* 最后一步：小红点 */
    const last = st.moves[st.moves.length - 1];
    if (last) {
      ctx.fillStyle = last.c === GOMOKU_BLACK ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.6)";
      ctx.beginPath();
      ctx.arc(pad + last.x * step, pad + last.y * step, step * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 五连高亮 */
    if (st.winLine) {
      ctx.strokeStyle = "#e0887e";
      ctx.lineWidth = 3;
      const a = st.winLine[0];
      const b = st.winLine[st.winLine.length - 1];
      ctx.beginPath();
      ctx.moveTo(pad + a.x * step, pad + a.y * step);
      ctx.lineTo(pad + b.x * step, pad + b.y * step);
      ctx.stroke();
    }
  }, [st, cvRef]);

  useLoop(true, () => {}, draw, 30);

  const aiColor = humanColor === GOMOKU_BLACK ? GOMOKU_WHITE : GOMOKU_BLACK;
  const humanWon = st.over && st.winner === humanColor;
  const aiWon = st.over && st.winner === aiColor;

  return h(
    GameChrome,
    {
      hud: [
        { k: "手数", v: String(st.moves.length) },
        { k: "你", v: humanColor === GOMOKU_BLACK ? "黑" : "白" },
        { k: "难度", v: ["", "简单", "普通", "困难"][level] },
        { k: "状态", v: st.over ? (st.winner === 3 ? "和棋" : "结束") : thinking ? "AI 想…" : "你的回合" },
      ],
      onRestart: () => reset(),
      overlay:
        st.over || st.moves.length === 0
          ? h(GameOverlay, {
              title: st.over ? (st.winner === 3 ? "和棋" : humanWon ? "你赢了" : "AI 赢了") : "五子棋",
              lines: st.over
                ? [`共 ${st.moves.length} 手。`]
                : ["点棋盘落子，黑先。", "先连成五子者胜。"],
              actions: [
                { label: "我执黑（先手）", primary: humanColor === GOMOKU_BLACK, onClick: () => reset(GOMOKU_BLACK) },
                { label: "我执白（后手）", primary: humanColor === GOMOKU_WHITE, onClick: () => reset(GOMOKU_WHITE) },
                { label: "难度 简单", onClick: () => reset(humanColor, 1) },
                { label: "难度 普通", onClick: () => reset(humanColor, 2) },
                { label: "难度 困难", onClick: () => reset(humanColor, 3) },
              ],
            })
          : null,
    },
    h("canvas", { ref: cvRef, onPointerDown: onDown, style: { cursor: "crosshair" } }),
    h("span", null, "点棋盘落子 · 先连五子者胜 · 困难档会算双三和四三"),
  );
}

attachKernel("gomoku", {
  N: GOMOKU_N,
  EMPTY: GOMOKU_EMPTY,
  BLACK: GOMOKU_BLACK,
  WHITE: GOMOKU_WHITE,
  newState: gomokuNewState,
  place: gomokuPlace,
  winLineAt: gomokuWinLineAt,
  pointScore: gomokuPointScore,
  scanPattern: gomokuScanPattern,
  candidates: gomokuCandidates,
  aiMove: gomokuAiMove,
});

defineGame({
  id: "gomoku",
  name: "五子棋",
  sub: "GOMOKU",
  icon: "⚫",
  tag: "棋牌",
  color: "#c0c4cc",
  desc: "15×15 标准盘，AI 会算双活三和四三；三档难度可调。",
  order: 90,
  component: GomokuGame,
});

/* ================= legacy/10-three-kingdoms.js ================= */
/* ============================================================================
 * 三国志 · 回合制战略（迁自 @local/three-kingdoms-strategy）
 *
 * ⚠ 本文件由 tools/import-legacy.mjs 从旧插件 client.js 自动生成，勿手改。
 *   改游戏内核请改旧插件源文件，然后重跑 tools/import-legacy.mjs。
 *   这里只做了三处手术：组件改名收 onExit、open 初值改 true、关闭按钮接外壳。
 * ========================================================================== */

const ThreeKingdomsGame = (function legacyScope() {
    /* ------------------------------------------------------------------ 常量 */

    const STORAGE_KEY = "dsh.three-kingdoms.save.v1";
    const NS = "three-kingdoms-strategy";
    const MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
    const START_YEAR = 207;

    /* ------------------------------------------------------------ 年代设定

       一个年代 = 八城的归属划分 + 开局兵粮。势力表由「谁占到城」反推，
       所以不用为每个年代手写势力列表：189 年自然多出董卓与袁绍，
       207 年自然只剩三家。

       只列差异值，没写的字段沿用 CITY_DEFS 的基准值。 */
    const ERA_DEFS = [
      {
        id: "189",
        year: 189,
        name: "董卓乱政",
        desc: "十常侍既诛，董卓挟天子入洛阳。关东诸侯起兵讨逆，天下自此多事。",
        /* 年代专属调位：曹操此时刚在陈留起兵，不在洛阳，故挪去许昌。
           不写这一条，他会被洛阳的归属带着变成董卓部将。 */
        moves: { caocao: "xuchang", xiahoudun: "xuchang", dianwei: "xuchang" },
        /* 此时尚未出仕的传统「刘备系」名将，一律放在野，等玩家去寻访 */
        free: ["zhaoyun", "huangzhong", "guanyu", "zhangfei", "chendao"],
        cities: {
          luoyang: { owner: "dong", troops: 21000, gold: 2000, food: 24000, wall: 80, morale: 70 },
          changan: { owner: "dong", troops: 15000, gold: 1000, food: 17000 },
          ye: { owner: "yuan", troops: 20000, gold: 1500, food: 22000, wall: 74, morale: 68 },
          xuchang: { owner: "cao", troops: 16000, gold: 1400, food: 15000, agri: 58, comm: 56, wall: 72, morale: 68 },
          xuzhou: { owner: "qian", troops: 12000, gold: 800, food: 12000, wall: 68 },
          chengdu: { owner: "yan", troops: 15000, gold: 1000, food: 17000, wall: 70 },
          xiangyang: { owner: "sun", troops: 9000, gold: 650, food: 8000 },
          jianye: { owner: "sun", troops: 11000, gold: 850, food: 12000 },
        },
      },
      {
        id: "200",
        year: 200,
        name: "官渡之战",
        desc: "袁绍并河北四州，曹操挟天子都许。两雄相持于官渡，天下侧目。",
        cities: {
          ye: { owner: "yuan", troops: 26000, gold: 1800, food: 28000, wall: 76, morale: 70 },
          luoyang: { owner: "cao", troops: 17000, gold: 1500, food: 19000 },
          xuchang: { owner: "cao", troops: 20000, gold: 1600, food: 21000 },
          changan: { owner: "cao", troops: 13000, gold: 900, food: 14000 },
          xuzhou: { owner: "cao", troops: 11000, gold: 700, food: 10000 },
          chengdu: { owner: "liu", troops: 12000, gold: 850, food: 14000 },
          xiangyang: { owner: "sun", troops: 11000, gold: 800, food: 11000 },
          jianye: { owner: "sun", troops: 14000, gold: 1100, food: 14000 },
        },
      },
      {
        id: "207",
        year: 207,
        name: "卧龙出山",
        desc: "官渡之后，曹操已并河北。刘备寄身荆州，孙权坐领江东。",
        cities: {
          ye: { owner: "cao", troops: 13000, gold: 900, food: 14000 },
          changan: { owner: "cao", troops: 11000, gold: 800, food: 12000 },
          luoyang: { owner: "cao", troops: 16000, gold: 1400, food: 18000 },
          xuchang: { owner: "cao", troops: 14000, gold: 1100, food: 15000 },
          xuzhou: { owner: "liu", troops: 12000, gold: 700, food: 11000 },
          xiangyang: { owner: "sun", troops: 10000, gold: 750, food: 10000 },
          jianye: { owner: "sun", troops: 16000, gold: 1200, food: 16000 },
          chengdu: { owner: "liu", troops: 14000, gold: 900, food: 16000 },
        },
      },
      {
        id: "214",
        year: 214,
        name: "益州既得",
        desc: "刘备入蜀，关羽镇荆州。曹操定关中，孙权据江东。三分之势初成。",
        moves: { guanyu: "xiangyang", zhangfei: "chengdu", huanggai: "jianye" },
        cities: {
          ye: { owner: "cao", troops: 16000, gold: 1200, food: 17000 },
          luoyang: { owner: "cao", troops: 18000, gold: 1600, food: 20000 },
          xuchang: { owner: "cao", troops: 17000, gold: 1400, food: 18000 },
          changan: { owner: "cao", troops: 13000, gold: 900, food: 14000 },
          xuzhou: { owner: "cao", troops: 12000, gold: 800, food: 11000 },
          chengdu: { owner: "liu", troops: 20000, gold: 1500, food: 22000, agri: 76, comm: 60, wall: 68 },
          xiangyang: { owner: "liu", troops: 13000, gold: 900, food: 12000 },
          jianye: { owner: "sun", troops: 19000, gold: 1500, food: 19000 },
        },
      },
    ];

    function eraById(id) {
      return ERA_DEFS.filter((e) => e.id === id)[0] || ERA_DEFS[2];
    }

    /* 势力与「谁是玩家」完全解耦：玩家开局任选其一，全局状态记
       game.playerFaction。代码里不许出现字面量 "player"，否则选了曹操
       也会按刘备结算。 */
    /* 全部势力（含只在早期年代出现的董卓、袁绍）。
       一局里实际参战的势力由年代的城市归属反推 —— 见 factionsOf(era)。 */
    const ALL_FACTIONS = {
      cao: {
        id: "cao", name: "曹操军", family: "曹", flag: "曹",
        color: "#c2544a",
        desc: "据中原之地，兵多粮足。谋士如云，正面碾压。",
      },
      liu: {
        id: "liu", name: "刘备军", family: "刘", flag: "刘",
        color: "#4a7fd4",
        desc: "徐州、成都两地，隔空相望。有关张万人敌，卧龙凤雏在野，靠名将翻盘。",
      },
      sun: {
        id: "sun", name: "孙权军", family: "孙", flag: "孙",
        color: "#3f9e6a",
        desc: "坐断东南，据襄阳建业。周瑜统帅，水陆并进，最考操作。",
      },
      dong: {
        id: "dong", name: "董卓军", family: "董", flag: "董",
        color: "#8b5cf6",
        desc: "挟天子以令诸侯，吕布为爪牙。兵甲天下之最，然人心不附。",
      },
      yuan: {
        id: "yuan", name: "袁绍军", family: "袁", flag: "袁",
        color: "#b08a3e",
        desc: "四世三公，坐拥河北。兵多而不精，谋臣相忌，最忌久战。",
      },
      yan: {
        id: "yan", name: "刘焉军", family: "焉", flag: "焉",
        color: "#4f8f8a",
        desc: "益州天府，闭关自守。张任严颜皆川中名将，守成有余，进取不足。",
      },
      qian: {
        id: "qian", name: "陶谦军", family: "陶", flag: "陶",
        color: "#9c7b5c",
        desc: "徐州牧陶谦，老成持重。地处四战，兵甲不修，最易遭人觊觎。",
      },
    };

    /* 年代 → 参战势力（按城数降序，作为默认展示顺序） */
    function factionsOf(era) {
      const cityOwners = {};
      Object.keys(era.cities).forEach((cid) => {
        const o = era.cities[cid].owner;
        cityOwners[o] = (cityOwners[o] || 0) + 1;
      });
      Object.keys(CITY_DEFS).forEach((k) => {
        const c = CITY_DEFS[k];
        if (!era.cities[c.id]) cityOwners[c.owner] = (cityOwners[c.owner] || 0) + 1;
      });
      return Object.keys(cityOwners).sort((a, b) => {
        if (cityOwners[b] !== cityOwners[a]) return cityOwners[b] - cityOwners[a];
        return FACTION_ORDER.indexOf(a) - FACTION_ORDER.indexOf(b);
      });
    }
    const FACTION_ORDER = ["cao", "liu", "sun", "yuan", "dong", "yan", "qian"];

    /* 八城。x/y 是地图上的百分比坐标（0-100）。adj 是相邻关系。 */
    const CITY_DEFS = [
      {
        id: "ye", name: "邺城", x: 64, y: 11, owner: "cao",
        adj: ["luoyang", "xuchang"],
        troops: 13000, gold: 900, food: 14000,
        agri: 62, comm: 55, wall: 70, morale: 62,
      },
      {
        id: "changan", name: "长安", x: 13, y: 27, owner: "cao",
        adj: ["luoyang", "chengdu"],
        troops: 11000, gold: 800, food: 12000,
        agri: 55, comm: 60, wall: 72, morale: 60,
      },
      {
        id: "luoyang", name: "洛阳", x: 39, y: 23, owner: "cao",
        adj: ["ye", "changan", "xuchang", "xuzhou"],
        troops: 16000, gold: 1400, food: 18000,
        agri: 70, comm: 78, wall: 78, morale: 66,
      },
      {
        id: "xuchang", name: "许昌", x: 48, y: 45, owner: "cao",
        adj: ["ye", "luoyang", "xuzhou", "xiangyang"],
        troops: 14000, gold: 1100, food: 15000,
        agri: 68, comm: 66, wall: 66, morale: 62,
      },
      {
        id: "xuzhou", name: "徐州", x: 77, y: 32, owner: "liu",
        adj: ["luoyang", "xuchang", "jianye"],
        troops: 12000, gold: 700, food: 11000,
        agri: 52, comm: 48, wall: 54, morale: 58,
      },
      {
        id: "xiangyang", name: "襄阳", x: 39, y: 66, owner: "sun",
        adj: ["xuchang", "jianye", "chengdu"],
        troops: 10000, gold: 750, food: 10000,
        agri: 56, comm: 52, wall: 64, morale: 58,
      },
      {
        id: "jianye", name: "建业", x: 79, y: 71, owner: "sun",
        adj: ["xuzhou", "xiangyang"],
        troops: 16000, gold: 1200, food: 16000,
        agri: 66, comm: 66, wall: 70, morale: 66,
      },
      {
        id: "chengdu", name: "成都", x: 12, y: 73, owner: "liu",
        adj: ["changan", "xiangyang"],
        troops: 14000, gold: 900, food: 16000,
        agri: 72, comm: 50, wall: 62, morale: 64,
      },
    ];

    /* 武将：war 武力 / int 智力 / lead 统率。统率决定能带多少兵（×400）。
       city 为 null 的是在野武将，seek 指明在哪个城能被寻访到（见「招募」）。 */
    /* faction 是「这个年代里他归谁」；在野的写 null。改名换姓的历史差异体现为
       不同年代下同一批人的归属变动，而属性恒定 —— 我们不重写史书，只重排棋盘。 */
    const GENERAL_DEFS = [
      /* ---- 刘备系 ---- */
      { key: "zhugeliang", name: "诸葛亮", war: 38, int: 100, lead: 100, city: "chengdu", faction: "liu", born: 181, died: 234 },
      { key: "zhaoyun", name: "赵云", war: 96, int: 76, lead: 91, city: "chengdu", faction: "liu", born: 168, died: 229, seek: "chengdu" },
      { key: "huangzhong", name: "黄忠", war: 92, int: 60, lead: 88, city: "chengdu", faction: "liu", born: 148, died: 220, seek: "xiangyang" },
      { key: "weiyan", name: "魏延", war: 90, int: 49, lead: 80, city: "chengdu", faction: "liu", born: 175, died: 234 },
      { key: "guanyu", name: "关羽", war: 97, int: 75, lead: 95, city: "xuzhou", faction: "liu", born: 160, died: 220, seek: "xuzhou" },
      { key: "zhangfei", name: "张飞", war: 98, int: 30, lead: 85, city: "xuzhou", faction: "liu", born: 165, died: 221, seek: "xuzhou" },
      { key: "chendao", name: "陈到", war: 80, int: 60, lead: 72, city: "xuzhou", faction: "liu", born: 170, died: 230, seek: "xuzhou" },
      /* ---- 曹操系 ---- */
      { key: "caocao", name: "曹操", war: 72, int: 91, lead: 96, city: "luoyang", faction: "cao", born: 155, died: 220 },
      { key: "simayi", name: "司马懿", war: 63, int: 96, lead: 92, city: "luoyang", faction: "cao", born: 179, died: 251 },
      { key: "dianwei", name: "典韦", war: 95, int: 30, lead: 76, city: "luoyang", faction: "cao", born: 155, died: 197 },
      { key: "zhangliao", name: "张辽", war: 92, int: 78, lead: 93, city: "ye", faction: "cao", born: 169, died: 222 },
      { key: "xuchu", name: "许褚", war: 96, int: 25, lead: 78, city: "ye", faction: "cao", born: 170, died: 230 },
      { key: "xiahoudun", name: "夏侯惇", war: 90, int: 50, lead: 85, city: "changan", faction: "cao", born: 157, died: 220 },
      { key: "xuhuang", name: "徐晃", war: 88, int: 60, lead: 88, city: "changan", faction: "cao", born: 169, died: 227 },
      { key: "caoren", name: "曹仁", war: 84, int: 58, lead: 82, city: "xuchang", faction: "cao", born: 168, died: 223 },
      { key: "yujin", name: "于禁", war: 78, int: 56, lead: 84, city: "xuchang", faction: "cao", born: 159, died: 221 },
      /* ---- 孙权系 ---- */
      { key: "zhouyu", name: "周瑜", war: 71, int: 96, lead: 94, city: "xiangyang", faction: "sun", born: 175, died: 210 },
      { key: "huanggai", name: "黄盖", war: 80, int: 62, lead: 76, city: "xiangyang", faction: "sun", born: 145, died: 215 },
      { key: "sunjian", name: "孙坚", war: 90, int: 68, lead: 88, city: "xiangyang", faction: "sun", born: 155, died: 191 },
      { key: "chengpu", name: "程普", war: 80, int: 66, lead: 78, city: "jianye", faction: "sun", born: 150, died: 210 },
      { key: "sunquan", name: "孙权", war: 60, int: 80, lead: 80, city: "jianye", faction: "sun", born: 182, died: 252 },
      { key: "ganning", name: "甘宁", war: 94, int: 44, lead: 85, city: "jianye", faction: "sun", born: 175, died: 220 },
      { key: "luxun", name: "陆逊", war: 60, int: 87, lead: 90, city: "jianye", faction: "sun", born: 183, died: 245 },
      /* ---- 董卓系：只在 189 年登场 ---- */
      { key: "dongzhuo", name: "董卓", war: 85, int: 62, lead: 88, city: "luoyang", faction: "dong", born: 140, died: 192 },
      { key: "lvbu", name: "吕布", war: 100, int: 26, lead: 87, city: "luoyang", faction: "dong", born: 160, died: 199 },
      { key: "liruj", name: "李儒", war: 30, int: 92, lead: 68, city: "changan", faction: "dong", born: 160, died: 192 },
      { key: "huaxiong", name: "华雄", war: 92, int: 40, lead: 78, city: "changan", faction: "dong", born: 160, died: 191 },
      /* ---- 袁绍系：只在 189 / 200 年登场 ---- */
      { key: "yuanshao", name: "袁绍", war: 68, int: 74, lead: 90, city: "ye", faction: "yuan", born: 154, died: 202 },
      { key: "yanliang", name: "颜良", war: 94, int: 34, lead: 82, city: "ye", faction: "yuan", born: 160, died: 200 },
      { key: "wenzhou", name: "文丑", war: 93, int: 30, lead: 80, city: "ye", faction: "yuan", born: 160, died: 200 },
      { key: "jushou", name: "沮授", war: 45, int: 94, lead: 76, city: "ye", faction: "yuan", born: 155, died: 200 },
      /* ---- 刘焉系：只在 189 年据有益州 ---- */
      { key: "liuyan", name: "刘焉", war: 40, int: 78, lead: 80, city: "chengdu", faction: "yan", born: 130, died: 194 },
      { key: "zhangren", name: "张任", war: 92, int: 74, lead: 84, city: "chengdu", faction: "yan", born: 165, died: 213 },
      { key: "yanyan", name: "严颜", war: 84, int: 66, lead: 80, city: "chengdu", faction: "yan", born: 150, died: 220 },
      /* ---- 陶谦系：189 年据徐州 ---- */
      { key: "taoqian", name: "陶谦", war: 30, int: 70, lead: 74, city: "xuzhou", faction: "qian", born: 132, died: 194 },
      { key: "caobao", name: "曹豹", war: 68, int: 40, lead: 66, city: "xuzhou", faction: "qian", born: 160, died: 196 },
      { key: "chendeng", name: "陈登", war: 48, int: 86, lead: 72, city: "xuzhou", faction: "qian", born: 163, died: 201 },
      /* ---- 在野武将：city=null，只能在 seek 指定的城里寻访登用 ---- */
      { key: "taishici", name: "太史慈", war: 93, int: 58, lead: 86, city: null, seek: "jianye", faction: null, born: 166, died: 206 },
      { key: "xushu", name: "徐庶", war: 68, int: 92, lead: 82, city: null, seek: "xuchang", faction: null, born: 170, died: 232 },
      { key: "pangtong", name: "庞统", war: 42, int: 97, lead: 88, city: null, seek: "xiangyang", faction: null, born: 179, died: 214 },
      { key: "huatuo", name: "华佗", war: 20, int: 88, lead: 40, city: null, seek: "xuzhou", faction: null, born: 145, died: 208 },
      { key: "tianfeng", name: "田丰", war: 30, int: 94, lead: 70, city: null, seek: "ye", faction: null, born: 155, died: 200 },
      { key: "machao", name: "马超", war: 97, int: 44, lead: 90, city: null, seek: "changan", faction: null, born: 176, died: 222 },
      { key: "fazheng", name: "法正", war: 47, int: 94, lead: 78, city: null, seek: "chengdu", faction: null, born: 176, died: 220 },
    ];

    /* 计略：智力门槛 + 效果。火计是这套战斗模型的核心。 */
    const TACTICS = {
      none: { id: "none", name: "强攻", need: 0, desc: "不用计略，两军正面硬撼。" },
      fire: {
        id: "fire", name: "火攻", need: 80,
        desc: "智力 ≥ 80 方可用。成败取决于智力差，命中则守军大损。诸葛亮火计必中且伤害翻倍。",
      },
      ambush: {
        id: "ambush", name: "伏兵", need: 60,
        desc: "智力 ≥ 60 方可用。命中则守军前三回合攻势减半。",
      },
      discord: {
        id: "discord", name: "离间", need: 70,
        desc: "智力 ≥ 70 方可用。命中则守军士气大跌、城防打折。",
      },
    };

    /* AI 调参旋钮。
       旧版只有一个 34% 概率 + 每势力每月至多一战，且 AI 从不调将、从不招募，
       占下的城若没留下将就永久失去出兵能力 —— 玩家眼中就是「电脑太弱智」。
       现在改成「按收益排序的多路进攻 + 调将 + 招募」：
       AI_AGGRESSION 只决定「这回合打不打」，不再决定「只能打一次」。 */
    const AI_AGGRESSION = 0.5;    /* 有可行目标时，本回合出手的概率 */
    const AI_MIN_SURVIVORS = 0.35; /* 预演里残兵低于这个比例就不打（惨胜不值） */
    const AI_MIN_SEND = 6000;
    const AI_MAX_ATTACKS = 1;     /* 每势力每月最多打几路 */
    const AI_DRAFT_THRESHOLD = 16000;
    /* 兵员不是免费能源：征兵单价随城中存量递增（见 doDomestic）。
       硬上限会直接杀死进攻 —— 攻方带兵受统率限制，守方却吃城防加成，
       一刀切的天花板让双方都停在同一个数上，于是谁也不敢打、谁也打不穿。 */
    const DRAFT_COST_STEP = 40;

    const MAX_BATTLE_ROUNDS = 8;
    const ROUT_RATIO = 0.3; /* 兵力跌破出阵时的三成即溃 */

    /* 伤害公式。atkDmg = atk × (BASE + war/1200) × 士气 × 随机抖动；
       守方再乘 wallFactor（城防）。城防除数从 500 收到 300：
       旧值下 wall 从 0 拉到 100 只值 1.2 倍减伤，筑城完全是废操作。 */
    const DMG_BASE = 0.07;
    const DMG_WAR_DIV = 1200;
    const DMG_JITTER = 0.15;
    const WALL_DIV = 700;
    const WALL_DIV_DISCORD = 700; /* 离间成功后城防效果打折 */

    /* 粮、士气这两条约束的旋钮。
       旧版粮产 agri*14+200 对消耗 troops/100，永远盈余，于是「开垦」毫无意义，
       「征兵」是唯一值得按的按钮。现在征兵本身要吃粮，且月耗翻倍 ——
       想扩军就必须先把农业拉起来。 */
    const FOOD_PER_CONSCRIPT = 0.6; /* 每征一兵耗粮 */
    const UPKEEP_DIV = 40;          /* 每 UPKEEP_DIV 名兵月耗一石粮 */
    const DESERT_MORALE = 45;       /* 士气低于此值开始逃亡 */
    const DESERT_DIV = 300;         /* 逃亡比例 = (阈值-士气)/300 */

    /* ------------------------------------------------------------------ 工具 */

    const rand = (a, b) => a + Math.random() * (b - a);
    const roll = (p) => Math.random() < p;
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const fmt = (n) => Math.round(n).toLocaleString("zh-CN");

    function cityById(game, id) {
      return game.cities.find((c) => c.id === id);
    }
    function generalOf(game, key) {
      return game.generals.find((g) => g.key === key);
    }
    function generalsIn(game, cityId) {
      return game.generals.filter((g) => g.cityId === cityId);
    }
    function bestDefender(game, cityId) {
      const list = generalsIn(game, cityId);
      if (!list.length) return null;
      return list.slice().sort((a, b) => b.lead + b.war * 0.4 - (a.lead + a.war * 0.4))[0];
    }
    function ownerCities(game, owner) {
      return game.cities.filter((c) => c.owner === owner);
    }
    function maxLead(general) {
      return Math.round(general.lead * 400);
    }

    /* -------------------------------------------------------------- 建立新局 */

    /* 某个年代下，这个武将是否已经登场。
       生于年代之后的不出场（207 年没有陆逊，才 24 岁但已从军，故按 born+16 起算；
       死于年代之前的不出场（189 年没有黄盖——黄盖 145 年生，这年 44 岁，仍在）。
       数据不追求史实精确，只求「换个年代换一批人」的手感。 */
    function isActiveAt(gen, year) {
      const startAge = 16;
      if (year < gen.born + startAge) return false;
      if (year > gen.died) return false;
      return true;
    }

    /**
     * 建立新局。
     * @param playerFaction 玩家选的势力 id
     * @param eraId 年代 id（见 ERA_DEFS），省略等于默认年代
     *
     * 城归属与初始兵粮来自年代表；武将归属跟着「他所驻的城」走：
     * 城池属于谁，城里的非在野武将就归谁 —— 所以 189 年袁绍据邺城，
     * 张辽若守邺城就自动变袁绍军，不需要为每个年代写一份武将表。
     */
    function createGame(playerFaction, eraId) {
      const era = eraById(eraId);
      const factions = factionsOf(era);
      /* UI 只列本年代的势力，但 createGame 是导出函数，可能被直接调用。
         选了本年代不存在的势力（如 207 年选董卓）就回退到首个势力，
         否则会造出一个没有城池的玩家，开局即败。 */
      const me = factions.includes(playerFaction) ? playerFaction : factions[0];

      const cities = CITY_DEFS.map((d) => {
        const patch = era.cities[d.id] || {};
        const merged = Object.assign({}, clone(d), patch, {
          doneDomestic: false,
          doneMarch: false,
          doneRecruit: false,
        });
        /* 年代表只写了变化字段，x/y/adj 始终沿用基准值 */
        merged.x = d.x;
        merged.y = d.y;
        merged.adj = d.adj.slice();
        return merged;
      });

      /* 定义里用 city，运行态统一用 cityId —— 早期版本忘了这一步，
         结果是「守将恒为空、AI 永远不出兵」，地图上两军从不交战。 */
      const generals = GENERAL_DEFS.filter((g) => isActiveAt(g, era.year)).map((g) => {
        const out = Object.assign({}, g, {
          cityId: g.city || null,
          troops: 0,
          captured: false,
        });
        /* 年代专属调位优先于默认驻地；free 名单里的武将在本年代尚未出仕 */
        if (era.moves && era.moves[g.key]) out.cityId = era.moves[g.key];
        if (era.free && era.free.indexOf(g.key) >= 0) {
          out.cityId = null;
          out.faction = null;
        }
        /* 非在野武将的势力 = 他所在城池当前的归属 */
        if (out.cityId) {
          const c = cities.filter((x) => x.id === out.cityId)[0];
          out.faction = c ? c.owner : out.faction;
        }
        return out;
      });

      return {
        version: 3,
        playerFaction: me,
        eraId: era.id,
        eraName: era.name,
        year: era.year,
        month: 0,
        turn: 1,
        factions,
        cities,
        generals,
        report: [],
        outcome: null,
        recruitLog: [],
      };
    }

    /* ---------------------------------------------------------------- 招募 */

    /**
     * 招募 = 寻访 + 登用，每城每月各一次。
     *
     * 模型：城内武将的「德望」决定能不能请动在野贤才。
     *   rate = 0.28 + (bestInt - 50) * 0.006 + (我方城数 - 1) * 0.03
     * 诸葛亮（智 100）、庞统（智 97）这类在野大才门槛高，需要高智将领坐镇。
     * 失败不会让武将消失，下月可再试 —— 否则一次手滑就永久丢人。
     */
    function doRecruit(game, cityId) {
      const g = clone(game);
      const city = cityById(g, cityId);
      if (!city) return { game, message: "城池不存在。" };
      if (!(g.factions || []).includes(city.owner)) {
        return { game, message: "这座城不属于任何在战势力。" };
      }
      if (city.doneRecruit) return { game, message: "本城本月已寻访过。" };

      const pool = g.generals.filter(
        (x) => x.cityId === null && x.seek === cityId && !x.captured,
      );
      if (!pool.length) {
        g.cities.find((c) => c.id === cityId).doneRecruit = true;
        return { game: g, message: `${city.name} 暂无在野贤才。` };
      }

      const inCity = generalsIn(g, cityId);
      const bestInt = inCity.length ? Math.max(...inCity.map((x) => x.int)) : 50;
      /* 势力规模用「该城归属方」统计：AI 也需要按自己的体量算成功率 */
      const ownedCount = ownerCities(g, city.owner).length;
      const rate = clamp(0.28 + (bestInt - 50) * 0.006 + (ownedCount - 1) * 0.03, 0.1, 0.92);

      /* 取该城最难得的（智力最高）在野武将先试 */
      const target = pool.slice().sort((a, b) => b.int - a.int)[0];
      g.cities.find((c) => c.id === cityId).doneRecruit = true;

      if (roll(rate)) {
        const gen = g.generals.find((x) => x.key === target.key);
        gen.cityId = cityId;
        gen.faction = city.owner;
        gen.captured = false;
        gen.loyalty = 70;
        g.recruitLog.push(`${gen.name} 加入 ${ALL_FACTIONS[city.owner] ? ALL_FACTIONS[city.owner].name : city.owner}。`);
        return {
          game: g,
          message: `登用成功：${target.name}（武 ${target.war} / 智 ${target.int}）归顺！`,
        };
      }

      g.recruitLog.push(`${target.name} 婉拒了招揽。`);
      return {
        game: g,
        message: `${target.name} 婉拒了招揽（成功率 ${Math.round(rate * 100)}%）。`,
      };
    }

    /* ------------------------------------------------ AI 的战役预演 */

    /**
     * 出兵前先在无随机数的情况下把这一仗走一遍，据此判断能不能赢。
     *
     * 曾经的写法是「所需兵力 = 守军 × (1 + 城防/300) × AI_MIN_MARGIN」。
     * 但城防在战斗里本来就是守方每回合的伤害系数，这里又乘一次，同一个因素
     * 被算了两遍：门槛变成约 1.7 倍兵力。等双方都养到统率上限，谁都不达标，
     * 于是永远僵持 —— 这正是「电脑太弱智」的第二层含义：不是不打，是不敢打。
     *
     * 这里复用与 doBattle 完全一致的伤害公式（关掉随机抖动、不计计略，
     * 偏保守），返回是否取胜与残兵比例，供 AI 排序用。
     */
    function estimateAttack(src, tgt, gen, send, defender) {
      const defTroops = Math.max(tgt.troops, 1);
      const defWar = defender ? defender.war : 50;
      const defMorale = clamp(tgt.morale, 0, 100);
      const wallFactor = 1 + tgt.wall / WALL_DIV;

      let atk = send;
      let def = defTroops;
      const atkRout = send * ROUT_RATIO;
      const defRout = defTroops * ROUT_RATIO;
      const atkM = 0.85 + clamp(src.morale, 0, 100) / 300;
      const defM = 0.85 + defMorale / 300;

      let round = 0;
      while (round < MAX_BATTLE_ROUNDS && atk > atkRout && def > defRout) {
        round += 1;
        const atkDmg = atk * (DMG_BASE + gen.war / DMG_WAR_DIV) * atkM;
        const defDmg = def * (DMG_BASE + defWar / DMG_WAR_DIV) * defM * wallFactor;
        def = Math.max(0, def - atkDmg);
        atk = Math.max(0, atk - defDmg);
      }

      const win = def <= defRout || def <= 0;
      /* 残兵比例：赢下来的余量，用来排序「哪一仗最划算」 */
      const survivors = atk / Math.max(send, 1);
      return { win, survivors, rounds: round };
    }

    /* ---------------------------------------------------------------- 调将 */

    /**
     * 调将：把一个武将挪到自己的另一座城。
     *
     * 旧版根本没有这个功能 —— 武将的 cityId 只在破城时被改写，
     * 于是成都的赵云永远到不了徐州，前方的城也永远补不上将。
     * 规则：只能在己方城池之间调动，每月每将一次（doneMove），
     * 且出发城不能因此变空 —— 空城会被 AI 当软柿子捏穿整条防线。
     */
    function doMoveGeneral(game, fromId, toId, key) {
      const g = clone(game);
      const from = cityById(g, fromId);
      const to = cityById(g, toId);
      const gen = generalOf(g, key);
      if (!from || !to || !gen) return { game, message: "调将条件不足。" };
      if (from.owner !== g.playerFaction && gen.faction !== from.owner) {
        return { game, message: "只能调动自己的武将。" };
      }
      if (gen.cityId !== from.id) return { game, message: `${gen.name} 不在 ${from.name}。` };
      if (to.owner !== from.owner) return { game, message: `只能调往己方城池（${to.name} 不是）。` };
      if (from.id === to.id) return { game, message: "出发城与目标城相同。" };
      if (gen.doneMove) return { game, message: `${gen.name} 本月已调动过。` };
      if (generalsIn(g, from.id).length <= 1 && cityById(g, from.id).troops > 0) {
        return { game, message: `${from.name} 只剩 ${gen.name} 一员将，调走就成了无将之城。` };
      }
      gen.cityId = to.id;
      gen.faction = to.owner;
      gen.doneMove = true;
      return { game: g, message: `${gen.name} 自 ${from.name} 移驻 ${to.name}。` };
    }

    /* ---------------------------------------------------------------- 内政 */

    function doDomestic(game, cityId, kind) {
      const g = clone(game);
      const city = cityById(g, cityId);
      if (!city || city.doneDomestic) return { game, message: "本城本月已做过内政。" };
      let message = "";

      if (kind === "farm") {
        if (city.gold < 150) return { game, message: "金不足 150。" };
        city.gold -= 150;
        const up = Math.round(rand(3, 6));
        city.agri = clamp(city.agri + up, 0, 100);
        message = `开垦：${city.name} 农业 +${up}（现 ${city.agri}）。`;
      } else if (kind === "trade") {
        if (city.gold < 150) return { game, message: "金不足 150。" };
        city.gold -= 150;
        const up = Math.round(rand(3, 6));
        city.comm = clamp(city.comm + up, 0, 100);
        message = `商业：${city.name} 商业 +${up}（现 ${city.comm}）。`;
      } else if (kind === "draft") {
        /* 征兵现在同时吃金与粮：旧的「只花 200 金、兵白送」让其余内政全成废操作。
           而且单价随城中存量递增 —— 想在一座城里堆出十万大军，边际成本会先压垮你，
           于是「把兵铺开、把粮养住」成了真正的决策，而不是无脑重复同一个按钮。 */
        const cost = 200 + Math.floor(city.troops / DRAFT_COST_STEP);
        if (city.gold < cost) {
          return { game, message: `金不足 ${fmt(cost)}（兵越多募兵越贵），无法征兵。` };
        }
        const add = Math.round(1200 + city.comm * 20 + rand(0, 400));
        const foodCost = Math.round(add * FOOD_PER_CONSCRIPT);
        if (city.food < foodCost) {
          return {
            game,
            message: `粮不足 ${fmt(foodCost)}，征不出这 ${fmt(add)} 兵。先开垦。`,
          };
        }
        city.gold -= cost;
        city.food -= foodCost;
        city.troops += add;
        message = `征兵：${city.name} 得兵 ${fmt(add)}（耗金 ${fmt(cost)} / 粮 ${fmt(foodCost)}，现兵 ${fmt(city.troops)}）。`;
      } else if (kind === "drill") {
        if (city.gold < 100) return { game, message: "金不足 100。" };
        city.gold -= 100;
        const up = Math.round(rand(5, 9));
        city.morale = clamp(city.morale + up, 0, 100);
        message =
          city.morale >= DESERT_MORALE + 10
            ? `训练：${city.name} 士气 +${up}（现 ${city.morale}，无逃亡之虞）。`
            : `训练：${city.name} 士气 +${up}（现 ${city.morale}，仍低于 ${DESERT_MORALE} 会逃亡）。`;
      } else if (kind === "wall") {
        if (city.gold < 180) return { game, message: "金不足 180。" };
        city.gold -= 180;
        const up = Math.round(rand(4, 7));
        city.wall = clamp(city.wall + up, 0, 100);
        message = `筑城：${city.name} 城防 +${up}（现 ${city.wall}，守军减伤 ×${(1 + city.wall / WALL_DIV).toFixed(2)}）。`;
      } else {
        return { game, message: "未知的内政。" };
      }

      city.doneDomestic = true;
      return { game: g, message };
    }

    /* ---------------------------------------------------------------- 战斗 */

    /**
     * 出征结算。纯函数 —— 返回新 state 与一份战报。
     *
     * 模型（《三国志II 霸王的大陆》一脉）：
     *   1. 智力 → 计略命中与火计伤害；武力 → 每回合杀伤；统率 → 带兵上限；城防 → 守方减伤。
     *   2. 计略只放一次，然后进入最多 8 回合的鏖战，双方同时结算伤害。
     *   3. 任一方兵力跌破出阵时的三成即溃败。
     */
    function doBattle(game, opts) {
      const g = clone(game);
      const from = cityById(g, opts.fromId);
      const target = cityById(g, opts.targetId);
      const attacker = generalOf(g, opts.generalKey);
      const defender = bestDefender(g, opts.targetId);
      const lines = [];

      if (!from || !target || !attacker) {
        return { game, report: { lines: ["出征条件不足。"], win: false }, message: "出征条件不足。" };
      }

      /* 目标合法性。UI 只列相邻敌城，但 doBattle 是导出的纯函数，
         任何调用方（脚本、未来入口）都能传任意城池 —— 不在这里挡住，
         就会出现「徐州直取成都」「徐州打徐州」这种越过地图的出征。 */
      if (target.id === from.id) {
        return { game, report: { lines: ["不能攻打自己所在的城池。"], win: false }, message: "目标不合法。" };
      }
      if (target.owner === from.owner) {
        return {
          game,
          report: { lines: [`${target.name} 本属 ${ALL_FACTIONS[target.owner] ? ALL_FACTIONS[target.owner].name : target.owner}，是自己人的城。`], win: false },
          message: "目标不合法。",
        };
      }
      if (!from.adj.includes(target.id)) {
        return {
          game,
          report: { lines: [`${from.name} 与 ${target.name} 并不相邻，无法出兵。`], win: false },
          message: "目标不合法。",
        };
      }
      if (attacker.cityId !== from.id) {
        return {
          game,
          report: { lines: [`${attacker.name} 此刻并不在 ${from.name}，不能由此出征。`], win: false },
          message: "武将不在该城。",
        };
      }

      /* 出兵数取「申请数 / 城中实有 / 主将统率上限」三者最小。
         早期写法是 Math.max(500, Math.min(...))：城中兵为 0 时 min 得 0，
         再被 max 抬成 500，于是扣兵把城池扣成负数，还能靠幽灵兵无尽出征。 */
      const canSend = Math.min(from.troops, maxLead(attacker));
      if (canSend < 500) {
        return {
          game,
          report: { lines: [`${from.name} 兵力不足 500，无法出征。`], win: false },
          message: "兵力不足。",
        };
      }
      const atkTroops = Math.max(500, Math.min(opts.troops, canSend));
      from.troops -= atkTroops;
      from.doneMarch = true;

      const defTroops = target.troops;
      const defWar = defender ? defender.war : 50;
      const defInt = defender ? defender.int : 50;
      const defName = defender ? defender.name : "守将";
      const defTroops0 = Math.max(defTroops, 1);

      lines.push(
        `${attacker.name} 引兵 ${fmt(atkTroops)} 自 ${from.name} 出兵，直取 ${target.name}。`,
      );
      lines.push(
        `守将 ${defName}（武 ${defWar} / 智 ${defInt}）闭城坚守，守军 ${fmt(defTroops)}，城防 ${target.wall}。`,
      );

      let atk = atkTroops;
      let def = defTroops;
      let defMorale = target.morale;
      let wallFactor = 1 + target.wall / WALL_DIV;
      let ambushRounds = 0;

      /* ---- 计略 ---- */
      if (opts.tactic && opts.tactic !== "none") {
        const t = TACTICS[opts.tactic];
        if (t && attacker.int >= t.need) {
          const gap = attacker.int - defInt;
          const isZhuge = attacker.key === "zhugeliang" || attacker.int >= 100;

          if (opts.tactic === "fire") {
            const chance = isZhuge ? 1 : clamp(0.42 + gap * 0.009, 0.1, 0.95);
            if (roll(chance)) {
              let ratio = 0.14 + Math.max(0, gap) * 0.0025;
              if (isZhuge) ratio *= 2;
              const burn = Math.max(300, Math.round(def * ratio));
              def = Math.max(0, def - burn);
              lines.push(
                isZhuge
                  ? `火计必中！${attacker.name} 祭起东风，${target.name} 城中烈焰冲天，守军折损 ${fmt(burn)}。`
                  : `火计得手！${target.name} 火起，守军折损 ${fmt(burn)}。`,
              );
            } else {
              lines.push(`火计失算，${defName} 早有防备，火头未起便被扑灭。`);
            }
          } else if (opts.tactic === "ambush") {
            const chance = clamp(0.38 + gap * 0.006, 0.08, 0.9);
            if (roll(chance)) {
              ambushRounds = 3;
              lines.push(`伏兵四起！${target.name} 城外伏兵杀出，守军阵脚大乱。`);
            } else {
              lines.push(`伏兵被识破，${defName} 按兵不动，伏兵无功而返。`);
            }
          } else if (opts.tactic === "discord") {
            const chance = clamp(0.34 + gap * 0.006, 0.08, 0.9);
            if (roll(chance)) {
              defMorale = clamp(defMorale - 25, 0, 100);
              wallFactor = 1 + target.wall / WALL_DIV_DISCORD;
              lines.push(`离间计成！${target.name} 军心浮动，士气大跌，城门内应四起。`);
            } else {
              lines.push(`离间计未成，${defName} 斩了说客，守军愈发同仇敌忾。`);
            }
          }
        } else {
          lines.push(`${attacker.name} 智力不足以施展${t ? t.name : "计略"}。`);
        }
      }

      /* ---- 鏖战 ---- */
      const atkMoraleF = () => 0.85 + from.morale / 300;
      const defMoraleF = () => 0.85 + defMorale / 300;
      const atkRout = atkTroops * ROUT_RATIO;
      const defRout = defTroops0 * ROUT_RATIO;

      let round = 0;
      while (round < MAX_BATTLE_ROUNDS && atk > atkRout && def > defRout) {
        round += 1;
        const jitter = () => rand(1 - DMG_JITTER, 1 + DMG_JITTER);
        const atkDmg =
          atk * (DMG_BASE + attacker.war / DMG_WAR_DIV) * atkMoraleF() * jitter();
        let defDmg =
          def * (DMG_BASE + defWar / DMG_WAR_DIV) * defMoraleF() * wallFactor * jitter();
        if (ambushRounds > 0) {
          defDmg *= 0.5;
          ambushRounds -= 1;
        }
        def = Math.max(0, def - atkDmg);
        atk = Math.max(0, atk - defDmg);

        lines.push(
          `第 ${round} 回合：${attacker.name} 部斩敌 ${fmt(atkDmg)}，自损 ${fmt(defDmg)}。` +
            `（我军 ${fmt(atk)} / 守军 ${fmt(def) }）`,
        );
      }

      const win = def <= defRout || def <= 0;
      let capturedGeneral = null;

      if (win) {
        lines.push(`${target.name} 守军溃散！${attacker.name} 破城而入。`);
        const survivors = Math.max(0, Math.round(atk));
        const oldOwner = target.owner;

        target.owner = from.owner;
        target.troops = survivors;
        target.morale = clamp(target.morale - 10, 20, 100);
        target.doneDomestic = true;
        target.doneMarch = true;
        attacker.cityId = target.id;

        /* 守将：降 or 逃 */
        const losers = g.generals.filter((x) => x.cityId === target.id && x.key !== attacker.key);
        losers.forEach((gen) => {
          if (roll(0.45)) {
            gen.cityId = target.id;
            gen.captured = false;
            lines.push(`${gen.name} 力竭被擒，愿降。`);
            if (!capturedGeneral) capturedGeneral = gen.name;
          } else {
            gen.cityId = null;
            gen.captured = true;
            lines.push(`${gen.name} 单骑突围，不知所终。`);
          }
        });

        lines.push(
          `${ALL_FACTIONS[from.owner].name} 取 ${target.name}（原属 ${ALL_FACTIONS[oldOwner].name}），余兵 ${fmt(survivors)}。`,
        );
      } else {
        lines.push(`久攻不下，${attacker.name} 鸣金收兵。`);
        if (atk <= 0) {
          attacker.troops = 0;
          lines.push(`${attacker.name} 全军覆没，仅以身免。`);
        }
        from.troops += Math.max(0, Math.round(atk));
        target.troops = Math.max(0, Math.round(def));
        target.morale = clamp(target.morale + 2, 0, 100);
        lines.push(`守军尚存 ${fmt(target.troops)}，${target.name} 仍归 ${ALL_FACTIONS[target.owner].name}。`);
      }

      /* 战败突围、标记 captured 的将领从此消失。
         注意必须用 captured 判定，不能按 cityId == null 过滤 ——
         在野武将（尚未被招募）的 cityId 本来就是 null，那样会把
         整个在野人才池一并删掉，招募功能随即失效。 */
      g.generals = g.generals.filter((x) => x.cityId != null || !x.captured);

      g.outcome = checkOutcome(g);
      return {
        game: g,
        report: {
          lines,
          win,
          attacker: attacker.name,
          targetId: target.id,
          targetName: target.name,
          captured: capturedGeneral,
        },
      };
    }

    function checkOutcome(game) {
      const p = ownerCities(game, game.playerFaction).length;
      if (p === game.cities.length) return "win";
      if (p === 0) return "lose";
      return null;
    }

    /* ------------------------------------------------------------------ AI */

    /**
     * AI 一个回合。按势力循环，每个势力做四件事：内政 → 调将 → 招募 → 出兵。
     *
     * 与旧版的差别（旧版就是玩家说的「电脑太弱智」）：
     *   1. 调将：己方有城无将时，从将多的城挪一员过去。旧版占城后不留将，
     *      该城永久丧失出兵能力，AI 越打越软。
     *   2. 招募：AI 也会寻访在野武将，否则人才池只被玩家单方面收割。
     *   3. 内政不再无脑先征兵：粮不够时先开垦，士气低时先训练。
     *   4. 出兵从「34% 概率打一路」改成「按利润排序，最多打两路」，
     *      并且优先打「有将、兵够」的源城。
     */
    function aiTurn(game) {
      let g = clone(game);
      const log = [];

      (g.factions || ["cao", "liu", "sun"])
        .filter((f) => f !== g.playerFaction)
        .forEach((faction) => {
          const fname = ALL_FACTIONS[faction] ? ALL_FACTIONS[faction].name : faction;

          /* ---- 1. 内政：先保粮，再补兵到「领兵上限」，士气低了训练 ---- */
          ownerCities(g, faction).forEach((city) => {
            if (city.doneDomestic) return;

            const gens = generalsIn(g, city.id);
            const best = gens.length
              ? gens.slice().sort((a, b) => b.lead - a.lead)[0]
              : null;
            /* 有将就按统率上限养兵，没将就养到能自守的量。
               旧值 AI_DRAFT_THRESHOLD 固定 16000 会让高统率城永远只养半支军。 */
            const want = best ? maxLead(best) : 12000;
            const cap = want * 0.9;
            const draftCost = 200 + Math.floor(city.troops / DRAFT_COST_STEP);
            const foodCost = Math.round(1800 * FOOD_PER_CONSCRIPT);
            const needFood = city.troops / UPKEEP_DIV + 600;

            let kind = null;
            if (city.food < needFood && city.gold >= 150) kind = "farm";
            else if (city.morale < DESERT_MORALE && city.gold >= 100) kind = "drill";
            else if (
              city.gold >= draftCost + 150 &&
              city.troops < cap &&
              city.food > foodCost * 2
            )
              kind = "draft";
            else if (city.gold >= 150 && city.comm < 70) kind = "trade";
            else if (city.gold >= 150 && city.agri < 70) kind = "farm";
            else if (city.gold >= 100 && city.morale < 80) kind = "drill";
            else if (city.wall < 80 && city.gold >= 150) kind = "wall";
            if (!kind) return;
            const r = doDomestic(g, city.id, kind);
            if (r.game !== g) {
              g = r.game;
              log.push(`[${fname}] ${r.message}`);
            }
          });

          /* ---- 2. 调将：把将多的城匀一员给无将或前线的城 ---- */
          const mine = ownerCities(g, faction);
          const empty = mine.filter((c) => generalsIn(g, c.id).length === 0);
          empty.forEach((target) => {
            const donors = mine
              .filter((c) => c.id !== target.id && generalsIn(g, c.id).length >= 2)
              .sort((a, b) => generalsIn(g, b.id).length - generalsIn(g, a.id).length);
            if (!donors.length) return;
            const donor = donors[0];
            /* 挑统率最低的那员送走，保留主力 */
            const pool = generalsIn(g, donor.id)
              .slice()
              .sort((a, b) => a.lead + a.war * 0.3 - (b.lead + b.war * 0.3));
            const who = pool[0];
            if (!who || who.doneMove) return;
            who.cityId = target.id;
            who.faction = target.owner;
            who.doneMove = true;
            log.push(`[${fname}] ${who.name} 自 ${donor.name} 移驻 ${target.name}。`);
          });

          /* ---- 3. 招募：每城每月一次，跟玩家同规则 ---- */
          ownerCities(g, faction).forEach((city) => {
            if (city.doneRecruit) return;
            if (city.gold < 150) return;
            const r = doRecruit(g, city.id);
            if (r.game !== g) {
              g = r.game;
              log.push(`[${fname}] ${r.message}`);
            }
          });

          /* ---- 4. 出兵：按利润排序，最多 AI_MAX_ATTACKS 路 ---- */
          if (!roll(AI_AGGRESSION)) return;

          const attacks = [];
          ownerCities(g, faction).forEach((src) => {
            if (src.doneMarch) return;
            const list = generalsIn(g, src.id);
            if (!list.length) return;
            /* 领兵将取「统率×武力×智力」综合最强的一员 */
            const lead = list
              .slice()
              .sort((a, b) => b.lead + b.war * 0.5 + b.int * 0.2 - (a.lead + a.war * 0.5 + a.int * 0.2))[0];
            const send = Math.min(src.troops, maxLead(lead));
            if (send < AI_MIN_SEND) return;

            src.adj
              .map((id) => cityById(g, id))
              .filter((c) => c && c.owner !== faction)
              .forEach((tgt) => {
                /* 用同一套伤害公式预演，不再用「兵力倍率」这种重复计城防的近似 */
                const sim = estimateAttack(src, tgt, lead, send, bestDefender(g, tgt.id));
                if (!sim.win) return;
                if (sim.survivors < AI_MIN_SURVIVORS) return;
                /* 利润 = 打赢的余量 × 目标价值。有将的城更值钱，玩家城优先 */
                const value =
                  (1 + tgt.agri / 200 + tgt.comm / 200) *
                  (generalsIn(g, tgt.id).length ? 1.25 : 1) *
                  (tgt.owner === g.playerFaction ? 1.15 : 1);
                attacks.push({
                  src,
                  tgt,
                  lead,
                  send,
                  score: sim.survivors * value,
                });
              });
          });

          if (!attacks.length) return;
          attacks.sort((a, b) => b.score - a.score);

          /* 同一座出发城只打一次（打完 doneMarch 就是 true，下面要重取） */
          let launched = 0;
          const usedSrc = {};
          for (const pick of attacks) {
            if (launched >= AI_MAX_ATTACKS) break;
            if (usedSrc[pick.src.id]) continue;
            const live = cityById(g, pick.src.id);
            const liveTarget = cityById(g, pick.tgt.id);
            if (!live || !liveTarget || live.doneMarch) continue;
            if (liveTarget.owner === faction) continue;
            const gen = generalOf(g, pick.lead.key);
            if (!gen || gen.cityId !== live.id) continue;
            const send = Math.min(live.troops, maxLead(gen));
            if (send < AI_MIN_SEND) continue;

            let tactic = "none";
            if (gen.int >= 80 && roll(0.7)) tactic = "fire";
            else if (gen.int >= 70 && roll(0.5)) tactic = "discord";
            else if (gen.int >= 60 && roll(0.4)) tactic = "ambush";

            const res = doBattle(g, {
              fromId: live.id,
              targetId: liveTarget.id,
              generalKey: gen.key,
              troops: send,
              tactic,
            });
            g = res.game;
            usedSrc[live.id] = true;
            launched += 1;
            log.push(`[${fname}]`);
            res.report.lines.forEach((l) => log.push("  " + l));
          }
        });

      return { game: g, log };
    }

    /* -------------------------------------------------------------- 回合推进 */

    function endTurn(game) {
      let g = clone(game);

      /* AI 行动 */
      const ai = aiTurn(g);
      g = ai.game;
      const aiLog = ai.log;

      /* 换月 */
      g.month += 1;
      if (g.month > 11) {
        g.month = 0;
        g.year += 1;
      }
      g.turn += 1;

      /* 收入与消耗。
         旧版月耗 troops/100，产粮 agri*14+200，永远大幅盈余 —— 粮食与农业
         因此毫无存在感。现在月耗 troops/UPKEEP_DIV（40）且低士气会逃亡，
         三个内政按钮才各自对应一条真实的生存压力。 */
      g.cities.forEach((city) => {
        if (!(g.factions || []).includes(city.owner)) return;
        city.gold += Math.round(city.comm * 7 + 120);
        const harvest = Math.round(city.agri * 14 + 200);
        const upkeep = Math.round(city.troops / UPKEEP_DIV);
        city.food += harvest - upkeep;

        if (city.food < 0) {
          const desert = Math.min(city.troops, Math.round(-city.food * 0.5));
          city.troops -= desert;
          city.morale = clamp(city.morale - 8, 0, 100);
          city.food = 0;
          if (desert > 0) aiLog.push(`${city.name} 军粮断绝，逃亡 ${fmt(desert)} 兵。`);
        } else if (city.morale < DESERT_MORALE && city.troops > 0) {
          /* 低士气逃亡：训练按钮的存在理由 */
          const rate = (DESERT_MORALE - city.morale) / DESERT_DIV;
          const gone = Math.min(city.troops, Math.round(city.troops * rate));
          if (gone > 0) {
            city.troops -= gone;
            aiLog.push(`${city.name} 士气低落（${city.morale}），逃亡 ${fmt(gone)} 兵。`);
          }
        }

        city.doneDomestic = false;
        city.doneMarch = false;
        city.doneRecruit = false;
      });

      /* 调将是逐将限次，不是逐城 */
      g.generals.forEach((gen) => {
        gen.doneMove = false;
      });

      g.outcome = checkOutcome(g);
      return { game: g, log: aiLog };
    }

    /* ---------------------------------------------------------------- 存档 */

    function saveGame(game) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
      } catch {
        /* 配额满或被禁用：游戏继续，只是不持久化 */
      }
    }

    function loadGame() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        /* v1 存档没有 playerFaction 字段，v2 没有 eraId —— 都作废重开。
           宁可丢一次存档，也不能让「选曹操却按刘备结算」「年代错位」复活。 */
        if (!parsed || parsed.version !== 3 || !Array.isArray(parsed.cities)) return null;
        if (parsed.cities.length !== CITY_DEFS.length) return null;
        if (!ALL_FACTIONS[parsed.playerFaction]) return null;
        if (!parsed.eraId || !ERA_DEFS.some((e) => e.id === parsed.eraId)) return null;
        if (!Array.isArray(parsed.factions) || !parsed.factions.length) return null;
        return parsed;
      } catch {
        return null;
      }
    }

    function clearSave() {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* localStorage 不可用时静默：重开只影响持久化，不影响本局 */
      }
    }

    /* ---------------------------------------------------------------- 样式 */

    const CSS = `
.tk3k-root{position:fixed;inset:0;pointer-events:none;z-index:2147483000;
  --tk3k-accent:#c8a24a;--tk3k-accent-strong:#b8860b;--tk3k-accent-soft:#e3c072;--tk3k-danger:#e0887e;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
/* 浅色主题：金色 #c8a24a 压在白底上对比度不足，换成深一档的赭金。 */
body:not([data-ds-dark-theme]) .tk3k-root{--tk3k-accent:#8a6512;--tk3k-accent-strong:#7a5a10;--tk3k-accent-soft:#6f5410;--tk3k-danger:#b4362a}
.tk3k-fab{position:absolute;right:18px;bottom:96px;pointer-events:auto;display:flex;align-items:center;gap:6px;padding:9px 14px 9px 11px;border-radius:999px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));background:var(--dsw-alias-bg-layer-1,#1f1f22);color:var(--dsw-alias-label-primary,#e8e8ea);box-shadow:0 6px 20px rgba(0,0,0,.28);font-size:13px;font-weight:600;letter-spacing:.02em;transition:transform .14s ease,box-shadow .14s ease}
.tk3k-fab:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(0,0,0,.34)}
.tk3k-fab:active{transform:translateY(0)}
.tk3k-fab i{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:var(--tk3k-accent-strong);color:#fff;font-style:normal;font-size:12px;font-weight:700}
.tk3k-panel{position:absolute;right:16px;bottom:76px;pointer-events:auto;display:flex;flex-direction:column;
  width:min(460px,calc(100vw - 32px));height:min(720px,calc(100vh - 32px));
  border-radius:14px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,#1b1b1f);
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));
  box-shadow:0 18px 52px rgba(0,0,0,.42);
  color:var(--dsw-alias-label-primary,#eceef1);font-size:13px;line-height:1.5}
.tk3k-head{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03))}
.tk3k-head-t{font-weight:700;letter-spacing:.14em;font-size:13px;color:var(--tk3k-accent)}
.tk3k-head-d{color:var(--dsw-alias-label-secondary,#a2a6ad);font-size:11.5px}
.tk3k-head-sp{flex:1}
.tk3k-x{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#a2a6ad);cursor:pointer;font-size:15px;line-height:1;padding:3px 6px;border-radius:6px}
.tk3k-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));color:var(--dsw-alias-label-primary,#eceef1)}
.tk3k-map{position:relative;height:196px;flex:0 0 auto;margin:10px 12px 6px;border-radius:10px;overflow:hidden;
  background:radial-gradient(120% 100% at 30% 0%,rgba(184,134,11,.13),transparent 60%),var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03));
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22))}
.tk3k-map svg{position:absolute;inset:0;width:100%;height:100%}
.tk3k-node{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;background:transparent;border:0;padding:0;color:inherit;font:inherit}
.tk3k-node-c{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:700;color:#fff;border:2px solid rgba(255,255,255,.55);box-shadow:0 2px 10px rgba(0,0,0,.35);transition:transform .12s ease}
.tk3k-node:hover .tk3k-node-c{transform:scale(1.08)}
.tk3k-node.sel .tk3k-node-c{outline:2px solid var(--tk3k-accent);outline-offset:2px;transform:scale(1.1)}
/* 调将待选：可落点的己方城呼吸高亮，出发城虚线框 */
.tk3k-node.drop .tk3k-node-c{outline:2px dashed var(--tk3k-accent);outline-offset:3px;animation:tk3k-pulse 1.4s ease-in-out infinite}
.tk3k-node.from .tk3k-node-c{outline:2px dotted rgba(255,255,255,.75);outline-offset:3px}
@keyframes tk3k-pulse{0%,100%{outline-offset:3px}50%{outline-offset:6px}}
.tk3k-node-n{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-primary,#eceef1);text-shadow:0 1px 2px rgba(0,0,0,.45);white-space:nowrap}
.tk3k-node-b{font-size:9.5px;color:var(--dsw-alias-label-secondary,#b6bac1);text-shadow:0 1px 2px rgba(0,0,0,.45);font-variant-numeric:tabular-nums}
/* min-height:0 是必需的：flex column 里子项的默认 min-height:auto 会让它
   拒绝收缩到内容高度以下，于是长内容把 footer 顶出面板、再被 panel 的
   overflow:hidden 裁掉 —— 这就是「显示不全」。 */
.tk3k-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 12px 8px}
.tk3k-body::-webkit-scrollbar{width:8px}
.tk3k-body::-webkit-scrollbar-thumb{background:rgba(128,128,128,.3);border-radius:4px}
.tk3k-empty{color:var(--dsw-alias-label-tertiary,#8b8f98);font-size:12px;padding:14px 4px;text-align:center}
.tk3k-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:10px;padding:10px 11px;margin-bottom:8px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.02))}
.tk3k-card-h{display:flex;align-items:baseline;gap:8px;margin-bottom:7px}
.tk3k-card-n{font-size:15px;font-weight:700;letter-spacing:.05em}
.tk3k-tag{font-size:10.5px;padding:1px 6px;border-radius:5px;color:#fff;font-weight:600}
.tk3k-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 8px;font-size:11.5px;margin-bottom:8px}
.tk3k-kv{display:flex;flex-direction:column;gap:1px}
.tk3k-kv b{font-size:13px;font-variant-numeric:tabular-nums;font-weight:600}
.tk3k-kv span{color:var(--dsw-alias-label-tertiary,#8b8f98);font-size:10.5px}
.tk3k-acts{display:flex;flex-wrap:wrap;gap:6px}
.tk3k-btn{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.05));color:var(--dsw-alias-label-primary,#eceef1);padding:5px 10px;border-radius:7px;font-size:11.5px;cursor:pointer;font-family:inherit;transition:background .12s ease}
.tk3k-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.2))}
.tk3k-btn:disabled{opacity:.42;cursor:not-allowed}
.tk3k-btn.primary{background:var(--tk3k-accent-strong);border-color:var(--tk3k-accent-strong);color:#fff;font-weight:600}
.tk3k-btn.primary:hover:not(:disabled){background:#a57709}
.tk3k-btn.danger{background:rgba(197,72,60,.16);border-color:rgba(197,72,60,.5);color:var(--tk3k-danger)}
.tk3k-gen{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:11.5px;border-top:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.18))}
.tk3k-gen:first-child{border-top:0}
.tk3k-gen-n{font-weight:600;min-width:52px}
.tk3k-gen-s{color:var(--dsw-alias-label-tertiary,#8b8f98);font-variant-numeric:tabular-nums}
.tk3k-foot{display:flex;align-items:center;gap:6px;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03))}
.tk3k-foot-sp{flex:1}
.tk3k-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8f98);padding:7px 2px;line-height:1.55}
.tk3k-log{font-size:11.5px;line-height:1.72;max-height:none}
.tk3k-log p{margin:0 0 3px;color:var(--dsw-alias-label-secondary,#b6bac1)}
.tk3k-log p.hl{color:var(--tk3k-accent);font-weight:600}
.tk3k-log p.bad{color:var(--tk3k-danger)}
.tk3k-sel{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.tk3k-opt{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;padding:6px 9px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.04));cursor:pointer;font-size:11.5px;color:inherit;font-family:inherit}
.tk3k-opt.on{border-color:var(--tk3k-accent-strong);background:rgba(184,134,11,.16);color:var(--tk3k-accent-soft);font-weight:600}
.tk3k-opt:disabled{opacity:.4;cursor:not-allowed}
.tk3k-range{width:100%;accent-color:var(--tk3k-accent-strong);margin:6px 0 2px}
.tk3k-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;margin-bottom:6px}
.tk3k-row span{color:var(--dsw-alias-label-tertiary,#8b8f98)}
.tk3k-msg{font-size:11.5px;color:var(--tk3k-accent);padding:5px 2px;min-height:16px}
/* ---- 选择势力 ---- */
.tk3k-pick{display:flex;flex-direction:column;gap:10px;padding:16px 12px 20px}
.tk3k-pick-title{margin:0;font-size:16px;letter-spacing:.2em;text-align:center;color:var(--tk3k-accent)}
.tk3k-pick-sub{margin:0 0 6px;font-size:11.5px;line-height:1.75;text-align:center;color:var(--dsw-alias-label-secondary,#a2a6ad)}
/* 分节标题：一条金色短横 + 字 */
.tk3k-pick-sec{display:flex;align-items:center;gap:8px;margin-top:2px;font-size:11px;letter-spacing:.16em;
  color:var(--tk3k-accent-soft);font-weight:600}
.tk3k-pick-sec:before{content:"";flex:none;width:14px;height:1px;background:var(--tk3k-accent);opacity:.7}
/* 年代选择：两列网格 */
.tk3k-era-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.tk3k-era{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:8px 10px;border-radius:8px;cursor:pointer;
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));
  color:var(--dsw-alias-label-secondary,#a2a6ad);text-align:left;transition:border-color .14s ease,background .14s ease,transform .14s ease}
.tk3k-era:hover{transform:translateY(-1px);border-color:var(--tk3k-accent-soft)}
.tk3k-era.on{border-color:var(--tk3k-accent);background:rgba(200,162,74,.1);color:var(--dsw-alias-label-primary,#eceef1)}
.tk3k-era-y{font-size:10px;letter-spacing:.1em;color:var(--tk3k-accent);font-weight:700;line-height:1.2}
.tk3k-era-n{font-size:12px;font-weight:600;letter-spacing:.06em;line-height:1.35}
.tk3k-era-desc{margin:0;font-size:10.5px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.tk3k-era-hint{margin:-4px 0 2px;font-size:10.5px;line-height:1.6;color:var(--tk3k-accent-soft);opacity:.85}
.tk3k-pick-list{display:flex;flex-direction:column;gap:9px}
.tk3k-pick-card{display:flex;flex-direction:column;gap:5px;padding:11px 12px;border-radius:9px;cursor:pointer;text-align:left;
  border:1px solid color-mix(in srgb,var(--faction-color) 45%,var(--dsw-alias-border-l2,#4a4d55));
  background:linear-gradient(100deg,color-mix(in srgb,var(--faction-color) 16%,transparent),transparent 68%);
  color:var(--dsw-alias-label-primary,#e8e9ec);font:inherit;transition:transform .12s,border-color .12s}
.tk3k-pick-card:hover{transform:translateY(-1px);border-color:var(--faction-color)}
.tk3k-pick-head{display:flex;align-items:center;gap:8px}
.tk3k-pick-flag{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;
  font-size:14px;font-weight:700;color:#fff;background:var(--faction-color);flex:none}
.tk3k-pick-name{font-size:14px;font-weight:700;letter-spacing:.08em}
.tk3k-pick-lv{margin-left:auto;flex:none;font-size:10.5px;line-height:1;padding:3px 7px;
  border-radius:999px;border:1px solid currentColor;color:var(--faction-color);opacity:.85}
.tk3k-pick-desc{font-size:11px;line-height:1.65;color:var(--dsw-alias-label-secondary,#a2a6ad)}
.tk3k-pick-stats{display:flex;gap:12px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.tk3k-pick-lead{font-size:10.5px;color:var(--tk3k-accent-soft)}
.tk3k-pick-tip{margin:4px 0 0;font-size:10.5px;line-height:1.7;text-align:center;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.tk3k-banner{display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 10px;text-align:center}
.tk3k-banner h3{margin:0;font-size:19px;letter-spacing:.12em;color:var(--tk3k-accent)}
.tk3k-banner p{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary,#a2a6ad);line-height:1.7}
`;

    /* ------------------------------------------------------------ 展示组件 */

    function Tag({ faction }) {
      const f = ALL_FACTIONS[faction] || { name: faction, color: "#888" };
      return h(
        "span",
        { className: "tk3k-tag", style: { background: f.color } },
        f.name,
      );
    }

    function KV({ label, value }) {
      return h("div", { className: "tk3k-kv" }, h("b", null, value), h("span", null, label));
    }

    /* ------------------------------------------------------------------ 主体 */

    function ThreeKingdomsGame({ onExit }) {
      /* 由外壳决定挂载时机：一进来就是展开态，open 恒真让旧 FAB 分支变成死代码 */
      const [open, setOpen] = useState(true);
      /* game 为 null = 还没选势力。开局必须先过「选择势力」这一屏，
         旧版本直接从 loadGame() 起步，新玩家永远看不到选势力入口。 */
      const [game, setGame] = useState(() => loadGame());
      const [screen, setScreen] = useState("map"); /* map | city | march | report */
      const [cityId, setCityId] = useState("xuzhou");
      const [targetId, setTargetId] = useState(null);
      const [generalKey, setGeneralKey] = useState(null);
      const [troops, setTroops] = useState(0);
      const [tactic, setTactic] = useState("none");
      const [message, setMessage] = useState("");
      const [report, setReport] = useState(null);
      const [log, setLog] = useState([]); /* AI 结算战报 */
      const [confirmReset, setConfirmReset] = useState(false);
      /* 调将：点「调」后记录武将 key，再点目标城完成调动 */
      const [moveKey, setMoveKey] = useState(null);
      /* 选择年代：默认「卧龙出山」（207 年），这是最接近大众印象的三国开局 */
      const [pickEra, setPickEra] = useState("207");
      const bodyRef = useRef(null);

      /* 自动存档：每次状态变化落一次（未选势力时不写，否则会存成 null） */
      useEffect(() => {
        if (game) saveGame(game);
      }, [game]);

      /* game 为 null（尚未选势力）时下面这些派生值不能炸。hook 必须无条件
         调用，所以不能用 early return，只能把空值一路往下传，最后在 body()
         里统一分流到「选择势力」屏。 */
      const selected = game ? cityById(game, cityId) || game.cities[0] : null;
      const myFaction = game ? game.playerFaction : "liu";
      const isPlayerCity = selected && selected.owner === myFaction;
      const myGenerals = selected ? generalsIn(game, selected.id) : [];

      const playerGold = game ? ownerCities(game, myFaction).reduce((s, c) => s + c.gold, 0) : 0;
      const playerFood = game ? ownerCities(game, myFaction).reduce((s, c) => s + c.food, 0) : 0;
      const playerTroops = game ? ownerCities(game, myFaction).reduce((s, c) => s + c.troops, 0) : 0;

      /* ---------------- 动作 ---------------- */

      const act = useCallback(
        (kind) => {
          if (!game || !selected) return;
          const res = doDomestic(game, selected.id, kind);
          if (res.game === game) {
            setMessage(res.message);
            return;
          }
          setGame(res.game);
          setMessage(res.message);
        },
        [game, selected],
      );

      const openMarch = useCallback(() => {
        if (!game || !selected) return;
        const targets = selected.adj
          .map((id) => cityById(game, id))
          .filter((c) => c && c.owner !== myFaction);
        if (!targets.length) {
          setMessage("此城周围已无敌方城池。");
          return;
        }
        if (selected.troops < 1000) {
          setMessage("城中兵力不足 1000，无法出征。");
          return;
        }
        if (!myGenerals.length) {
          setMessage("城中无将，无法出征。");
          return;
        }
        const t = targets.slice().sort((a, b) => a.troops - b.troops)[0];
        const g = myGenerals.slice().sort((a, b) => b.lead - a.lead)[0];
        setTargetId(t.id);
        setGeneralKey(g.key);
        setTroops(Math.min(selected.troops, maxLead(g)));
        setTactic("none");
        setScreen("march");
        setMessage("");
      }, [game, selected, myGenerals]);

      const launch = useCallback(() => {
        if (!game || !selected) return;
        const res = doBattle(game, {
          fromId: selected.id,
          targetId,
          generalKey,
          troops,
          tactic,
        });
        setGame(res.game);
        setReport(res.report);
        setLog([]);
        setScreen("report");
        setMessage("");
      }, [game, selected, targetId, generalKey, troops, tactic]);

      const nextTurn = useCallback(() => {
        if (!game) return;
        const res = endTurn(game);
        setGame(res.game);
        setLog(res.log || []);
        setScreen("map");
        setMessage("");
        if (res.game.outcome) {
          /* 结局交给顶部横幅渲染 */
        }
      }, [game]);

      /* 重开 = 回到选势力屏，而不是直接开新局 —— 否则想换势力还得清缓存 */
      const resetGame = useCallback(() => {
        clearSave();
        setGame(null);
        setScreen("map");
        setReport(null);
        setLog([]);
        setMessage("");
        setConfirmReset(false);
      }, []);

      /* 选定势力后建局 */
      const startFaction = useCallback((fid, eraId) => {
        const g = createGame(fid, eraId || pickEra);
        setGame(g);
        setCityId(ownerCities(g, fid)[0] ? ownerCities(g, fid)[0].id : g.cities[0].id);
        setScreen("map");
        setReport(null);
        setLog([]);
        setMessage("");
      }, [pickEra]);

      /* 招募：每城每月一次 */
      const recruit = useCallback(() => {
        if (!game || !selected) return;
        const res = doRecruit(game, selected.id);
        if (res.game !== game) setGame(res.game);
        setMessage(res.message);
      }, [game, selected]);

      /* 调将第一步：在城卡里点某员武将的「调」，进入待选目标状态 */
      const pickMove = useCallback((key) => {
        if (!game) return;
        if (moveKey === key) {
          setMoveKey(null);
          setMessage("");
          return;
        }
        const gen = generalOf(game, key);
        setMoveKey(key);
        setMessage(
          gen
            ? `待调：${gen.name}。到地图上点一座己方城池即可移驻（同城/敌方城无效）。`
            : "",
        );
      }, [game, moveKey]);

      /* 调将第二步：在地图上点目标城完成调动 */
      const dropMove = useCallback(
        (toId) => {
          if (!game || !moveKey) return;
          const fromId = selected ? selected.id : null;
          if (!fromId) return;
          const res = doMoveGeneral(game, fromId, toId, moveKey);
          if (res.game !== game) {
            setGame(res.game);
            setCityId(toId);
          }
          setMessage(res.message);
          setMoveKey(null);
        },
        [game, selected, moveKey],
      );

      /* ---------------- 渲染片段 ---------------- */

      const renderMap = () => {
        const edges = [];
        const seen = {};
        CITY_DEFS.forEach((c) => {
          (c.adj || []).forEach((t) => {
            const k = [c.id, t].sort().join("~");
            if (seen[k]) return;
            seen[k] = true;
            edges.push([c.id, t]);
          });
        });
        const byId = {};
        CITY_DEFS.forEach((c) => {
          byId[c.id] = c;
        });

        return h(
          "div",
          { className: "tk3k-map" },
          h(
            "svg",
            { viewBox: "0 0 100 100", preserveAspectRatio: "none" },
            edges.map(([a, b2], i) => {
              const A = byId[a];
              const B = byId[b2];
              const ca = cityById(game, a);
              const cb = cityById(game, b2);
              const same = ca && cb && ca.owner === cb.owner;
              return h("line", {
                key: "e" + i,
                x1: A.x,
                y1: A.y,
                x2: B.x,
                y2: B.y,
                stroke: same ? ALL_FACTIONS[ca.owner].color : "rgba(140,140,150,.32)",
                strokeOpacity: same ? 0.45 : 1,
                strokeWidth: 0.45,
                strokeDasharray: same ? "0" : "1.6 1.4",
                vectorEffect: "non-scaling-stroke",
              });
            }),
          ),
          game.cities.map((city) => {
            const f = ALL_FACTIONS[city.owner] || { color: "#888", flag: "?" };
            /* 调将待选状态：己方城高亮为可落点，敌方城灰掉 */
            const isDrop = !!moveKey && city.owner === myFaction && city.id !== cityId;
            const isFrom = !!moveKey && city.id === cityId;
            return h(
              "button",
              {
                key: city.id,
                type: "button",
                className:
                  "tk3k-node" +
                  (city.id === cityId ? " sel" : "") +
                  (isDrop ? " drop" : "") +
                  (isFrom ? " from" : ""),
                style: { left: city.x + "%", top: city.y + "%" },
                onClick: () => {
                  if (moveKey && isDrop) {
                    dropMove(city.id);
                    setScreen("map");
                    return;
                  }
                  if (moveKey) {
                    setMessage("调将只能落到己方另一座城。");
                    return;
                  }
                  setCityId(city.id);
                  setScreen("map");
                  setMessage("");
                },
                title: `${city.name} · ${f.flag}${isDrop ? " · 点此移驻" : ""}`,
              },
              h(
                "span",
                { className: "tk3k-node-c", style: { background: f.color } },
                f.flag,
              ),
              h("span", { className: "tk3k-node-n" }, city.name),
              h("span", { className: "tk3k-node-b" }, fmt(city.troops)),
            );
          }),
        );
      };

      const renderCityCard = () => {
        if (!selected) return null;
        const f = ALL_FACTIONS[selected.owner] || { name: selected.owner };
        return h(
          "div",
          { className: "tk3k-card" },
          h(
            "div",
            { className: "tk3k-card-h" },
            h("span", { className: "tk3k-card-n" }, selected.name),
            h(Tag, { faction: selected.owner }),
            h("span", { style: { flex: 1 } }),
            h(
              "span",
              { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary,#8b8f98)" } },
              `金 ${fmt(selected.gold)} · 粮 ${fmt(selected.food)}`,
            ),
          ),
          h(
            "div",
            { className: "tk3k-grid" },
            h(KV, { label: "兵力", value: fmt(selected.troops) }),
            h(KV, { label: "城防", value: selected.wall }),
            h(KV, { label: "士气", value: selected.morale }),
            h(KV, { label: "农业", value: selected.agri }),
            h(KV, { label: "商业", value: selected.comm }),
            h(KV, { label: "武将", value: myGenerals.length }),
          ),
          myGenerals.length
            ? h(
                "div",
                null,
                myGenerals.map((g) =>
                  h(
                    "div",
                    { className: "tk3k-gen", key: g.key },
                    h("span", { className: "tk3k-gen-n" }, g.name),
                    h("span", { className: "tk3k-gen-s" }, `武 ${g.war}`),
                    h("span", { className: "tk3k-gen-s" }, `智 ${g.int}`),
                    h("span", { className: "tk3k-gen-s" }, `统 ${g.lead}`),
                    h("span", { style: { flex: 1 } }),
                    h(
                      "span",
                      { style: { fontSize: 10.5, color: "var(--dsw-alias-label-tertiary,#8b8f98)" } },
                      `可带 ${fmt(maxLead(g))}`,
                    ),
                    isPlayerCity
                      ? h(
                          "button",
                          {
                            type: "button",
                            className:
                              "tk3k-btn" + (moveKey === g.key ? " primary" : ""),
                            style: { marginLeft: 6, padding: "1px 7px", fontSize: 11 },
                            disabled: g.doneMove,
                            title: g.doneMove
                              ? "本月已调动过"
                              : "调：点此后再点一座己方城池",
                            onClick: () => pickMove(g.key),
                          },
                          moveKey === g.key ? "取消" : "调",
                        )
                      : null,
                  ),
                ),
              )
            : h(
                "div",
                { className: "tk3k-hint" },
                "城中无将 —— 无将之城无法出征，只能被动挨打。可从别的城调将过来。",
              ),
          isPlayerCity
            ? h(
                "div",
                { className: "tk3k-acts", style: { marginTop: 8 } },
                h(
                  "button",
                  {
                    type: "button",
                    className: "tk3k-btn",
                    disabled: selected.doneDomestic,
                    onClick: () => act("farm"),
                  },
                  "开垦",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "tk3k-btn",
                    disabled: selected.doneDomestic,
                    onClick: () => act("trade"),
                  },
                  "商业",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "tk3k-btn",
                    disabled: selected.doneDomestic,
                    onClick: () => act("draft"),
                  },
                  "征兵",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "tk3k-btn",
                    disabled: selected.doneDomestic,
                    onClick: () => act("drill"),
                  },
                  "训练",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "tk3k-btn",
                    disabled: selected.doneDomestic,
                    onClick: () => act("wall"),
                  },
                  "筑城",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "tk3k-btn",
                    disabled: selected.doneRecruit,
                    onClick: recruit,
                    title: "招揽本城在野贤才，每城每月一次",
                  },
                  "招募",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "tk3k-btn primary",
                    disabled: selected.doneMarch,
                    onClick: openMarch,
                  },
                  "出征",
                ),
              )
            : h(
                "div",
                { className: "tk3k-hint" },
                `此城属 ${f.name}，需先出兵攻取。`,
              ),
        );
      };

      const renderMarch = () => {
        const tgt = cityById(game, targetId);
        const gen = generalOf(game, generalKey);
        if (!tgt || !gen || !selected) return h("div", { className: "tk3k-empty" }, "出征条件不足。");
        const targets = selected.adj
          .map((id) => cityById(game, id))
          .filter((c) => c && c.owner !== myFaction);
        const cap = Math.min(selected.troops, maxLead(gen));
        const t = TACTICS[tactic] || TACTICS.none;
        const canTactic = gen.int >= t.need;

        return h(
          "div",
          null,
          h(
            "div",
            { className: "tk3k-card" },
            h(
              "div",
              { className: "tk3k-card-h" },
              h("span", { className: "tk3k-card-n" }, `${selected.name} → ${tgt.name}`),
              h(Tag, { faction: tgt.owner }),
              h("span", { style: { flex: 1 } }),
              h(
                "span",
                { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary,#8b8f98)" } },
                `守军 ${fmt(tgt.troops)} · 城防 ${tgt.wall}`,
              ),
            ),
            h("div", { className: "tk3k-row" }, h("span", null, "目标城池"), h("span", null, "")),
            h(
              "div",
              { className: "tk3k-sel" },
              targets.map((c) =>
                h(
                  "button",
                  {
                    key: c.id,
                    type: "button",
                    className: "tk3k-opt" + (c.id === targetId ? " on" : ""),
                    onClick: () => setTargetId(c.id),
                  },
                  `${c.name} · ${fmt(c.troops)}`,
                ),
              ),
            ),
            h("div", { className: "tk3k-row" }, h("span", null, "出征武将（统率决定带兵上限）"), h("span", null, "")),
            h(
              "div",
              { className: "tk3k-sel" },
              myGenerals.map((g) =>
                h(
                  "button",
                  {
                    key: g.key,
                    type: "button",
                    className: "tk3k-opt" + (g.key === generalKey ? " on" : ""),
                    onClick: () => {
                      setGeneralKey(g.key);
                      setTroops(Math.min(selected.troops, maxLead(g)));
                    },
                  },
                  `${g.name} 武${g.war}/智${g.int}`,
                ),
              ),
            ),
            h(
              "div",
              { className: "tk3k-row" },
              h("span", null, "出阵兵力"),
              h("b", { style: { fontVariantNumeric: "tabular-nums" } }, `${fmt(troops)} / 上限 ${fmt(cap)}`),
            ),
            h("input", {
              type: "range",
              className: "tk3k-range",
              min: 1000,
              max: Math.max(1000, cap),
              step: 500,
              value: Math.min(troops, Math.max(1000, cap)),
              onChange: (e) => setTroops(Number(e.target.value)),
            }),
            h(
              "div",
              { className: "tk3k-row" },
              h(
                "span",
                null,
                selected.troops - troops < 2000
                  ? "⚠ 留兵不足 2000，城防空虚"
                  : `留兵 ${fmt(selected.troops - troops)} 守城`,
              ),
              h("span", null, ""),
            ),
          ),
          h(
            "div",
            { className: "tk3k-card" },
            h("div", { className: "tk3k-row" }, h("span", null, "计略（智谋定成败）"), h("span", null, "")),
            h(
              "div",
              { className: "tk3k-sel" },
              Object.keys(TACTICS).map((k) => {
                const tt = TACTICS[k];
                return h(
                  "button",
                  {
                    key: k,
                    type: "button",
                    className: "tk3k-opt" + (tactic === k ? " on" : ""),
                    disabled: gen.int < tt.need,
                    onClick: () => setTactic(k),
                    title: tt.desc,
                  },
                  tt.name + (tt.need ? `（智≥${tt.need}）` : ""),
                );
              }),
            ),
            h(
              "div",
              { className: "tk3k-hint" },
              canTactic
                ? t.desc
                : `${gen.name} 智力 ${gen.int}，不足以施展${t.name}。`,
            ),
          ),
          h(
            "div",
            { className: "tk3k-acts" },
            h("button", { type: "button", className: "tk3k-btn primary", onClick: launch }, "开战"),
            h(
              "button",
              {
                type: "button",
                className: "tk3k-btn",
                onClick: () => {
                  setScreen("map");
                  setMessage("");
                },
              },
              "取消",
            ),
          ),
        );
      };

      const renderReport = () => {
        if (!report) return h("div", { className: "tk3k-empty" }, "暂无战报。");
        return h(
          "div",
          null,
          h(
            "div",
            { className: "tk3k-card" },
            h(
              "div",
              { className: "tk3k-card-h" },
              h(
                "span",
                { className: "tk3k-card-n" },
                report.win ? `${report.targetName} 大捷` : `${report.targetName} 攻城受阻`,
              ),
              h(
                "span",
                { className: "tk3k-tag", style: { background: report.win ? "#3f9e6a" : "#8a5a2b" } },
                report.win ? "克城" : "退兵",
              ),
            ),
            h(
              "div",
              { className: "tk3k-log" },
              report.lines.map((line, i) =>
                h(
                  "p",
                  {
                    key: i,
                    className: /火计得手|火计必中|溃散|破城|被擒|离间计成|伏兵四起/.test(line)
                      ? "hl"
                      : /失算|识破|未成|覆没|收兵/.test(line)
                        ? "bad"
                        : "",
                  },
                  line,
                ),
              ),
            ),
          ),
          h(
            "div",
            { className: "tk3k-acts" },
            h(
              "button",
              {
                type: "button",
                className: "tk3k-btn primary",
                onClick: () => {
                  if (report.targetId) setCityId(report.targetId);
                  setScreen("map");
                  setReport(null);
                },
              },
              "确定",
            ),
          ),
        );
      };

      const renderMapBody = () => {
        const parts = [renderCityCard()];
        if (log && log.length) {
          parts.push(
            h(
              "div",
              { className: "tk3k-card", key: "ailog" },
              h("div", { className: "tk3k-card-h" }, h("span", { className: "tk3k-card-n", style: { fontSize: 13 } }, "上月战报")),
              h(
                "div",
                { className: "tk3k-log" },
                log.map((line, i) =>
                  h(
                    "p",
                    { key: i, className: /大捷|破城|克城/.test(line) ? "hl" : "" },
                    line,
                  ),
                ),
              ),
            ),
          );
        }
        return parts;
      };

      /* ---------------- 主渲染 ---------------- */

      /* ---- 选择势力：没有存档时的第一屏 ---- */
      const renderFactionPick = () => {
        const era = eraById(pickEra);
        const ids = factionsOf(era);
        /* 直接用真实建局结果统计，而不是拿静态 CITY_DEFS / GENERAL_DEFS 数 ——
           年代调位（189 年曹操挪去许昌、214 年关羽移镇襄阳）只有建局后才知道，
           静态表算出来的「城 N 将 M」会和实际开局对不上。 */
        const preview = createGame(factionsOf(era)[0], era.id);

        return h(
          "div",
          { className: "tk3k-pick" },
          h("h2", { className: "tk3k-pick-title" }, "选择年代与势力"),

          /* ---- 第一步：年代 ---- */
          h("div", { className: "tk3k-pick-sec" }, "一、选择年代"),
          h(
            "div",
            { className: "tk3k-era-row" },
            ERA_DEFS.map((e) =>
              h(
                "button",
                {
                  type: "button",
                  key: e.id,
                  className: "tk3k-era" + (e.id === pickEra ? " on" : ""),
                  onClick: () => setPickEra(e.id),
                },
                h("span", { className: "tk3k-era-y" }, `${e.year}`),
                h("span", { className: "tk3k-era-n" }, e.name),
              ),
            ),
          ),
          h("p", { className: "tk3k-era-desc" }, era.desc),
          h(
            "p",
            { className: "tk3k-era-hint" },
            era.id === "189"
              ? "乱世：六家争雄。董卓挟天子兵最盛，曹操袁绍各据一城，刘备尚无寸土。"
              : era.id === "200"
                ? "对峙：曹操四城对袁绍河北，两强相争。"
                : era.id === "207"
                  ? "经典：曹操已并河北，刘备孙权偏安，标准开局。"
                  : "三分：曹操势大，刘备得蜀，孙权孤悬。",
          ),

          /* ---- 第二步：势力（随年代变） ---- */
          h("div", { className: "tk3k-pick-sec" }, "二、选择势力"),
          h(
            "div",
            { className: "tk3k-pick-list" },
            ids.map((fid) => {
              const f = ALL_FACTIONS[fid];
              const mine = preview.cities.filter((c) => c.owner === fid);
              const mineIds = mine.map((c) => c.id);
              const gens = preview.generals.filter((g) => g.cityId && mineIds.indexOf(g.cityId) >= 0);
              const lead = gens.slice().sort((a, b) => b.int - a.int)[0];
              const troops = mine.reduce((n, c) => n + (c.troops || 0), 0);
              return h(
                "button",
                {
                  type: "button",
                  key: fid,
                  className: "tk3k-pick-card",
                  style: { "--faction-color": f.color },
                  onClick: () => startFaction(fid, era.id),
                },
                h(
                  "div",
                  { className: "tk3k-pick-head" },
                  h("span", { className: "tk3k-pick-flag" }, f.family),
                  h("span", { className: "tk3k-pick-name" }, f.name),
                ),
                h("div", { className: "tk3k-pick-desc" }, f.desc),
                h(
                  "div",
                  { className: "tk3k-pick-stats" },
                  h("span", null, `城 ${mine.length}`),
                  h("span", null, `将 ${gens.length}`),
                  h("span", null, `兵 ${fmt(troops)}`),
                ),
                lead
                  ? h(
                      "div",
                      { className: "tk3k-pick-lead" },
                      `主谋 ${lead.name}（智 ${lead.int}）`,
                    )
                  : null,
              );
            }),
          ),
          h(
            "p",
            { className: "tk3k-pick-tip" },
            "提示：年代决定天下格局与登场武将；智力越高火计越准，武力越高鏖战越狠。",
          ),
        );
      };

      const body = () => {
        if (!game) return renderFactionPick();
        if (game.outcome === "win") {
          return h(
            "div",
            { className: "tk3k-banner" },
            h("h3", null, "天下一统"),
            h("p", null, `建安 ${game.year - 196} 年，${ALL_FACTIONS[game.playerFaction].name} 尽取八城，四海归一。`),
            h(
              "button",
              { type: "button", className: "tk3k-btn primary", onClick: resetGame },
              "再来一局",
            ),
          );
        }
        if (game.outcome === "lose") {
          return h(
            "div",
            { className: "tk3k-banner" },
            h("h3", null, "大势已去"),
            h("p", null, "八城尽失，主公败走。天下终归他人之手。"),
            h(
              "button",
              { type: "button", className: "tk3k-btn primary", onClick: resetGame },
              "重整旗鼓",
            ),
          );
        }
        if (screen === "march") return renderMarch();
        if (screen === "report") return renderReport();
        return renderMapBody();
      };

      const footer = () => {
        if (!game) return null;
        if (game.outcome) return null;
        if (screen === "march") return null;
        return h(
          "div",
          { className: "tk3k-foot" },
          h(
            "button",
            { type: "button", className: "tk3k-btn primary", onClick: nextTurn },
            "结束本月",
          ),
          h("span", { className: "tk3k-foot-sp" }),
          confirmReset
            ? h(
                "span",
                { style: { display: "flex", gap: 6 } },
                h(
                  "button",
                  { type: "button", className: "tk3k-btn danger", onClick: resetGame },
                  "确认重开",
                ),
                h(
                  "button",
                  { type: "button", className: "tk3k-btn", onClick: () => setConfirmReset(false) },
                  "取消",
                ),
              )
            : h(
                "button",
                {
                  type: "button",
                  className: "tk3k-btn",
                  onClick: () => setConfirmReset(true),
                },
                "重开",
              ),
        );
      };

      if (!open) {
        return h(
          "div",
          { className: "tk3k-root" },
          h("style", null, CSS),
          h(
            "button",
            {
              type: "button",
              className: "tk3k-fab",
              onClick: () => setOpen(true),
              title: "三国志 · 回合制战略",
            },
            h("i", null, "三"),
            "三国",
          ),
        );
      }

      return h(
        "div",
        { className: "tk3k-root" },
        h("style", null, CSS),
        h(
          "div",
          { className: "tk3k-panel" },
          h(
            "div",
            { className: "tk3k-head" },
            h("span", { className: "tk3k-head-t" }, "三国志"),
            h(
              "span",
              { className: "tk3k-head-d" },
              game ? `${game.year} 年 ${MONTHS[game.month]}月 · 第 ${game.turn} 月` : "群雄割据",
            ),
            h("span", { className: "tk3k-head-sp" }),
            h(
              "span",
              { className: "tk3k-head-d", style: { fontVariantNumeric: "tabular-nums" } },
              `金 ${fmt(playerGold)}  粮 ${fmt(playerFood)}  兵 ${fmt(playerTroops)}`,
            ),
            h(
              "button",
              { type: "button", className: "tk3k-x", onClick: () => onExit && onExit(), title: "收起" },
              "✕",
            ),
          ),
          !game || game.outcome ? null : renderMap(),
          h("div", { className: "tk3k-body", ref: bodyRef }, body()),
          message && (!game || !game.outcome) ? h("div", { className: "tk3k-msg" }, message) : null,
          footer(),
        ),
      );
    }


  /* 内核函数都在这个 IIFE 的作用域里，顺手打包出来供测试直接调用 */
  return {
    component: ThreeKingdomsGame,
    internals: { createGame, doDomestic, doRecruit, doBattle, doMoveGeneral, aiTurn, estimateAttack, endTurn, loadGame, saveGame, CITY_DEFS, GENERAL_DEFS, TACTICS, tunables: {
          AI_AGGRESSION, AI_MIN_SURVIVORS, AI_MIN_SEND, AI_MAX_ATTACKS, AI_DRAFT_THRESHOLD,
          WALL_DIV, WALL_DIV_DISCORD, FOOD_PER_CONSCRIPT, UPKEEP_DIV, DESERT_MORALE, DESERT_DIV,
        } },
  };
})();

/* ================= legacy/20-pinball.js ================= */
/* ============================================================================
 * 诺基亚弹珠台（迁自 @local/nokia-pinball）
 *
 * ⚠ 本文件由 tools/import-legacy.mjs 从旧插件 client.js 自动生成，勿手改。
 *   改游戏内核请改旧插件源文件，然后重跑 tools/import-legacy.mjs。
 *   这里只做了三处手术：组件改名收 onExit、open 初值改 true、关闭按钮接外壳。
 * ========================================================================== */

const PinballGame = (function legacyScope() {
    const h = React.createElement;
    const { useState, useRef, useEffect } = React;

    /* ------------------------------------------------------------------ 常量 */

    const NS = "nokia-pinball";
    const HI_KEY = "dsh.nokia-pinball.hi.v1";

    const W = 360;
    const H = 640;
    const BALL_R = 7.5;
    const GRAVITY = 1050;
    const MAX_SPEED = 1500;
    const DRAG = 0.9994;

    const FLIP_LEN = 58;
    const PIV_L = { x: 92, y: 556 };
    const PIV_R = { x: 226, y: 556 };
    const L_REST = 0.42;
    const L_ACTIVE = -0.46;
    const R_REST = Math.PI - 0.42;
    const R_ACTIVE = Math.PI + 0.46;
    const FLIP_SPEED = 17;

    /* 台面边界：线段 [x1,y1,x2,y2,restitution]
       x 12..306 是主台面，x 310..348 是右侧发射槽。
       顶部 (306,44)-(348,96) 是斜导流板：钢珠从发射槽直冲上去后被
       反射到左上，越过 x=310 的隔墙顶端（y=96）进入主台面。 */
    const WALLS = [
      [12, 44, 306, 44, 0.72],
      [306, 44, 348, 96, 0.72],
      [348, 96, 348, 610, 0.72],
      [310, 96, 310, 610, 0.72],
      [12, 44, 12, 510, 0.72],
      [12, 510, 60, 586, 0.72],
      [60, 586, 60, 620, 0.72],
      [306, 510, 258, 586, 0.72],
      [258, 586, 258, 620, 0.72],
    ];

    /* 弹片上方两块弹射胶 */
    const SLINGS = [
      [44, 466, 92, 528, 1.06, 150],
      [274, 466, 226, 528, 1.06, 150],
    ];

    const BUMPERS = [
      { x: 90, y: 215, r: 22, e: 1.38, kick: 230, score: 100 },
      { x: 159, y: 178, r: 22, e: 1.38, kick: 230, score: 100 },
      { x: 228, y: 215, r: 22, e: 1.38, kick: 230, score: 100 },
    ];

    const TARGETS = [
      { x: 70, y: 330, r: 10 },
      { x: 114, y: 330, r: 10 },
      { x: 159, y: 330, r: 10 },
      { x: 204, y: 330, r: 10 },
      { x: 248, y: 330, r: 10 },
    ];

    const ROLLOVERS = [
      { x: 80, y: 104, r: 9 },
      { x: 159, y: 104, r: 9 },
      { x: 238, y: 104, r: 9 },
    ];

    const COLORS = {
      bg: "#0a1419",
      grid: "rgba(79,209,197,.045)",
      steel: "#3d6d72",
      steelHi: "#6fb3ad",
      amber: "#e8b64a",
      amberDim: "#6b5420",
      lit: "#ffd873",
      ball: "#f2f6f5",
      text: "#8fd8cf",
      danger: "#e8705a",
    };

    /* ------------------------------------------------------------ 存档 */

    function loadHi() {
      try {
        const v = Number(window.localStorage.getItem(HI_KEY));
        return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
      } catch {
        return 0;
      }
    }

    function saveHi(v) {
      try {
        window.localStorage.setItem(HI_KEY, String(Math.floor(v)));
      } catch {
        /* 隐私模式下写不进，忽略 */
      }
    }

    function pad(n, len) {
      return String(Math.max(0, Math.floor(n))).padStart(len, "0");
    }

    /* ------------------------------------------------------------ 物理内核 */

    function createGame(hi) {
      return {
        phase: "ready", /* ready | playing | over */
        score: 0,
        hi: Number.isFinite(hi) ? hi : 0,
        balls: 3,
        ball: null,
        flippers: {
          l: { angle: L_REST, omega: 0 },
          r: { angle: R_REST, omega: 0 },
        },
        plunger: { held: false, charge: 0 },
        targets: [false, false, false, false, false],
        rollovers: [false, false, false],
        bumperCd: [0, 0, 0],
        targetCd: [0, 0, 0, 0, 0],
        flipCd: 0,
        bumpFlash: [0, 0, 0],
        combo: 0,
        comboT: 0,
        mult: 1,
        msg: "按空格 / 点「发射」蓄力开球",
        msgT: 3.2,
        pops: [],
        cues: [],
        tick: 0,
      };
    }

    function restartGame(s) {
      const hi = s.hi;
      const fresh = createGame(hi);
      Object.keys(fresh).forEach((k) => {
        s[k] = fresh[k];
      });
    }

    function launchBall(s, power) {
      if (s.phase !== "ready" || s.ball) return false;
      const p = Math.max(0, Math.min(1, power));
      /* 基础速度必须足够越过发射槽隔墙顶端 (y=96)：
         从 y=574 冲到 y<96 需 v>sqrt(2*g*478)≈1002。
         880+520*p 让 p>0.23（约按住 0.26 秒）即可入场，
         轻点一下则球弹回发射槽，可重新蓄力，不判失球。 */
      s.ball = {
        x: 329,
        y: 574,
        vx: 0,
        vy: -(880 + 520 * p),
        r: BALL_R,
      };
      s.phase = "playing";
      s.plunger.held = false;
      s.plunger.charge = 0;
      s.msg = "";
      s.msgT = 0;
      s.cues.push("launch");
      return true;
    }

    function flipperSegment(side, angle) {
      const piv = side === "l" ? PIV_L : PIV_R;
      return [
        piv.x,
        piv.y,
        piv.x + Math.cos(angle) * FLIP_LEN,
        piv.y + Math.sin(angle) * FLIP_LEN,
      ];
    }

    function closestOnSegment(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      return { x: x1 + t * dx, y: y1 + t * dy };
    }

    /* 圆 vs 线段。sv 是该点的表面速度（弹片用），传 null 表示静止墙。 */
    function collideSegment(b, x1, y1, x2, y2, e, kick, sv) {
      const c = closestOnSegment(b.x, b.y, x1, y1, x2, y2);
      let dx = b.x - c.x;
      let dy = b.y - c.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d >= b.r) return null;
      if (d < 0.0001) {
        /* 球心正好压在线上：用线段法线把它推开 */
        const sx = x2 - x1;
        const sy = y2 - y1;
        const sl = Math.sqrt(sx * sx + sy * sy) || 1;
        dx = -sy / sl;
        dy = sx / sl;
        d = 0.0001;
      }
      const nx = dx / d;
      const ny = dy / d;
      b.x = c.x + nx * (b.r + 0.25);
      b.y = c.y + ny * (b.r + 0.25);

      let ux = b.vx - (sv ? sv.x : 0);
      let uy = b.vy - (sv ? sv.y : 0);
      const un = ux * nx + uy * ny;
      if (un < 0) {
        const j = -(1 + e) * un;
        ux += j * nx;
        uy += j * ny;
        b.vx = ux + (sv ? sv.x : 0);
        b.vy = uy + (sv ? sv.y : 0);
      }
      if (kick) {
        b.vx += nx * kick;
        b.vy += ny * kick;
      }
      return { nx, ny };
    }

    function collideCircle(b, c, e, kick) {
      let dx = b.x - c.x;
      let dy = b.y - c.y;
      const rr = b.r + c.r;
      let d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) return null;
      let d = Math.sqrt(d2);
      if (d < 0.0001) {
        dx = 0;
        dy = -1;
        d = 0.0001;
      }
      const nx = dx / d;
      const ny = dy / d;
      b.x = c.x + nx * (rr + 0.25);
      b.y = c.y + ny * (rr + 0.25);
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        const j = -(1 + e) * vn;
        b.vx += j * nx;
        b.vy += j * ny;
      }
      if (kick) {
        b.vx += nx * kick;
        b.vy += ny * kick;
      }
      return { nx, ny };
    }

    function clampSpeed(b) {
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > MAX_SPEED) {
        const k = MAX_SPEED / sp;
        b.vx *= k;
        b.vy *= k;
      }
    }

    function addScore(s, n, x, y, label) {
      const gain = Math.round(n * s.mult);
      s.score += gain;
      if (s.score > s.hi) s.hi = s.score;
      s.pops.push({ x, y, text: "+" + gain, t: 0.9 });
      if (label) s.msg = label;
      if (s.pops.length > 14) s.pops.shift();
    }

    function bumpCombo(s) {
      s.combo += 1;
      s.comboT = 1.5;
      s.mult = Math.min(5, 1 + Math.floor(s.combo / 3));
    }

    function step(s, dt, input) {
      const D = Math.max(0.0001, Math.min(0.05, dt));
      s.tick += D;

      /* 发射槽蓄力 */
      if (s.plunger.held) {
        s.plunger.charge = Math.min(1.15, s.plunger.charge + D);
      }

      /* 弹片角度：朝目标匀速转，角速度喂给碰撞做表面速度 */
      const fl = s.flippers.l;
      const fr = s.flippers.r;
      const move = (a, target) => {
        const diff = target - a;
        const maxStep = FLIP_SPEED * D;
        if (Math.abs(diff) <= maxStep) return target;
        return a + Math.sign(diff) * maxStep;
      };
      const naL = move(fl.angle, input.left ? L_ACTIVE : L_REST);
      const naR = move(fr.angle, input.right ? R_ACTIVE : R_REST);
      fl.omega = (naL - fl.angle) / D;
      fr.omega = (naR - fr.angle) / D;
      fl.angle = naL;
      fr.angle = naR;

      /* 计时器 */
      for (let i = 0; i < 3; i++) {
        s.bumperCd[i] = Math.max(0, s.bumperCd[i] - D);
        s.bumpFlash[i] = Math.max(0, s.bumpFlash[i] - D);
      }
      for (let i = 0; i < 5; i++) s.targetCd[i] = Math.max(0, s.targetCd[i] - D);
      s.flipCd = Math.max(0, s.flipCd - D);
      s.comboT = Math.max(0, s.comboT - D);
      if (s.comboT === 0 && s.combo !== 0) {
        s.combo = 0;
        s.mult = 1;
      }
      s.msgT = Math.max(0, s.msgT - D);
      if (s.msgT === 0 && s.msg) s.msg = "";
      for (let i = s.pops.length - 1; i >= 0; i--) {
        s.pops[i].t -= D;
        if (s.pops[i].t <= 0) s.pops.splice(i, 1);
      }

      if (s.phase !== "playing" || !s.ball) return;

      const b = s.ball;
      const N = 3;
      const sub = D / N;
      const segL = flipperSegment("l", fl.angle);
      const segR = flipperSegment("r", fr.angle);

      for (let k = 0; k < N; k++) {
        b.vy += GRAVITY * sub;
        b.vx *= DRAG;
        b.vy *= DRAG;
        clampSpeed(b);
        b.x += b.vx * sub;
        b.y += b.vy * sub;

        /* 固定墙 */
        for (let i = 0; i < WALLS.length; i++) {
          const w = WALLS[i];
          collideSegment(b, w[0], w[1], w[2], w[3], w[4], 0, null);
        }

        /* 弹射胶 */
        for (let i = 0; i < SLINGS.length; i++) {
          const sl = SLINGS[i];
          const hit = collideSegment(b, sl[0], sl[1], sl[2], sl[3], sl[4], 0, null);
          if (hit) {
            b.vx += hit.nx * sl[5];
            b.vy += hit.ny * sl[5];
            addScore(s, 30, b.x, b.y, "");
            s.cues.push("sling");
          }
        }

        /* 弹片：把角速度换成接触点的表面速度 */
        const flippers = [
          { seg: segL, piv: PIV_L, omega: fl.omega },
          { seg: segR, piv: PIV_R, omega: fr.omega },
        ];
        for (let i = 0; i < flippers.length; i++) {
          const f = flippers[i];
          const c = closestOnSegment(b.x, b.y, f.seg[0], f.seg[1], f.seg[2], f.seg[3]);
          const rx = c.x - f.piv.x;
          const ry = c.y - f.piv.y;
          const sv = { x: -f.omega * ry, y: f.omega * rx };
          const hit = collideSegment(b, f.seg[0], f.seg[1], f.seg[2], f.seg[3], 0.46, 0, sv);
          if (hit && s.flipCd === 0) {
            s.cues.push("flip");
            s.flipCd = 0.07;
          }
        }

        /* 缓冲器 */
        for (let i = 0; i < BUMPERS.length; i++) {
          const bp = BUMPERS[i];
          const hit = collideCircle(b, bp, bp.e, bp.kick);
          if (hit && s.bumperCd[i] === 0) {
            s.bumperCd[i] = 0.11;
            s.bumpFlash[i] = 0.18;
            bumpCombo(s);
            addScore(s, bp.score, bp.x, bp.y - bp.r - 6, "");
            s.cues.push("bumper");
          }
        }

        /* 靶子 */
        for (let i = 0; i < TARGETS.length; i++) {
          const tg = TARGETS[i];
          const hit = collideCircle(b, tg, 0.86, 0);
          if (hit && !s.targets[i] && s.targetCd[i] === 0) {
            s.targetCd[i] = 0.16;
            s.targets[i] = true;
            addScore(s, 250, tg.x, tg.y - 14, "");
            s.cues.push("target");
            if (s.targets.every(Boolean)) {
              addScore(s, 2000, 159, 300, "全靶命中 +2000");
              s.msgT = 2.2;
              s.targets = [false, false, false, false, false];
              s.cues.push("bonus");
            }
          }
        }

        /* 顶部滚道 */
        for (let i = 0; i < ROLLOVERS.length; i++) {
          const ro = ROLLOVERS[i];
          const dx = b.x - ro.x;
          const dy = b.y - ro.y;
          if (dx * dx + dy * dy < (ro.r + b.r) * (ro.r + b.r) && !s.rollovers[i]) {
            s.rollovers[i] = true;
            addScore(s, 150, ro.x, ro.y - 12, "");
            s.cues.push("roll");
            if (s.rollovers.every(Boolean)) {
              addScore(s, 1000, 159, 120, "滚道全亮 +1000");
              s.msgT = 2.2;
              s.rollovers = [false, false, false];
              s.cues.push("bonus");
            }
          }
        }

        clampSpeed(b);

        /* 回到发射槽（不算失球） */
        if (b.y > 600 && b.x > 308) {
          s.ball = null;
          s.phase = "ready";
          s.plunger.charge = 0;
          s.msg = "球回到发射槽 · 再发一次";
          s.msgT = 2.4;
          s.cues.push("return");
          return;
        }

        /* 掉球 */
        if (b.y > 636) {
          s.ball = null;
          s.balls -= 1;
          s.cues.push("drain");
          if (s.balls <= 0) {
            s.balls = 0;
            s.phase = "over";
            s.msg = "";
          } else {
            s.phase = "ready";
            s.combo = 0;
            s.mult = 1;
            s.msg = "失一球 · 按空格发射";
            s.msgT = 2.4;
          }
          return;
        }
      }
    }

    /* ------------------------------------------------------------ 绘制 */

    function line(ctx, x1, y1, x2, y2, color, width) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineCap = "round";
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    function disc(ctx, x, y, r, fill, stroke, sw) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.lineWidth = sw || 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }

    function draw(ctx, s) {
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, W, H);

      /* 底色 + 诺基亚 LCD 风格细格 */
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y <= H; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      /* 顶部 LCD 条 */
      ctx.fillStyle = "rgba(79,209,197,.07)";
      ctx.fillRect(0, 0, W, 38);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 12px "Courier New",monospace';
      ctx.textBaseline = "middle";
      ctx.fillText("NOKIA", 12, 19);
      ctx.font = 'bold 15px "Courier New",monospace';
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.lit;
      ctx.fillText(pad(s.score, 7), 348, 19);
      ctx.textAlign = "left";
      ctx.font = 'bold 11px "Courier New",monospace';
      ctx.fillStyle = COLORS.text;
      let dots = "";
      for (let i = 0; i < 3; i++) dots += i < s.balls ? "●" : "○";
      ctx.fillText(dots, 116, 19);
      if (s.mult > 1) {
        ctx.fillStyle = COLORS.amber;
        ctx.fillText("×" + s.mult, 176, 19);
      }

      /* 台面边界 */
      for (let i = 0; i < WALLS.length; i++) {
        const w = WALLS[i];
        line(ctx, w[0], w[1], w[2], w[3], COLORS.steel, 7);
        line(ctx, w[0], w[1], w[2], w[3], COLORS.steelHi, 2);
      }

      /* 弹射胶 */
      for (let i = 0; i < SLINGS.length; i++) {
        const sl = SLINGS[i];
        line(ctx, sl[0], sl[1], sl[2], sl[3], COLORS.amberDim, 9);
        line(ctx, sl[0], sl[1], sl[2], sl[3], COLORS.amber, 3);
      }

      /* 滚道 */
      for (let i = 0; i < ROLLOVERS.length; i++) {
        const ro = ROLLOVERS[i];
        disc(ctx, ro.x, ro.y, ro.r + 3, "rgba(79,209,197,.10)", COLORS.steel, 1.5);
        if (s.rollovers[i]) disc(ctx, ro.x, ro.y, ro.r - 2, COLORS.lit, null, 0);
        else disc(ctx, ro.x, ro.y, ro.r - 2, "#122a30", COLORS.steelHi, 1);
      }

      /* 靶子 */
      for (let i = 0; i < TARGETS.length; i++) {
        const tg = TARGETS[i];
        disc(ctx, tg.x, tg.y, tg.r + 3, "#0e2228", COLORS.steel, 1.5);
        if (s.targets[i]) {
          disc(ctx, tg.x, tg.y, tg.r - 1, COLORS.lit, COLORS.amber, 2);
        } else {
          disc(ctx, tg.x, tg.y, tg.r - 1, "#1b3a40", COLORS.steelHi, 1.5);
        }
      }

      /* 缓冲器 */
      for (let i = 0; i < BUMPERS.length; i++) {
        const bp = BUMPERS[i];
        const flash = s.bumpFlash[i] > 0;
        disc(ctx, bp.x, bp.y, bp.r + 5, "#0d252b", COLORS.steel, 2);
        disc(ctx, bp.x, bp.y, bp.r, flash ? COLORS.lit : "#1c4148", flash ? "#fff2c0" : COLORS.steelHi, 2.5);
        disc(ctx, bp.x, bp.y, bp.r - 8, flash ? "#fff6d8" : "#16333a", null, 0);
        ctx.fillStyle = flash ? "#4a3a10" : COLORS.text;
        ctx.font = 'bold 11px "Courier New",monospace';
        ctx.textAlign = "center";
        ctx.fillText(String(100), bp.x, bp.y + 4);
        ctx.textAlign = "left";
      }

      /* 翻板 */
      const segL = flipperSegment("l", s.flippers.l.angle);
      const segR = flipperSegment("r", s.flippers.r.angle);
      [segL, segR].forEach((sg) => {
        line(ctx, sg[0], sg[1], sg[2], sg[3], "#5a4415", 15);
        line(ctx, sg[0], sg[1], sg[2], sg[3], COLORS.amber, 9);
        line(ctx, sg[0], sg[1], sg[2], sg[3], COLORS.lit, 2);
        disc(ctx, sg[0], sg[1], 5, COLORS.steelHi, null, 0);
      });

      /* 发射槽蓄力条 */
      const ch = Math.min(1, s.plunger.charge / 1.15);
      ctx.fillStyle = "#0d252b";
      ctx.fillRect(314, 566, 30, 44);
      ctx.fillStyle = COLORS.amber;
      ctx.fillRect(317, 606 - 36 * ch, 24, 36 * ch);
      ctx.strokeStyle = COLORS.steel;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(314, 566, 30, 44);

      /* 钢珠 */
      if (s.ball) {
        const b = s.ball;
        disc(ctx, b.x + 1.5, b.y + 2, b.r + 1, "rgba(0,0,0,.45)", null, 0);
        disc(ctx, b.x, b.y, b.r, COLORS.ball, "#9fb8b6", 1.5);
        disc(ctx, b.x - 2.2, b.y - 2.5, 2.2, "#ffffff", null, 0);
      }

      /* 飘分 */
      ctx.textAlign = "center";
      ctx.font = 'bold 13px "Courier New",monospace';
      for (let i = 0; i < s.pops.length; i++) {
        const p = s.pops[i];
        ctx.globalAlpha = Math.min(1, p.t / 0.5);
        ctx.fillStyle = COLORS.lit;
        ctx.fillText(p.text, p.x, p.y - (0.9 - p.t) * 22);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";

      /* 中央提示 */
      if (s.msg) {
        ctx.fillStyle = "rgba(6,16,20,.82)";
        ctx.fillRect(24, 286, 312, 50);
        ctx.strokeStyle = COLORS.steel;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(24, 286, 312, 50);
        ctx.fillStyle = COLORS.text;
        ctx.font = 'bold 13px "Courier New",monospace';
        ctx.textAlign = "center";
        ctx.fillText(s.msg, 180, 311);
        ctx.textAlign = "left";
      }

      /* 结束遮罩由 React DOM 层负责，画布只压暗 */
      if (s.phase === "over") {
        ctx.fillStyle = "rgba(4,10,13,.55)";
        ctx.fillRect(0, 38, W, H - 38);
      }
    }

    /* ------------------------------------------------------------ 音效 */

    function beep(ac, freq, dur, type, vol, slide) {
      if (!ac) return;
      try {
        const t0 = ac.currentTime;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = type || "square";
        osc.frequency.setValueAtTime(freq, t0);
        if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(60, slide), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      } catch {
        /* 音频被浏览器策略拦下就静音继续 */
      }
    }

    function ensureAudio(audioRef) {
      if (audioRef.current) return audioRef.current;
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        audioRef.current = new Ctor();
      } catch {
        audioRef.current = null;
      }
      return audioRef.current;
    }

    function playCues(cues, audioRef, on) {
      if (!on || !cues.length) return;
      const ac = ensureAudio(audioRef);
      for (let i = 0; i < cues.length; i++) {
        switch (cues[i]) {
          case "launch": beep(ac, 220, 0.22, "square", 0.07, 620); break;
          case "bumper": beep(ac, 520 + Math.random() * 120, 0.07, "square", 0.055); break;
          case "target": beep(ac, 760, 0.09, "square", 0.05); break;
          case "roll": beep(ac, 880, 0.08, "triangle", 0.05); break;
          case "sling": beep(ac, 300, 0.06, "square", 0.045); break;
          case "flip": beep(ac, 170, 0.045, "square", 0.035); break;
          case "bonus": beep(ac, 660, 0.22, "square", 0.06, 1320); break;
          case "return": beep(ac, 420, 0.12, "triangle", 0.045, 260); break;
          case "drain": beep(ac, 340, 0.35, "sawtooth", 0.06, 90); break;
          default: break;
        }
      }
    }

    /* ------------------------------------------------------------ CSS */

    const CSS = `
.np-root{position:fixed;inset:0;pointer-events:none;z-index:2147483001;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  --np-accent:#4fd1c5;--np-amber:#e8b64a;--np-line:rgba(128,128,128,.35);
  --np-bg:var(--dsw-alias-bg-layer-1,#1b2226);--np-bg2:var(--dsw-alias-bg-layer-3,#12191d);
  --np-fg:var(--dsw-alias-label-primary,#e8e8ea);--np-fg2:var(--dsw-alias-label-secondary,#a8adb5);
  --np-fg3:var(--dsw-alias-label-tertiary,#8b8f98)}
body:not([data-ds-dark-theme]) .np-root{--np-accent:#0e7c73;--np-amber:#8a6512;--np-line:rgba(0,0,0,.18);
  --np-bg:#f4f6f5;--np-bg2:#e6ecea;--np-fg:#1a2426;--np-fg2:#4a5658;--np-fg3:#6b7779}
.np-fab{position:absolute;right:18px;bottom:148px;pointer-events:auto;display:flex;align-items:center;gap:7px;
  padding:9px 14px 9px 11px;border-radius:999px;cursor:pointer;border:1px solid var(--np-line);
  background:var(--np-bg);color:var(--np-fg);box-shadow:0 6px 20px rgba(0,0,0,.28);
  font-size:13px;font-weight:600;letter-spacing:.02em;transition:transform .14s ease}
.np-fab:hover{transform:translateY(-2px)}
.np-fab-ico{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;
  background:var(--np-accent);color:#06201d;font-size:13px;font-weight:800}
.np-panel{position:absolute;right:16px;bottom:158px;width:min(380px,calc(100vw - 32px));
  height:min(640px,calc(100vh - 182px));pointer-events:auto;display:flex;flex-direction:column;
  overflow:hidden;border:1px solid var(--np-line);border-radius:12px;background:var(--np-bg);
  color:var(--np-fg);box-shadow:0 18px 54px rgba(0,0,0,.42)}
.np-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--np-line);background:var(--np-bg2)}
.np-head-t{font-size:14px;font-weight:700;letter-spacing:.08em}
.np-head-sub{font-size:10px;letter-spacing:.18em;color:var(--np-accent);font-weight:700}
.np-x{margin-left:auto;width:26px;height:26px;flex:none;border:1px solid var(--np-line);border-radius:6px;
  background:transparent;color:var(--np-fg2);cursor:pointer;font-size:17px;line-height:1}
.np-x:hover{color:var(--np-fg);border-color:var(--np-accent)}
.np-hud{flex:none;display:flex;gap:0;border-bottom:1px solid var(--np-line);background:var(--np-bg2)}
.np-hud-cell{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;padding:7px 10px;border-right:1px solid var(--np-line)}
.np-hud-cell:last-child{border-right:0}
.np-hud-cell b{font-size:9px;letter-spacing:.14em;color:var(--np-fg3);font-weight:600}
.np-hud-cell span{font-family:"Courier New",monospace;font-size:14px;font-weight:700;color:var(--np-amber);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.np-canvas-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
  overflow:hidden;background:#060d11;position:relative}
.np-canvas{display:block;touch-action:none;image-rendering:auto}
.np-ctrl{flex:none;display:flex;gap:7px;padding:8px 10px;border-top:1px solid var(--np-line);background:var(--np-bg2)}
.np-btn{flex:1;min-width:0;padding:11px 6px;border:1px solid var(--np-line);border-radius:8px;
  background:var(--np-bg);color:var(--np-fg);font-size:13px;font-weight:700;cursor:pointer;
  user-select:none;-webkit-user-select:none;touch-action:none;transition:background .1s}
.np-btn:active{background:var(--np-accent);color:#06201d}
.np-btn-launch{flex:1.2;border-color:var(--np-amber);color:var(--np-amber)}
.np-foot{flex:none;display:flex;align-items:center;gap:6px;padding:6px 10px;border-top:1px solid var(--np-line);
  font-size:10px;color:var(--np-fg3);line-height:1.4}
.np-foot-tip{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.np-mini{flex:none;padding:4px 8px;border:1px solid var(--np-line);border-radius:6px;background:transparent;
  color:var(--np-fg2);font-size:10px;cursor:pointer;white-space:nowrap}
.np-mini:hover{color:var(--np-fg);border-color:var(--np-accent)}
.np-over{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;background:rgba(4,10,13,.78);pointer-events:auto}
.np-over h3{margin:0;font-size:22px;letter-spacing:.18em;color:var(--np-amber)}
.np-over p{margin:0;font-family:"Courier New",monospace;font-size:14px;color:var(--np-fg)}
.np-over button{margin-top:6px;padding:9px 22px;border:1px solid var(--np-amber);border-radius:8px;
  background:transparent;color:var(--np-amber);font-size:13px;font-weight:700;cursor:pointer}
`;

    /* ------------------------------------------------------------ 组件 */

    function isTyping(el) {
      if (!el) return false;
      const tag = el.tagName || "";
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
    }

    function PinballGame({ onExit }) {
      /* 由外壳决定挂载时机：一进来就是展开态，open 恒真让旧 FAB 分支变成死代码 */
      const [open, setOpen] = useState(true);
      const [hud, setHud] = useState(() => ({
        score: 0,
        hi: loadHi(),
        balls: 3,
        phase: "ready",
        mult: 1,
        msg: "",
        sound: true,
      }));

      const canvasRef = useRef(null);
      const wrapRef = useRef(null);
      const stRef = useRef(null);
      const inRef = useRef({ left: false, right: false });
      const hudRef = useRef(hud);
      const audioRef = useRef(null);
      const savedHiRef = useRef(hud.hi);
      const rafRef = useRef(0);

      useEffect(() => {
        if (!open) return undefined;

        if (!stRef.current) stRef.current = createGame(loadHi());
        const st = stRef.current;
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return undefined;
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        canvas.width = W * 2;
        canvas.height = H * 2;

        const resize = () => {
          const cw = wrap.clientWidth || 340;
          const chh = wrap.clientHeight || 480;
          const scale = Math.min(cw / W, chh / H);
          canvas.style.width = Math.max(120, Math.floor(W * scale)) + "px";
          canvas.style.height = Math.max(200, Math.floor(H * scale)) + "px";
        };
        resize();
        let ro = null;
        if (typeof window.ResizeObserver !== "undefined") {
          ro = new window.ResizeObserver(resize);
          ro.observe(wrap);
        }
        window.addEventListener("resize", resize);

        const onKeyDown = (e) => {
          if (isTyping(e.target) || isTyping(window.document.activeElement)) return;
          const k = e.key;
          if (k === "ArrowLeft" || k === "a" || k === "A") {
            inRef.current.left = true;
            e.preventDefault();
          } else if (k === "ArrowRight" || k === "d" || k === "D") {
            inRef.current.right = true;
            e.preventDefault();
          } else if (k === " " || k === "Spacebar") {
            e.preventDefault();
            if (!e.repeat) st.plunger.held = true;
          } else if (k === "r" || k === "R") {
            restartGame(st);
          }
        };
        const onKeyUp = (e) => {
          const k = e.key;
          if (k === "ArrowLeft" || k === "a" || k === "A") inRef.current.left = false;
          else if (k === "ArrowRight" || k === "d" || k === "D") inRef.current.right = false;
          else if (k === " " || k === "Spacebar") {
            st.plunger.held = false;
            launchBall(st, Math.min(1, st.plunger.charge / 1.1));
          }
        };
        const onBlur = () => {
          inRef.current.left = false;
          inRef.current.right = false;
          st.plunger.held = false;
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);

        let last = 0;
        const frame = (t) => {
          const dt = last ? Math.min(0.04, (t - last) / 1000) : 0.016;
          last = t;
          step(st, dt, inRef.current);
          draw(ctx, st);
          playCues(st.cues, audioRef, hudRef.current.sound);
          st.cues.length = 0;

          if (st.hi > savedHiRef.current) {
            savedHiRef.current = st.hi;
            saveHi(st.hi);
          }
          const next = {
            score: st.score,
            hi: st.hi,
            balls: st.balls,
            phase: st.phase,
            mult: st.mult,
            msg: st.msg,
            sound: hudRef.current.sound,
          };
          const cur = hudRef.current;
          if (
            cur.score !== next.score ||
            cur.hi !== next.hi ||
            cur.balls !== next.balls ||
            cur.phase !== next.phase ||
            cur.mult !== next.mult ||
            cur.msg !== next.msg ||
            cur.sound !== next.sound
          ) {
            hudRef.current = next;
            setHud(next);
          }
          rafRef.current = window.requestAnimationFrame(frame);
        };
        rafRef.current = window.requestAnimationFrame(frame);

        return () => {
          if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
          window.removeEventListener("blur", onBlur);
          window.removeEventListener("resize", resize);
          if (ro) ro.disconnect();
          onBlur();
          saveHi(st.hi);
        };
      }, [open]);

      const toggleSound = () => {
        const next = Object.assign({}, hudRef.current, { sound: !hudRef.current.sound });
        hudRef.current = next;
        setHud(next);
      };
      const doRestart = () => {
        const st = stRef.current;
        if (st) restartGame(st);
      };
      const pressL = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        inRef.current.left = true;
      };
      const releaseL = () => {
        inRef.current.left = false;
      };
      const pressR = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        inRef.current.right = true;
      };
      const releaseR = () => {
        inRef.current.right = false;
      };
      const launchDown = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const st = stRef.current;
        if (st) st.plunger.held = true;
      };
      const launchUp = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const st = stRef.current;
        if (!st) return;
        st.plunger.held = false;
        launchBall(st, Math.min(1, st.plunger.charge / 1.1));
      };

      return h(
        "div",
        { className: "np-root" },
        h("style", null, CSS),
        !open
          ? h(
              "button",
              {
                className: "np-fab",
                title: "诺基亚弹珠台",
                onClick: () => setOpen(true),
              },
              h("span", { className: "np-fab-ico" }, "◉"),
              "弹珠台"
            )
          : h(
              "div",
              { className: "np-panel" },
              h(
                "div",
                { className: "np-head" },
                h("span", { className: "np-head-t" }, "弹珠台"),
                h("span", { className: "np-head-sub" }, "NOKIA PINBALL"),
                h("button", { className: "np-x", onClick: () => onExit && onExit() }, "×")
              ),
              h(
                "div",
                { className: "np-hud" },
                h(
                  "div",
                  { className: "np-hud-cell" },
                  h("b", null, "分数"),
                  h("span", null, pad(hud.score, 7))
                ),
                h(
                  "div",
                  { className: "np-hud-cell" },
                  h("b", null, "最高"),
                  h("span", null, pad(hud.hi, 7))
                ),
                h(
                  "div",
                  { className: "np-hud-cell" },
                  h("b", null, "剩余球"),
                  h("span", null, "●".repeat(hud.balls) + "○".repeat(Math.max(0, 3 - hud.balls)))
                ),
                h(
                  "div",
                  { className: "np-hud-cell" },
                  h("b", null, "倍率"),
                  h("span", null, "×" + hud.mult)
                )
              ),
              h(
                "div",
                { className: "np-canvas-wrap", ref: wrapRef },
                h("canvas", { className: "np-canvas", ref: canvasRef })
              ),
              h(
                "div",
                { className: "np-ctrl" },
                h(
                  "button",
                  {
                    className: "np-btn",
                    onPointerDown: pressL,
                    onPointerUp: releaseL,
                    onPointerLeave: releaseL,
                    onPointerCancel: releaseL,
                  },
                  "◀ 左"
                ),
                h(
                  "button",
                  {
                    className: "np-btn np-btn-launch",
                    onPointerDown: launchDown,
                    onPointerUp: launchUp,
                    onPointerCancel: launchUp,
                  },
                  "发射"
                ),
                h(
                  "button",
                  {
                    className: "np-btn",
                    onPointerDown: pressR,
                    onPointerUp: releaseR,
                    onPointerLeave: releaseR,
                    onPointerCancel: releaseR,
                  },
                  "右 ▶"
                )
              ),
              h(
                "div",
                { className: "np-foot" },
                h("span", { className: "np-foot-tip" }, "← → 翻板 · 空格蓄力发射 · R 重开"),
                h("button", { className: "np-mini", onClick: toggleSound }, hud.sound ? "♪ 开" : "♪ 关"),
                h("button", { className: "np-mini", onClick: doRestart }, "重开")
              ),
              hud.phase === "over"
                ? h(
                    "div",
                    { className: "np-over" },
                    h("h3", null, "GAME OVER"),
                    h("p", null, "得分 " + pad(hud.score, 7)),
                    h("p", null, "最高 " + pad(hud.hi, 7)),
                    h("button", { onClick: doRestart }, "再来一局")
                  )
                : null
            )
      );
    }


  /* 内核函数都在这个 IIFE 的作用域里，顺手打包出来供测试直接调用 */
  return {
    component: PinballGame,
    internals: { createGame, restartGame, launchBall, step, draw, WALLS, BUMPERS, TARGETS, W, H, BALL_R, loadHi, saveHi },
  };
})();

/* ================= shell/50-register.js ================= */
/* ============================================================================
 * 把迁入的两款旧游戏登记进游戏库。
 *
 * 顺序说明：build.mjs 按 core → games → legacy → shell 拼接，所以执行到这里时
 * legacy/ 里的 ThreeKingdomsGame / PinballGame 已经定义好了。
 * ========================================================================== */

defineGame({
  id: "three-kingdoms",
  name: "三国志",
  sub: "THREE KINGDOMS",
  icon: "三",
  tag: "战略",
  color: "#c8a24a",
  desc: "回合制群雄割据：八座城池、内政征兵、火计伏兵，三个月一轮回。",
  order: 10,
  component: ThreeKingdomsGame.component,
});

defineGame({
  id: "nokia-pinball",
  name: "弹珠台",
  sub: "NOKIA PINBALL",
  icon: "◉",
  tag: "街机",
  color: "#4fd1c5",
  desc: "复刻诺基亚 J2ME 弹珠台：翻板、弹射器、缓冲器，蓄力越足飞得越远。",
  order: 20,
  component: PinballGame.component,
});

/* ================= shell/90-shell.js ================= */
/* ============================================================================
 * 外壳：悬浮按钮 + 面板 + 游戏卡片墙 + 游戏容器。
 *
 * 这里只做三件事：开合、选游戏、给游戏一个能自适应大小的容器。
 * 具体玩法一律交给 src/games/ 或 src/legacy/，外壳不认识任何规则。
 *
 * 尺寸约束来自 DSH 宿主：右下角 bottom 76px 以内被输入框占着，旧插件
 * （三国 bottom:96 / 弹珠台 bottom:148）就是为避开它才抬高的，沿用 96。
 * ========================================================================== */

const GC_FAB_BOTTOM = 96;

const GC_CSS = `
.gc-root{position:fixed;inset:0;pointer-events:none;z-index:2147483100;
  --gc-accent:#7c8cff;--gc-accent-2:#4fd1c5;--gc-warn:#e8b64a;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  -webkit-font-smoothing:antialiased}
body:not([data-ds-dark-theme]) .gc-root{--gc-accent:#4453c4;--gc-accent-2:#0e7c73;--gc-warn:#8a6512}

/* ---------------------------------------------------------------- 悬浮按钮 */
.gc-fab{position:absolute;right:18px;bottom:${GC_FAB_BOTTOM}px;pointer-events:auto;
  display:flex;align-items:center;gap:7px;padding:9px 14px 9px 11px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));
  background:var(--dsw-alias-bg-layer-1,#1f1f22);color:var(--dsw-alias-label-primary,#e8e8ea);
  box-shadow:0 6px 20px rgba(0,0,0,.28);font-size:13px;font-weight:600;letter-spacing:.02em;
  transition:transform .14s ease,box-shadow .14s ease}
.gc-fab:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(0,0,0,.34)}
.gc-fab:active{transform:translateY(0)}
.gc-fab-ico{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;
  border-radius:6px;background:linear-gradient(135deg,var(--gc-accent),var(--gc-accent-2));
  color:#fff;font-size:12px;line-height:1}

/* ------------------------------------------------------------------ 面板 */
.gc-panel{position:absolute;right:16px;bottom:76px;pointer-events:auto;display:flex;flex-direction:column;
  width:min(760px,calc(100vw - 32px));height:min(700px,calc(100vh - 100px));
  border-radius:14px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,#1b1b1f);
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));
  box-shadow:0 18px 52px rgba(0,0,0,.42);
  color:var(--dsw-alias-label-primary,#eceef1);font-size:13px;line-height:1.5}
.gc-head{flex:none;display:flex;align-items:center;gap:9px;padding:9px 12px;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03))}
.gc-head-t{font-weight:700;letter-spacing:.12em;font-size:13px}
.gc-head-sub{color:var(--dsw-alias-label-secondary,#a2a6ad);font-size:11px;letter-spacing:.06em}
.gc-head-sp{flex:1}
.gc-back{display:inline-flex;align-items:center;gap:5px;padding:3px 9px 3px 7px;border-radius:7px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-secondary,#a2a6ad);font-size:12px;font-family:inherit;
  transition:background .12s ease,color .12s ease}
.gc-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));
  color:var(--dsw-alias-label-primary,#eceef1)}
.gc-x{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#a2a6ad);cursor:pointer;
  font-size:15px;line-height:1;padding:3px 6px;border-radius:6px}
.gc-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));
  color:var(--dsw-alias-label-primary,#eceef1)}

/* 游戏容器：flex:1 + min-height:0 是让内部 canvas/网格能拿到真实高度去自适应的前提 */
.gc-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.gc-body-pad{padding:14px}

/* --------------------------------------------------------------- 卡片墙 */
.gc-wall{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px}
.gc-wall::-webkit-scrollbar{width:8px}
.gc-wall::-webkit-scrollbar-thumb{background:rgba(128,128,128,.3);border-radius:4px}
.gc-sect{font-size:11px;letter-spacing:.16em;color:var(--dsw-alias-label-tertiary,#8b8f98);
  margin:0 2px 10px;font-weight:600}
.gc-sect+.gc-grid{margin-bottom:18px}
.gc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.gc-card{position:relative;display:flex;flex-direction:column;gap:4px;padding:12px 12px 11px;
  border-radius:11px;cursor:pointer;text-align:left;font-family:inherit;font-size:inherit;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.035));
  color:inherit;transition:transform .13s ease,border-color .13s ease,background .13s ease}
.gc-card:hover{transform:translateY(-2px);border-color:var(--gc-hue,var(--gc-accent));
  background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.06))}
.gc-card-top{display:flex;align-items:center;gap:8px}
.gc-card-ico{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:30px;height:30px;border-radius:9px;font-size:15px;line-height:1;
  background:color-mix(in srgb,var(--gc-hue,var(--gc-accent)) 20%,transparent);
  border:1px solid color-mix(in srgb,var(--gc-hue,var(--gc-accent)) 45%,transparent)}
.gc-card-nm{font-weight:650;font-size:13.5px;letter-spacing:.01em}
.gc-card-sub{font-size:10px;letter-spacing:.1em;color:var(--dsw-alias-label-tertiary,#8b8f98);
  text-transform:uppercase}
.gc-card-desc{font-size:11.5px;color:var(--dsw-alias-label-secondary,#a2a6ad);line-height:1.45;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gc-card-hi{position:absolute;top:9px;right:10px;font-size:10px;font-variant-numeric:tabular-nums;
  color:var(--gc-warn);letter-spacing:.02em}

/* --------------------------------------------------- 迁入游戏的浮层压平 */
/* 三国/弹珠台原本是 position:fixed 的独立浮层。放进 .gc-body 后要把它们
   压成普通块级元素，否则会盖住整个页面、还会各自带一层 z-index。 */
.gc-body .tk3k-root,.gc-body .np-root{position:static;inset:auto;z-index:auto;
  pointer-events:auto;height:100%;display:flex;flex-direction:column}
.gc-body .tk3k-panel,.gc-body .np-panel{position:static;right:auto;bottom:auto;left:auto;
  width:100%;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;
  background:transparent;flex:1 1 auto;min-height:0}
/* 旧面板自带的标题条里已经有自己的关闭键，和外壳头重复，藏掉标题条的文字区 */
.gc-body .tk3k-head,.gc-body .np-head{border-radius:0}

/* ------------------------------------------------------------ 通用小组件 */
.gc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:6px 12px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12.5px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.32));background:transparent;
  color:var(--dsw-alias-label-primary,#eceef1);transition:background .12s ease}
.gc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.gc-btn.primary{background:var(--gc-accent);border-color:transparent;color:#fff;font-weight:600}
.gc-btn.primary:hover{filter:brightness(1.1)}
.gc-empty{display:flex;align-items:center;justify-content:center;height:100%;
  color:var(--dsw-alias-label-tertiary,#8b8f98);font-size:12px}
`;

/* ------------------------------------------------------------------ 组件 */

function GameCenterOverlay() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const games = allGames();
  const active = activeId ? gameById(activeId) : null;

  /* 选择游戏时先把键盘焦点从上一个游戏里挪开，避免两个游戏同时吃按键 */
  const enter = useCallback((id) => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setActiveId(id);
  }, []);

  const exit = useCallback(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setActiveId(null);
  }, []);

  const closeAll = useCallback(() => {
    exit();
    setOpen(false);
  }, [exit]);

  /* 面板开着时按 Esc 返回上一层：游戏内先回卡片墙，墙上再关面板。
     捕获阶段拦下，避免和游戏内部的按键（弹珠台的 R、三国的方向键）抢。 */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (isTyping(e.target)) return;
      if (activeId) {
        e.preventDefault();
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeId, exit]);

  if (!open) {
    return h(
      "div",
      { className: "gc-root" },
      h("style", null, GC_CSS + GC_GAME_CSS),
      h(
        "button",
        {
          type: "button",
          className: "gc-fab",
          title: "游戏中心",
          onClick: () => setOpen(true),
        },
        h("span", { className: "gc-fab-ico" }, "🎮"),
        "游戏中心",
      ),
    );
  }

  return h(
    "div",
    { className: "gc-root" },
    h("style", null, GC_CSS + GC_GAME_CSS),
    h(
      "div",
      { className: "gc-panel" },
      h(
        "div",
        { className: "gc-head" },
        active
          ? h(
              "button",
              { type: "button", className: "gc-back", onClick: exit, title: "返回游戏列表" },
              "← 游戏库",
            )
          : null,
        h("span", { className: "gc-head-t" }, active ? active.name : "游戏中心"),
        h("span", { className: "gc-head-sub" }, active ? active.sub : `GAME CENTER · ${games.length} 款`),
        h("span", { className: "gc-head-sp" }),
        h("button", { type: "button", className: "gc-x", onClick: closeAll, title: "收起" }, "✕"),
      ),
      active
        ? h(
            "div",
            { className: "gc-body" },
            /* key 让换游戏时强制卸载重建，避免上一个游戏的 tick 残留 */
            h(active.component, { key: active.id, onExit: exit }),
          )
        : h("div", { className: "gc-wall" }, renderWall(games, enter)),
    ),
  );
}

/** 卡片墙：先按 tag 分组，组内保持 registry 给的顺序 */
function renderWall(games, onPick) {
  const groups = [];
  for (const g of games) {
    const tag = g.tag || "经典";
    let bucket = groups.find((x) => x.tag === tag);
    if (!bucket) groups.push((bucket = { tag, items: [] }));
    bucket.items.push(g);
  }
  return groups.map((bucket) =>
    h(
      "div",
      { key: bucket.tag },
      h("div", { className: "gc-sect" }, bucket.tag),
      h(
        "div",
        { className: "gc-grid" },
        bucket.items.map((g) => {
          const hi = bestScore(g.id);
          return h(
            "button",
            {
              key: g.id,
              type: "button",
              className: "gc-card",
              style: { "--gc-hue": g.color },
              onClick: () => onPick(g.id),
              title: g.desc,
            },
            hi > 0 ? h("span", { className: "gc-card-hi" }, fmtNum(hi)) : null,
            h(
              "div",
              { className: "gc-card-top" },
              h("span", { className: "gc-card-ico" }, g.icon || "🎲"),
              h(
                "div",
                { style: { minWidth: 0 } },
                h("div", { className: "gc-card-nm" }, g.name),
                h("div", { className: "gc-card-sub" }, g.sub || ""),
              ),
            ),
            h("div", { className: "gc-card-desc" }, g.desc),
          );
        }),
      ),
    ),
  );
}

/* ================= shell/99-entry.js ================= */
/* ============================================================================
 * 插件出口：注册一个 shell.overlay 槽位。
 *
 * order 取 59 —— 排在旧三国（60）、旧弹珠台（61）之前。
 * 两个旧包已从 profile 的 bundles 里移出，这里的相对次序只是兜底：
 * 若哪天把旧包加回来，游戏中心按钮会显示在它们上方。
 * ========================================================================== */

const NS = "dsh-game-hub";

const inject = ["slots"];

function apply(ctx) {
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      {
        name: "shell.overlay",
        id: NS,
        order: 59,
        label: () => "游戏中心",
      },
      GameCenterOverlay,
    ),
  );
}

exports.name = NS;
exports.inject = inject;
exports.apply = apply;

/* 供无头测试直接取内核：三国规则、弹珠台物理都不经过 React 也能验 */
exports.__internals = {
  threeKingdoms: ThreeKingdomsGame.internals,
  pinball: PinballGame.internals,
  registry: { allGames, gameById, defineGame },
  kernels: GAME_KERNELS,
  util: { storeGet, storeSet, storeDel, loadBoard, saveScore, bestScore, makeRng, isTyping },
  GameCenterOverlay,
};

    return module.exports;
  },
});
