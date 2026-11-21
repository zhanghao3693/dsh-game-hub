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
