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
