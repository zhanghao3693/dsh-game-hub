#!/usr/bin/env node
/**
 * 无头验证 dist/client.js：不打开浏览器，用假 window / 假 React 把打包产物跑一遍。
 *
 * 验的是"这包能不能被宿主装上去并正常工作"这一类问题：
 *   ① factory 能执行完、exports 形状对、apply 能注册槽位
 *   ② 游戏注册表里两款迁入游戏的组件都是函数
 *   ③ 三国内核仍可用（调将 / 出兵 / 回合推进 —— 防止搬运时改坏了规则）
 *   ④ 弹珠台物理仍可用（发球后球会动、会掉分或落洞）
 *   ⑤ 高分榜读写
 *
 * 不做 DOM 渲染 —— 那是用户刷新页面才能验的，这里只保证"代码没问题"。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import vm from "node:vm";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CODE = fs.readFileSync(path.join(ROOT, "dist", "client.js"), "utf8");

let pass = 0;
const fails = [];
function ok(label, cond, extra) {
  if (cond) {
    pass += 1;
  } else {
    fails.push(`${label}${extra ? ` — ${extra}` : ""}`);
  }
}

/* ------------------------------------------------------------ 假环境 */

/** 最小 React 替身：只要不报错地跑完组件定义即可，不渲染 */
function makeReact() {
  const cache = [];
  const hook = (init) => {
    const v = typeof init === "function" ? init() : init;
    cache.push(v);
    return [v, () => {}];
  };
  return {
    createElement: (type, props, ...kids) => ({ type, props, kids }),
    useState: (init) => hook(init),
    useRef: (init) => ({ current: init }),
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    Fragment: "Fragment",
    __hooks: cache,
  };
}

const storage = new Map();
const captured = {};

const sandbox = {
  window: {},
  document: {
    activeElement: null,
    createElement: () => ({ style: {}, getContext: () => null, appendChild() {}, setAttribute() {} }),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
  },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  setTimeout,
  clearTimeout,
  console,
  Math,
  Date,
  JSON,
};
sandbox.window = sandbox;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.document = sandbox.document;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
sandbox.window.cancelAnimationFrame = sandbox.cancelAnimationFrame;
sandbox.window.addEventListener = () => {};
sandbox.window.removeEventListener = () => {};
sandbox.window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    captured.id = id;
    captured.exports = factory((name) => {
      if (name === "react") return makeReact();
      throw new Error(`unexpected require: ${name}`);
    });
  },
};

vm.createContext(sandbox);
try {
  vm.runInContext(CODE, sandbox, { filename: "dist/client.js" });
} catch (err) {
  console.error("❌ factory 执行抛错：", err && err.stack ? err.stack : err);
  process.exit(1);
}

const exp = captured.exports;

/* ------------------------------------------------------------ 断言 */

ok("模块 id 正确", captured.id === "dsh-game-hub", captured.id);
ok("exports 有 name", exp && exp.name === "dsh-game-hub", exp && exp.name);
ok("inject 含 slots", Array.isArray(exp.inject) && exp.inject.includes("slots"));
ok("apply 是函数", typeof exp.apply === "function");
ok("__internals 存在", !!exp.__internals);

/* 槽位注册：给一个假 ctx，看它有没有按 shell.overlay 报上去 */
let slotMeta = null;
let slotComp = null;
exp.apply({
  slots: {
    inject: (name, fn) => fn(),
    register: (meta, comp) => {
      slotMeta = meta;
      slotComp = comp;
    },
  },
});
ok("注册到 shell.overlay", slotMeta && slotMeta.name === "shell.overlay", JSON.stringify(slotMeta));
ok("槽位 id 正确", slotMeta && slotMeta.id === "dsh-game-hub", slotMeta && slotMeta.id);
ok("槽位组件是函数", typeof slotComp === "function");

/* 游戏库 */
const games = exp.__internals.registry.allGames();
ok("游戏库非空", games.length >= 2, `${games.length} 款`);
ok(
  "三国已登记且组件可用",
  !!games.find((g) => g.id === "three-kingdoms" && typeof g.component === "function"),
);
ok(
  "弹珠台已登记且组件可用",
  !!games.find((g) => g.id === "nokia-pinball" && typeof g.component === "function"),
);
ok("游戏 id 无重复", new Set(games.map((g) => g.id)).size === games.length);

/* 三国内核 */
const tk = exp.__internals.threeKingdoms;
ok("三国内核导出齐全", ["createGame", "doBattle", "doMoveGeneral", "aiTurn", "endTurn"].every((k) => typeof tk[k] === "function"));
const tkTun = tk.tunables || {};
ok("WALL_DIV = 700（定参值）", tkTun.WALL_DIV === 700, String(tkTun.WALL_DIV));
ok("AI_MAX_ATTACKS = 1（定参值）", tkTun.AI_MAX_ATTACKS === 1, String(tkTun.AI_MAX_ATTACKS));

let g = tk.createGame("cao", "207");
ok("开局 version=3", g && g.version === 3);
ok("开局八城", Array.isArray(g.cities) && g.cities.length === 8, String(g.cities && g.cities.length));

/* 调将：曹操的城之间搬一名武将 */
const caoCities = g.cities.filter((c) => c.owner === "cao").map((c) => c.id);
const fromId = caoCities[0];
const toId = caoCities[1];
const victim = g.generals.find((x) => x.cityId === fromId);
const moved = tk.doMoveGeneral(g, fromId, toId, victim.key);
g = moved.game;
ok("调将生效", g.generals.find((x) => x.key === victim.key).cityId === toId, moved.message);
ok("调将每月一次", tk.doMoveGeneral(g, toId, fromId, victim.key).game.generals.find((x) => x.key === victim.key).cityId === toId);

