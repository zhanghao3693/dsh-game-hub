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

/* 横向速度下限（占合速度的比例）。
 * 病因：板子反弹角度按命中位置映射到 ±60°，玩家用板心接球是最自然的动作，
 * 此时 hit≈0 → sin(0)=0 → 球变成纯垂直上下弹，永远碰不到两侧砖块。
 * 实测（auto 跟球打法）到第 2049 帧后剩 44 块砖再也打不动，游戏实质卡死。
 * 所以任何反弹之后都强制保留一点横向分量。 */
const BRK_MIN_VX_RATIO = 0.26;

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
        brkKeepHorizontal(b);
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
      /* 撞砖也可能把球压成近乎垂直（连续两侧砖被打掉之后），同样兜底 */
      brkKeepHorizontal(b);
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

/**
 * 保证球还有横向速度。
 * 病根：板心接球时命中位置≈0 → 反弹角 0° → 球纯垂直弹，两侧砖永远打不到，
 * 实测剩 44 块时彻底卡死。撞砖后的单轴反射也可能把横向分量压没，所以两处都兜。
 * 方向保留撞前的水平朝向（为 0 时随机给一边），速度大小不变。
 */
function brkKeepHorizontal(b) {
  const sp = Math.hypot(b.vx, b.vy);
  if (!sp) return;
  const minVx = sp * BRK_MIN_VX_RATIO;
  if (Math.abs(b.vx) >= minVx) return;
  const sign = b.vx > 0 ? 1 : b.vx < 0 ? -1 : Math.random() < 0.5 ? -1 : 1;
  b.vx = minVx * sign;
  /* 横向补进来的量从纵向扣掉，总速度守恒，不会越弹越快 */
  const vyMag = Math.sqrt(Math.max(0, sp * sp - b.vx * b.vx));
  b.vy = (b.vy < 0 ? -1 : 1) * vyMag;
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
  MIN_VX_RATIO: BRK_MIN_VX_RATIO,
  newState: brkNewState,
  step: brkStep,
  launch: brkLaunch,
  brickRect: brkBrickRect,
  keepHorizontal: brkKeepHorizontal,
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
