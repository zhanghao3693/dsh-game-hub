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