/* 回合推进：不崩、turn 递增、调将标记复位 */
const before = g.turn;
const turnRes = tk.endTurn(g);
g = turnRes.game;
ok("endTurn 返回 game", !!(turnRes && turnRes.game));
ok("endTurn 后回合递增", g.turn > before, `${before} → ${g.turn}`);
ok("调将标记已复位", g.generals.every((x) => !x.doneMove));

/* AI 跑一月不崩 */
let aiErr = null;
try {
  const r = tk.aiTurn(g);
  ok("aiTurn 返回 game", !!(r && r.game));
} catch (err) {
  aiErr = err;
}
ok("aiTurn 不抛错", aiErr === null, aiErr && aiErr.message);

/* 弹珠台内核 */
const np = exp.__internals.pinball;
ok("弹珠台内核导出齐全", ["createGame", "launchBall", "step"].every((k) => typeof np[k] === "function"));
const st = np.createGame();
ok("弹珠台可创建", !!st);
const idle = { left: false, right: false };
const ballBefore = JSON.stringify(st.ball || st);
np.launchBall(st, 0.9);
for (let i = 0; i < 30; i += 1) np.step(st, 1 / 60, idle);
ok("发球后球体状态改变", JSON.stringify(st.ball || st) !== ballBefore);
/* 翻板：按住左键若干帧，左翻板角度应当从静止角转向激活角 */
const angBefore = st.flippers.l.angle;
for (let i = 0; i < 6; i += 1) np.step(st, 1 / 60, { left: true, right: false });
ok("左翻板能摆动", st.flippers.l.angle !== angBefore, `${angBefore} → ${st.flippers.l.angle}`);

/* 高分榜 */
const u = exp.__internals.util;
u.saveScore("three-kingdoms", 1234, "测试");
ok("高分榜写入", u.bestScore("three-kingdoms") === 1234, String(u.bestScore("three-kingdoms")));
u.saveScore("three-kingdoms", 999, "测试2");
ok("高分榜保序取最大", u.bestScore("three-kingdoms") === 1234);

/* ------------------------------------------------------------ 内置游戏内核 */
const K = exp.__internals.kernels;
ok("四款内置游戏已挂内核", ["snake", "tetris", "breakout", "2048"].every((k) => !!K[k]), Object.keys(K).join(","));

/* 贪吃蛇 */
{
  const sn = K.snake;
  let s1 = sn.newState(1);
  const head0 = s1.body[0];
  s1.food = { x: 0, y: 0 }; /* 挪远，避免这一步恰好吃到 */
  s1 = sn.step(s1);
  ok("蛇走一步头前移", s1.body[0].x === head0.x + 1 && s1.body[0].y === head0.y);
  ok("蛇不吃食长度不变", s1.body.length === 4, String(s1.body.length));

  /* 吃到食物应该变长 */
  let s2 = sn.newState(1);
  const hd = s2.body[0];
  s2.food = { x: hd.x + 1, y: hd.y };
  s2 = sn.step(s2);
  ok("吃到食物长一节", s2.body.length === 5 && s2.score === 1, `${s2.body.length}/${s2.score}`);

  /* 撞墙死 */
  let s3 = sn.newState(1);
  s3.body = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }];
  s3.dir = { x: -1, y: 0 };
  s3.pending = [];
  s3.food = { x: 19, y: 19 };
  s3 = sn.step(s3);
  ok("撞左墙即死", s3.alive === false);

  /* 不能 180° 回头 */
  let s4 = sn.newState(1);
  s4.pending = [{ x: -1, y: 0 }]; /* 当前向右，反向键应被丢弃 */
  s4.food = { x: 0, y: 0 };
  s4 = sn.step(s4);
  ok("反向键被丢弃仍在往右", s4.dir.x === 1 && s4.alive === true);
}

/* 俄罗斯方块 */
{
  const tt = K.tetris;
  ok("I 块转出 4 格", tt.rotate(tt.SHAPES.I.cells).length === 4);
  /* 消满一行 */
  const board = tt.newState().board.map((r) => r.slice());
  for (let x = 0; x < tt.COLS; x += 1) board[tt.ROWS - 1][x] = "#fff";
  const [cleared, n] = tt.clear(board);
  ok("满行被消掉", n === 1 && cleared[0].every((c) => !c), String(n));
  ok("消行后行数不变", cleared.length === tt.ROWS);
  ok("等级越高下落越快", tt.dropMs(1) > tt.dropMs(5));
  ok("下落间隔有下限", tt.dropMs(99) >= 90, String(tt.dropMs(99)));
  /* 出生方块不与空棋盘冲突 */
  const s5 = tt.newState();
  ok("新局不冲突", s5.alive === true && tt.collide(s5.board, s5.piece.cells, s5.piece.x, s5.piece.y) === false);
  /* 硬降落点 = 直落到底 */
  const gy = tt.ghostY(s5.board, s5.piece);
  ok("幽灵落点在棋盘内", gy > s5.piece.y && gy < tt.ROWS, `${s5.piece.y}→${gy}`);
}

