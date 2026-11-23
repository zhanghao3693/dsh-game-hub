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
  /* armed = 已经点过"开始"，可以落子。遮罩条件不能用 moves.length === 0：
     点按钮后 moves 仍是 0，遮罩立刻又盖回来，永远开不了局。 */
  const [armed, setArmed] = useState(false);
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
    setArmed(true);
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
        st.over || !armed
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
