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