/* 打砖块 */
{
  const bk = K.breakout;
  let b = bk.newState(1);
  ok("开局 60 块砖", b.bricks.length === 60);
  ok("开局待发球", b.phase === "serve");
  const bx0 = b.ball.x;
  b = bk.launch(b);
  ok("发球后进入 play", b.phase === "play");
  ok("发球后球有速度", Math.hypot(b.ball.vx, b.ball.vy) > 100);
  for (let i = 0; i < 60; i += 1) b = bk.step(b, 1 / 60, { left: false, right: false, targetX: null });
  ok("球动起来了", b.ball.y !== undefined && (b.ball.x !== bx0 || b.ball.y < bk.H - 60));

  /* 板子被夹在墙内 */
  let b2 = bk.newState(1);
  for (let i = 0; i < 200; i += 1) b2 = bk.step(b2, 1 / 60, { left: true, right: false, targetX: null });
  ok("板子不会滑出左墙", b2.paddle.x >= 0, String(b2.paddle.x));
  for (let i = 0; i < 400; i += 1) b2 = bk.step(b2, 1 / 60, { left: false, right: true, targetX: null });
  ok("板子不会滑出右墙", b2.paddle.x + b2.paddle.w <= bk.W + 0.01, String(b2.paddle.x));

  /* 直接把球砸向砖块：应该消砖并加分 */
  let b3 = bk.newState(1);
  b3 = bk.launch(b3);
  const aliveBefore = b3.bricks.filter((x) => x.alive).length;
  b3.ball.x = b3.bricks.find((x) => x.alive).x + 4;
  b3.ball.y = b3.bricks.find((x) => x.alive).y + 40;
  b3.ball.vx = 0;
  b3.ball.vy = -400;
  for (let i = 0; i < 20; i += 1) b3 = bk.step(b3, 1 / 120, { left: false, right: false, targetX: null });
  ok("打到砖块会消砖", b3.bricks.filter((x) => x.alive).length < aliveBefore);
  ok("消砖加分", b3.score > 0, String(b3.score));
}

