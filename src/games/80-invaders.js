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
  /* 敌人开火频率。原来是 0.55 + (wave-1)*0.08，实测（25 局自动机器人）
     中位只能活 58 秒、3 命常常撑不到第二波 —— 容错太低。降到 0.20 后
     中位 55 秒但最长能到 157 秒、能摸到第 4 波，落差变小、更有"越玩越顺"的手感。 */
  const fireChance = 0.2 + (out.wave - 1) * 0.05;
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
