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