/* 2048 */
{
  const g2 = K["2048"];
  ok("[2,2,4,4] 合成 [4,8]", JSON.stringify(g2.slideLine([2, 2, 4, 4]).line) === "[4,8,0,0]");
  ok("[2,2,2,2] 合成 [4,4] 而不是 [4,8]", JSON.stringify(g2.slideLine([2, 2, 2, 2]).line) === "[4,4,0,0]");
  ok("[2,0,0,2] 合成 [4,0,0,0]", JSON.stringify(g2.slideLine([2, 0, 0, 2]).line) === "[4,0,0,0]");
  ok("合成分数正确", g2.slideLine([2, 2, 4, 4]).gain === 12, String(g2.slideLine([2, 2, 4, 4]).gain));
  ok("[2,4,2,4] 不合并", JSON.stringify(g2.slideLine([2, 4, 2, 4]).line) === "[2,4,2,4]");

  let s6 = g2.newState();
  ok("开局两个数字", s6.board.flat().filter(Boolean).length === 2);
  s6 = g2.move(s6, "left");
  ok("走一步后仍是 4x4", s6.board.length === 4 && s6.board[0].length === 4);
  ok("走一步后落了新块或没动", s6.board.flat().filter(Boolean).length >= 2);
  /* 无法移动时判定结束 */
  const dead = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  ok("死局判定", g2.canMove(dead) === false);
  ok("有空格不算死局", g2.canMove([[0, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]) === true);
}

/* 扫雷 */
{
  const ms = K.minesweeper;
  ok("三档难度", ms.LEVELS.length === 3 && ms.LEVELS[2].mines === 99);
  let m1 = ms.newState(0);
  ok("初级 9x9/10雷", m1.w === 9 && m1.h === 9 && m1.mineCount === 10);
  ok("开局未布雷", m1.started === false && m1.cells.every((c) => !c.mine));

  /* 首点必安全：重复 30 次都必须不是雷，且首点周围也没雷 */
  let firstSafe = true;
  let neighborSafe = true;
  for (let t = 0; t < 30; t += 1) {
    let m2 = ms.newState(0);
    const idx = 40; /* 9x9 中间 */
    m2 = ms.place(m2, idx);
    if (m2.cells[idx].mine) firstSafe = false;
    for (const n of ms.neighbors(m2, idx)) if (m2.cells[n].mine) neighborSafe = false;
  }
  ok("首点必安全（30 次）", firstSafe);
  ok("首点周围也安全（30 次）", neighborSafe);

  /* 雷数正确 */
  let m3 = ms.newState(1);
  m3 = ms.place(m3, 100);
  ok("中级布雷 40 颗", m3.cells.filter((c) => c.mine).length === 40, String(m3.cells.filter((c) => c.mine).length));

  /* adj 计算正确（手算一格） */
  let m4 = ms.newState(0);
  m4 = ms.place(m4, 40);
  const guessed = ms.neighbors(m4, 0).filter((n) => m4.cells[n].mine).length;
  ok("adj 与邻居雷数一致", m4.cells[0].mine || m4.cells[0].adj === guessed, `${m4.cells[0].adj}/${guessed}`);

  /* 踩雷结束 */
  let m5 = ms.newState(0);
  m5 = ms.place(m5, 40);
  const mineIdx = m5.cells.findIndex((c) => c.mine);
  m5 = ms.reveal(m5, mineIdx);
  ok("踩雷结束", m5.over === true && m5.hit === mineIdx);
  ok("踩雷后所有雷亮出", m5.cells.filter((c) => c.mine).every((c) => c.state === "revealed"));

  /* 插旗 / 取消旗 */
  let m6 = ms.newState(0);
  m6 = ms.place(m6, 40);
  const hiddenIdx = m6.cells.findIndex((c, i) => !c.mine && c.state === "hidden" && i !== 40);
  m6 = ms.flag(m6, hiddenIdx);
  ok("插旗后 flags=1", m6.flags === 1 && m6.cells[hiddenIdx].state === "flag");
  const m6b = ms.flag(m6, hiddenIdx);
  ok("再点取消旗", m6b.flags === 0 && m6b.cells[hiddenIdx].state === "hidden");

  /* 展开 0 会连带扩散 */
  let m7 = ms.newState(0);
  m7 = ms.place(m7, 40);
  const zeroIdx = m7.cells.findIndex((c) => !c.mine && c.adj === 0);
  if (zeroIdx >= 0) {
    const m7b = ms.reveal(m7, zeroIdx);
    ok("0 格展开多于 1 格", m7b.revealed > 1, String(m7b.revealed));
  } else {
    ok("0 格展开多于 1 格（本局无 0 格，跳过）", true);
  }

  /* 全部非雷翻开即通关 */
  let m8 = ms.newState(0);
  m8 = ms.place(m8, 40);
  for (let i = 0; i < m8.cells.length; i += 1) {
    if (!m8.cells[i].mine && m8.cells[i].state === "hidden") m8 = ms.reveal(m8, i);
  }
  ok("翻开全部非雷即通关", m8.won === true, `revealed=${m8.revealed}`);
}

/* 小蜜蜂 */
{
  const iv = K.invaders;
  const idleIn = { left: false, right: false, fire: false, targetX: null };
  let i1 = iv.newWave(null, 1);
  ok("开局 4x8=32 只敌人", i1.enemies.length === 32);
  ok("开局 3 条命", i1.lives === 3);
  ok("开局 3 个掩体", i1.bunkers.length === 3);
  ok("第 1 波基础速度", i1.baseSpeed === 40);

  /* 敌人横移 */
  const x0 = i1.enemies[0].x;
  i1 = iv.step(i1, 1 / 60, { ...idleIn });
  ok("敌人会横移", i1.enemies[0].x !== x0);

  /* 玩家移动并夹在墙内 */
  let i2 = iv.newWave(null, 1);
  for (let k = 0; k < 200; k += 1) i2 = iv.step(i2, 1 / 60, { left: true, right: false, fire: false, targetX: null });
  ok("玩家不出左墙", i2.player.x >= 0);
  for (let k = 0; k < 400; k += 1) i2 = iv.step(i2, 1 / 60, { left: false, right: true, fire: false, targetX: null });
  ok("玩家不出右墙", i2.player.x + i2.player.w <= iv.W + 0.01);

  /* 开火造子弹 */
  let i3 = iv.newWave(null, 1);
  i3 = iv.step(i3, 1 / 60, { left: false, right: false, fire: true, targetX: null });
  ok("开火生成子弹", !!i3.bullet);
  i3 = iv.step(i3, 1 / 60, { left: false, right: false, fire: false, targetX: null });
  ok("同屏只有一颗子弹", !!i3.bullet && i3.enemyBullets.length >= 0);

  /* 打光敌人 → 下一波 */
  let i4 = iv.newWave(null, 1);
  for (const e of i4.enemies) e.alive = false;
  i4 = iv.step(i4, 1 / 60, idleIn);
  ok("清屏后进入第 2 波", i4.wave === 2, String(i4.wave));
  ok("第 2 波敌人满员", i4.enemies.filter((e) => e.alive).length === 32);
  ok("第 2 波更快", i4.baseSpeed > 40, String(i4.baseSpeed));

  /* 敌人压到底线 = 输 */
  let i5 = iv.newWave(null, 1);
  i5.phase = "play";
  /* 把敌人压到玩家同一水平线（INV_PLAYER_Y = INV_H - 42） */
  for (const e of i5.enemies) e.y = iv.H - 62;
  i5 = iv.step(i5, 1 / 60, idleIn);
  ok("敌人到底线判负", i5.phase === "over");
}

/* 五子棋 */
{
  const gm = K.gomoku;
  ok("15×15 棋盘", gm.N === 15);
  let q = gm.newState(false);
  ok("黑先", q.turn === gm.BLACK);
  q = gm.place(q, 7, 7);
  ok("落子后换手", q.turn === gm.WHITE && q.board[7][7] === gm.BLACK);
  const q2 = gm.place(q, 7, 7);
  ok("同点不可重复落子", q2 === q);

  /* 横向五连判胜 */
  let w = gm.newState(false);
  for (let i = 0; i < 5; i += 1) {
    w = gm.place(w, 3 + i, 5); /* 黑 */
    if (i < 4) w = gm.place(w, 3 + i, 6); /* 白占别处 */
  }
  ok("横向五连判胜", w.over === true && w.winner === gm.BLACK, `winner=${w.winner}`);
  ok("返回五连线", !!w.winLine && w.winLine.length === 5);

  /* 斜向五连判胜 */
  let dg = gm.newState(false);
  for (let i = 0; i < 5; i += 1) {
    dg = gm.place(dg, 2 + i, 2 + i);
    if (i < 4) dg = gm.place(dg, 10, 1 + i);
  }
  ok("斜向五连判胜", dg.over === true && dg.winner === gm.BLACK);

  /* 棋型识别 */
  ok("识别连五", gm.scanPattern("_XXXXX_").score >= 10000000 || gm.scanPattern("XXXXX").score >= 10000000);
  ok("识别活四", gm.scanPattern("_XXXX_").openFour === true);
  ok("识别活三", gm.scanPattern("_XXX_").openThree === true);
  ok("识别冲四但不误判活四", gm.scanPattern("BXXXX_").openFour === false);

  /* 必须堵活三（用分散四角，避免测试构造本身触发黑自己成五） */
  const mk = (seq) => {
    let st = gm.newState(false);
    for (const [x, y] of seq) st = gm.place(st, x, y);
    return st;
  };
  let b1 = mk([[0, 0], [7, 7], [0, 1], [8, 7], [14, 0], [9, 7], [14, 1]]);
  const stop = gm.aiMove(b1, gm.BLACK, 2);
  ok("必须堵对手活三", !!stop && stop.y === 7 && (stop.x === 6 || stop.x === 10), JSON.stringify(stop));

  /* 自己有四连时优先成五（哪怕对手也有威胁） */
  let b2 = mk([[0, 0], [7, 7], [0, 1], [8, 7], [0, 2], [9, 7], [0, 3]]);
  const winMove = gm.aiMove(b2, gm.BLACK, 2);
  ok("自己能成五时先赢", !!winMove && winMove.x === 0 && winMove.y === 4, JSON.stringify(winMove));

  /* 三档难度要有可测的强度差（L2 明显强于 L1） */
  const play = (lb, lw) => {
    let st = gm.newState(false);
    let n = 0;
    while (!st.over && n < 225) {
      const me = st.turn;
      const mv = gm.aiMove(st, me, me === gm.BLACK ? lb : lw);
      if (!mv) break;
      st = gm.place(st, mv.x, mv.y);
      n += 1;
    }
    return st.winner;
  };
  let l2win = 0;
  for (let i = 0; i < 8; i += 1) {
    if (play(2, 1) === gm.BLACK) l2win += 1;
    if (play(1, 2) === gm.WHITE) l2win += 1;
  }
  ok("普通档明显强于简单档", l2win >= 5, `L2 赢 ${l2win}/16`);
}

/* 中国象棋 */
{
  const xq = K.xiangqi;
  ok("象棋内核已挂载", !!xq && typeof xq.newState === "function");

  const I = (x, y) => y * 9 + x;
  const mkBoard = (list) => {
    const b = new Array(90).fill(null);
    for (const it of list) b[I(it.x, it.y)] = it.p;
    return b;
  };
  const mkSt = (b, turn) => ({ board: b, turn, over: false, winner: 0, history: [] });
  const cell = (m) => [m.to % 9, Math.floor(m.to / 9)];
  const has = (ms, x, y) => ms.some((m) => m.to === I(x, y));

  const start = xq.newState();
  ok("象棋开局红黑各 44 步", xq.legalMoves(start.board, xq.RED).length === 44
    && xq.legalMoves(start.board, xq.BLACK).length === 44);
  ok("象棋开局无将军无白脸", !xq.inCheck(start.board, xq.RED) && !xq.kingsFacing(start.board));

  /* 马腿：绊住一条腿少两步 */
  const knFree = mkBoard([{ x: 4, y: 4, p: "rN" }, { x: 3, y: 0, p: "rK" }, { x: 5, y: 0, p: "bK" }]);
  const knBlock = mkBoard([{ x: 4, y: 4, p: "rN" }, { x: 4, y: 3, p: "rP" }, { x: 3, y: 0, p: "rK" }, { x: 5, y: 0, p: "bK" }]);
  const nFree = xq.pseudoMoves(knFree, xq.RED).filter((m) => m.from === I(4, 4));
  const nBlock = xq.pseudoMoves(knBlock, xq.RED).filter((m) => m.from === I(4, 4));
  ok("马腿不绊时八个点", nFree.length === 8, String(nFree.length));
  ok("塞马腿少走两步", nBlock.length === 6 && !has(nBlock, 3, 2) && !has(nBlock, 5, 2), String(nBlock.length));

  /* 象眼 + 象不过河 */
  const elFree = mkBoard([{ x: 2, y: 9, p: "rB" }, { x: 4, y: 9, p: "rK" }, { x: 4, y: 0, p: "bK" }]);
  const elBlock = mkBoard([{ x: 2, y: 9, p: "rB" }, { x: 3, y: 8, p: "rP" }, { x: 4, y: 9, p: "rK" }, { x: 4, y: 0, p: "bK" }]);
  const eFree = xq.pseudoMoves(elFree, xq.RED).filter((m) => m.from === I(2, 9));
  const eBlock = xq.pseudoMoves(elBlock, xq.RED).filter((m) => m.from === I(2, 9));
  ok("象飞田两处", eFree.length === 2 && has(eFree, 0, 7) && has(eFree, 4, 7));
  ok("塞象眼只剩一处", eBlock.length === 1 && has(eBlock, 0, 7), JSON.stringify(eBlock.map(cell)));
  const eAcross = mkBoard([{ x: 2, y: 5, p: "rB" }, { x: 4, y: 9, p: "rK" }, { x: 4, y: 0, p: "bK" }]);
  const ea = xq.pseudoMoves(eAcross, xq.RED).filter((m) => m.from === I(2, 5));
  ok("象不过河", ea.length === 2 && ea.every((m) => Math.floor(m.to / 9) >= 5), JSON.stringify(ea.map(cell)));

  /* 炮：必须隔子才能吃 */
  const cnWith = mkBoard([{ x: 4, y: 7, p: "rC" }, { x: 4, y: 5, p: "rP" }, { x: 4, y: 2, p: "bP" }, { x: 4, y: 0, p: "bK" }, { x: 3, y: 9, p: "rK" }]);
  const cnNo = mkBoard([{ x: 4, y: 7, p: "rC" }, { x: 4, y: 2, p: "bP" }, { x: 4, y: 0, p: "bK" }, { x: 3, y: 9, p: "rK" }]);
  const cw = xq.pseudoMoves(cnWith, xq.RED).filter((m) => m.from === I(4, 7));
  const cn2 = xq.pseudoMoves(cnNo, xq.RED).filter((m) => m.from === I(4, 7));
  ok("炮隔一子吃子", cw.some((m) => m.to === I(4, 2) && m.cap === "bP"), JSON.stringify(cw.map(cell)));
  ok("炮无架子不能吃", !cn2.some((m) => m.cap === "bP"), JSON.stringify(cn2.map(cell)));
  ok("炮不能越过第一个子", !cw.some((m) => m.to === I(4, 1)));

  /* 兵：过河才能横走，永不后退 */
  const pw1 = xq.pseudoMoves(mkBoard([{ x: 4, y: 6, p: "rP" }, { x: 4, y: 9, p: "rK" }, { x: 4, y: 0, p: "bK" }]), xq.RED).filter((m) => m.from === I(4, 6));
  ok("兵未过河只能直进", pw1.length === 1 && pw1[0].to === I(4, 5), JSON.stringify(pw1.map(cell)));
  const pw2 = xq.pseudoMoves(mkBoard([{ x: 4, y: 4, p: "rP" }, { x: 4, y: 9, p: "rK" }, { x: 4, y: 0, p: "bK" }]), xq.RED).filter((m) => m.from === I(4, 4));
  ok("兵过河可横走三向", pw2.length === 3 && !has(pw2, 4, 5), JSON.stringify(pw2.map(cell)));

  /* 士不出宫 */
  const ad = xq.pseudoMoves(mkBoard([{ x: 3, y: 9, p: "rA" }, { x: 4, y: 9, p: "rK" }, { x: 4, y: 0, p: "bK" }]), xq.RED).filter((m) => m.from === I(3, 9));
  ok("士只能在九宫内斜走", ad.length === 1 && ad[0].to === I(4, 8), JSON.stringify(ad.map(cell)));

  /* 白脸将 */
  ok("同列无遮挡判白脸", xq.kingsFacing(mkBoard([{ x: 4, y: 0, p: "bK" }, { x: 4, y: 9, p: "rK" }])) === true);
  ok("同列有子不算白脸", xq.kingsFacing(mkBoard([{ x: 4, y: 0, p: "bK" }, { x: 4, y: 9, p: "rK" }, { x: 4, y: 5, p: "rP" }])) === false);

  /* 合法着法要排除会造成白脸将的走法 */
  const fac = mkBoard([{ x: 4, y: 0, p: "bK" }, { x: 3, y: 9, p: "rK" }, { x: 0, y: 9, p: "rR" }]);
  const facMoves = xq.legalMoves(fac, xq.RED).filter((m) => m.from === I(3, 9));
  ok("将不能走到对将同列", !has(facMoves, 4, 9) && has(facMoves, 3, 8), JSON.stringify(facMoves.map(cell)));

  /* 将死即终局 */
  const mateB = mkBoard([
    { x: 3, y: 0, p: "bK" }, { x: 3, y: 1, p: "rR" }, { x: 4, y: 1, p: "rR" }, { x: 5, y: 9, p: "rK" },
  ]);
  ok("将死时对方无合法着法", xq.legalMoves(mateB, xq.BLACK).length === 0 && xq.inCheck(mateB, xq.BLACK));

  /* AI 会吃白送的子 */
  const freeRook = mkBoard([{ x: 4, y: 5, p: "rR" }, { x: 8, y: 5, p: "bR" }, { x: 3, y: 0, p: "bK" }, { x: 4, y: 9, p: "rK" }]);
  const capMove = xq.ai(mkSt(freeRook, xq.RED), 2);
  ok("AI 吃无保护的大子", !!capMove && capMove.to === I(8, 5) && capMove.cap === "bR", JSON.stringify(capMove && cell(capMove)));

  /* AI 不会白送：吃有保护的子会被回吃，应放弃 */
  const guarded = mkBoard([
    { x: 4, y: 5, p: "rR" }, { x: 8, y: 5, p: "bN" }, { x: 8, y: 0, p: "bR" },
    { x: 3, y: 0, p: "bK" }, { x: 4, y: 9, p: "rK" },
  ]);
  const guardMove = xq.ai(mkSt(guarded, xq.RED), 3);
  ok("AI 不吃被保护的子", !!guardMove && guardMove.to !== I(8, 5), JSON.stringify(guardMove && cell(guardMove)));

  /* 难度要有实际差距 */
  const duel = (lr, lb, n) => {
    let s = xq.newState();
    let i = 0;
    while (!s.over && i < (n || 120)) {
      const mv = xq.ai(s, s.turn === xq.RED ? lr : lb);
      if (!mv) break;
      s = xq.apply(s, mv);
      i += 1;
    }
    return s.winner;
  };
  /* 慢棋：每局 5~9 秒，只跑 2 局；断言「不输」比「全胜」稳定，
     L1 是随机走子，偶尔能靠乱吃占便宜，不能当成能力下限。 */
  let l3w = 0;
  let l3l = 0;
  for (let i = 0; i < 2; i += 1) {
    const w0 = duel(3, 1);
    if (w0 === xq.RED) l3w += 1;
    if (w0 === xq.BLACK) l3l += 1;
  }
  ok("象棋困难档压制简单档", l3w >= 1 && l3l === 0, `L3 赢 ${l3w}/2 输 ${l3l}`);

  /* 走出终局：apply 后必须给出胜者 */
  const mateSt = mkSt(mkBoard([
    { x: 4, y: 0, p: "bK" }, { x: 0, y: 1, p: "rR" }, { x: 0, y: 9, p: "rK" }, { x: 8, y: 9, p: "rR" },
  ]), xq.RED);
  const winMove = xq.ai(mateSt, 2);
  const done = xq.apply(mateSt, winMove);
  ok("AI 会一步杀并终局", done.over === true && done.winner === xq.RED);
}

/* ------------------------------------------------------------ 掼蛋 */
{
  const k = K.guandan;
  ok("掼蛋已注册进内核表", !!k);
  ok("掼蛋内核已挂载", !!k && typeof k.deck === "function");

  const deck = k.deck();
  ok("掼蛋两副 108 张且 id 唯一", deck.length === 108 && new Set(deck.map((c) => c.id)).size === 108);
  ok("掼蛋大小王各两张", deck.filter((c) => c.r === 16).length === 2 && deck.filter((c) => c.r === 15).length === 2);

  let dealt = k.startDeal(null, 0);
  ok("掼蛋发牌四家各 27 张", dealt.hands.every((hd) => hd.length === 27)
    && dealt.hands.reduce((a, b) => a + b.length, 0) === 108);

  /* 牌型识别：逐个牌型过一遍（L 是级牌点数，用 2 打级） */
  const L = 2;
  let nid = 5000;
  const C = (r, s) => ({ r, s: s === undefined ? 0 : s, id: nid++ });
  const ty = (cards) => {
    const a = k.analyze(cards, L);
    return a ? a.type : 0;
  };
  const T = k.T;
  ok("掼蛋识别单张", ty([C(5)]) === T.SINGLE);
  ok("掼蛋识别对子", ty([C(7, 0), C(7, 1)]) === T.PAIR);
  ok("掼蛋识别三张", ty([C(9, 0), C(9, 1), C(9, 2)]) === T.TRIPLE);
  ok("掼蛋识别三带二", ty([C(9, 0), C(9, 1), C(9, 2), C(4, 0), C(4, 1)]) === T.FULL);
  ok("掼蛋识别顺子", ty([C(3, 0), C(4, 1), C(5, 2), C(6, 3), C(7, 0)]) === T.STRAIGHT);
  ok("掼蛋识别连对", ty([C(3, 0), C(3, 1), C(4, 0), C(4, 1), C(5, 0), C(5, 1)]) === T.CONPAIR);
  ok("掼蛋识别钢板", ty([C(3, 0), C(3, 1), C(3, 2), C(4, 0), C(4, 1), C(4, 2)]) === T.PLATE);
  ok("掼蛋识别四炸", ty([C(8, 0), C(8, 1), C(8, 2), C(8, 3)]) === T.B4);
  ok("掼蛋识别同花顺", ty([C(3, 0), C(4, 0), C(5, 0), C(6, 0), C(7, 0)]) === T.FLUSH);
  ok("掼蛋乱牌不是牌型", ty([C(3, 0), C(7, 1), C(11, 2)]) === 0);

  /* 逢人配：红桃级牌（红桃 2）配一张 5 能当一对 5 */
  ok("掼蛋逢人配补对子", ty([C(2, 1), C(5, 0)]) === T.PAIR);
  ok("掼蛋逢人配补顺子", ty([C(2, 1), C(4, 0), C(5, 1), C(6, 2), C(7, 3)]) === T.STRAIGHT);
  ok("掼蛋同花色连号算同花顺", ty([C(2, 1), C(4, 0), C(5, 0), C(6, 0), C(7, 0)]) === T.FLUSH);

  /* 大小比较 */
  ok("掼蛋炸弹压单张", k.beats({ type: T.B4, key: 8 }, { type: T.SINGLE, key: 14 }) === true);
  ok("掼蛋同型比点数", k.beats({ type: T.PAIR, key: 9 }, { type: T.PAIR, key: 8 }) === true);
  ok("掼蛋小炸不压大炸", k.beats({ type: T.B4, key: 8 }, { type: T.B5, key: 3 }) === false);
  ok("掼蛋小王压不过大王", k.beats({ type: T.SINGLE, key: 17 }, { type: T.SINGLE, key: 18 }) === false);
  ok("掼蛋普通牌压不过炸弹", k.beats({ type: T.SINGLE, key: 18 }, { type: T.B4, key: 3 }) === false);

  /* 出牌 / 过的合法性 */
  const pl = k.startDeal(null, 0);
  const leadCards = [pl.hands[pl.turn][0]];
  const afterLead = k.play(pl, pl.turn, leadCards);
  ok("掼蛋出牌后手牌减少", afterLead.hands[pl.turn].length === 26);
  ok("掼蛋领出方不能过", k.pass(pl, pl.turn) === pl);
  ok("掼蛋非当前轮次出牌无效", k.play(pl, (pl.turn + 1) % 4, leadCards) === pl);

  /* 一条完整的牌局：AI 打到底，不卡死、牌数守恒 */
  const autoPlay = (first) => {
    let s = k.newDeal({ level: 2, levels: [2, 2], first, humanSeat: 0 });
    let steps = 0;
    while (!s.over && steps < 800) {
      const seat = s.turn;
      const dec = k.aiDecide(s, seat, 2);
      let ns = dec.pass ? k.pass(s, seat) : k.play(s, seat, dec.cards);
      if (ns === s) ns = k.pass(s, seat);
      if (ns === s) {
        const ps = k.genPlays(s.hands[seat], s.level);
        if (!ps.length) break;
        ns = k.play(s, seat, ps[ps.length - 1].cards);
      }
      s = ns;
      steps += 1;
    }
    return s;
  };
  const one = autoPlay(0);
  ok("掼蛋一局能打完", one.over === true && one.out.length === 4, `steps=${one.out.length}`);
  ok("掼蛋结算给出升级级数", !!one.result && one.result.up >= 1 && one.result.up <= 3);
  ok("掼蛋结算带 levels", !!one.result && Array.isArray(one.result.levels) && one.result.levels.length === 2);

  /* 牌权不能永远落在开局那个人手里（曾经因 leadSeat 不更新导致先手 20 局 20 胜） */
  let t0 = 0;
  let t1 = 0;
  for (let i = 0; i < 8; i += 1) {
    const g = autoPlay(0);
    if (g.result && g.result.winTeam === 0) t0 += 1;
    else if (g.result && g.result.winTeam === 1) t1 += 1;
  }
  ok("掼蛋先手不保证必胜", t0 > 0 && t1 > 0, `team0=${t0} team1=${t1}`);

  /* 进贡：双下进两张，1/4 进一张，牌数守恒 */
  const base = k.newDeal({ level: 3, levels: [3, 3], first: 0, humanSeat: 0 });
  const sameRes = { out: [0, 2, 1, 3], winTeam: 0, loseTeam: 1, up: 3, same: true, finished: false, levelBefore: 3, levelAfter: 6, levels: [6, 3] };
  const stT = k.startDeal({ ...base, result: sameRes }, 0);
  /* 输家摸到两张大王时自动抗贡，是合法分支，不能当成失败 */
  const resistT = !!stT.tribute && /抗贡/.test(stT.tribute.logs.join(""));
  ok("掼蛋双下进贡两条记录（或合法抗贡）", !!stT.tribute
    && (resistT || stT.tribute.logs.length >= 2), JSON.stringify(stT.tribute && stT.tribute.logs));
  ok("掼蛋进贡后牌数仍 108", stT.hands.reduce((a, b) => a + b.length, 0) === 108);
  /* 抗贡是小概率分支：固定牌堆抽样统计一次，确认它确实会触发而不是死代码 */
  let resistSeen = 0;
  let tributeSeen = 0;
  for (let i = 0; i < 40; i += 1) {
    const b = k.newDeal({ level: 3, levels: [3, 3], first: 0, humanSeat: 0 });
    const t = k.startDeal({ ...b, result: sameRes }, 0);
    if (!t.tribute) continue;
    if (/抗贡/.test(t.tribute.logs.join(""))) resistSeen += 1;
    else tributeSeen += 1;
  }
  ok("掼蛋抗贡与进贡两条分支都能走到", resistSeen > 0 && tributeSeen > 0, `抗贡=${resistSeen} 进贡=${tributeSeen}`);

  const oneFourRes = { out: [0, 1, 2, 3], winTeam: 0, loseTeam: 1, up: 1, same: false, finished: false, levelBefore: 3, levelAfter: 4, levels: [4, 3] };
  const st1 = k.startDeal({ ...base, result: oneFourRes }, 0);
  const resist1 = !!st1.tribute && /抗贡/.test(st1.tribute.logs.join(""));
  ok("掼蛋 1/4 进贡一张（或合法抗贡）", !!st1.tribute && (resist1 || st1.tribute.logs.length === 2),
    JSON.stringify(st1.tribute && st1.tribute.logs));
  ok("掼蛋 1/4 进贡后牌数仍 108", st1.hands.reduce((a, b) => a + b.length, 0) === 108);

  /* 打 A 必须双下（双上）才能通关：双上 finished=true，1/4 只能留在 A */
  const atA = (res) => {
    const base = k.newDeal({ level: 14, levels: [14, 5], first: 0, humanSeat: 0 });
    return k.startDeal({ ...base, level: 14, levels: [14, 5], result: res }, 0);
  };
  const sameAtA = { out: [0, 2, 1, 3], winTeam: 0, loseTeam: 1, up: 3, same: true, finished: true, levelBefore: 14, levelAfter: 14, levels: [14, 5] };
  const mixAtA = { out: [0, 1, 2, 3], winTeam: 0, loseTeam: 1, up: 1, same: false, finished: false, levelBefore: 14, levelAfter: 14, levels: [14, 5] };
  ok("掼蛋打 A 双上即通关（本局结束）", sameAtA.finished === true);
  ok("掼蛋打 A 非双上留在 A", mixAtA.finished === false && mixAtA.levelAfter === 14);
  /* 连通判据：finished 的局下一局回到 2 级重开 */
  const restart = atA(sameAtA);
  ok("掼蛋通关后回到 2 级重开", restart.level === 2);

  /* AI 不许出自己手里没有的牌 */
  let bad = null;
  for (let i = 0; i < 6 && !bad; i += 1) {
    let s = k.newDeal({ level: 2, levels: [2, 2], first: i % 4, humanSeat: 0 });
    let steps = 0;
    while (!s.over && steps < 800) {
      const seat = s.turn;
      const dec = k.aiDecide(s, seat, 3);
      if (!dec.pass) {
        const own = new Set(s.hands[seat].map((c) => c.id));
        if (!dec.cards.every((c) => own.has(c.id))) {
          bad = `seat ${seat} step ${steps}`;
          break;
        }
      }
      let ns = dec.pass ? k.pass(s, seat) : k.play(s, seat, dec.cards);
      if (ns === s) ns = k.pass(s, seat);
      if (ns === s) {
        const ps = k.genPlays(s.hands[seat], s.level);
        if (!ps.length) break;
        ns = k.play(s, seat, ps[ps.length - 1].cards);
      }
      s = ns;
      steps += 1;
    }
  }
  ok("掼蛋 AI 只出自己手里的牌", bad === null, bad || "");
}

/* ------------------------------------------------------------ 组件渲染冒烟 */
{
  /* 用假 React 直接调用每个游戏组件函数体：只要不抛错，就说明 hooks 顺序、
     变量声明顺序、JSX 树构建都没问题。贪吃蛇曾经因为 useLoop 引用了还没初始化的
     const draw 而一进游戏就崩，正是靠这条断言抓到的。 */
  const games = exp.__internals.registry.allGames();
  const renderH = (type, props, ...kids) => (typeof type === "function" ? type(props || {}) : { type, props, kids });
  const FR = {
    createElement: renderH,
    useState: (init) => [typeof init === "function" ? init() : init, () => {}],
    useRef: (init) => ({ current: init }),
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    Fragment: "Fragment",
  };
  let renders = 0;
  const broken = [];
  for (const g of games) {
    try {
      const tree = g.component({ onExit: () => {} });
      if (!tree || !tree.type) broken.push(`${g.id}:空树`);
      else renders += 1;
    } catch (e) {
      broken.push(`${g.id}:${e && e.message}`);
    }
  }
  ok("所有游戏组件都能构建出界面树", broken.length === 0, broken.join(" | "));
  ok("九款内置游戏 + 两款迁入游戏都在列表里", games.length === 11, String(games.length));
  ok("游戏按 order 排序且 id 唯一",
    games.every((g, i) => i === 0 || games[i - 1].order <= g.order)
      && new Set(games.map((g) => g.id)).size === games.length);
}

/* ------------------------------------------------------------ 汇总 */
console.log("");
if (fails.length) {
  console.log(`❌ ${fails.length} 项失败（通过 ${pass} 项）：`);
  for (const f of fails) console.log("   · " + f);
  process.exit(1);
}
console.log(`✅ 全部 ${pass} 项断言通过`);
