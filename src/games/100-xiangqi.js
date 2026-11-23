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
  /* armed = 已选边开局。遮罩条件不能用 history.length === 0：
     点按钮后 history 仍是 0，遮罩立刻又盖回来。 */
  const [armed, setArmed] = useState(false);
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
    setArmed(true);
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
        st.over || !armed
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
