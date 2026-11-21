/* ============================================================================
 * 掼蛋 —— 完整规则 + 3 个 AI 同场。
 *
 * 牌：两副共 108 张（含两小王两大王）。
 * 级牌：当前打哪一级，那一级的所有花色都升到 A 之上、王之下。
 * 逢人配：红桃级牌是万能牌，可当除大小王以外的任何牌。
 *
 * 牌型强弱（同一牌型比点数，炸弹通吃普通牌型）：
 *   单张 < 对子 < 三张 < 三带二 < 顺子(5) < 连对(3对) < 钢板(2个三张)
 *   炸弹：4张 < 5张 < 同花顺 < 6张 < 7张 < 8张 < 四大天王
 *
 * 升级：双上 +3、1/3 +2、1/4 +1；打过 A 才算通关。
 * ========================================================================== */

const GD_SUIT = ["♠", "♥", "♦", "♣"];
const GD_RN = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};

/** 牌型 id。>=10 都是炸弹类，可以压普通牌型 */
const GD_T = {
  SINGLE: 1, PAIR: 2, TRIPLE: 3, FULL: 4, STRAIGHT: 5, CONPAIR: 6, PLATE: 7,
  B4: 10, B5: 11, FLUSH: 12, B6: 13, B7: 14, B8: 15, KINGS: 20,
};

const GD_TNAME = {
  1: "单张", 2: "对子", 3: "三张", 4: "三带二", 5: "顺子", 6: "连对", 7: "钢板",
  10: "四炸", 11: "五炸", 12: "同花顺", 13: "六炸", 14: "七炸", 15: "八炸", 20: "四大天王",
};

const GD_SEATS = 4;
const GD_TEAM = (seat) => seat % 2; /* 0 和 2 一队，1 和 3 一队 */

/** 两副牌 108 张。r: 2..14 正常牌点，15 小王，16 大王；s: 0..3 花色，-1 王 */
function gdDeck() {
  const out = [];
  let id = 0;
  for (let d = 0; d < 2; d += 1) {
    for (let s = 0; s < 4; s += 1) {
      for (let r = 2; r <= 14; r += 1) out.push({ r, s, id: id++ });
    }
    out.push({ r: 15, s: -1, id: id++ });
    out.push({ r: 16, s: -1, id: id++ });
  }
  return out;
}

function gdIsJoker(c) {
  return c.r >= 15;
}

/** 逢人配：红桃级牌 */
function gdIsWild(c, level) {
  return c.s === 1 && c.r === level;
}

/** 比较用点数：大王18 > 小王17 > 级牌15 > A14 > K13 …… > 2 */
function gdVal(c, level) {
  if (c.r === 16) return 18;
  if (c.r === 15) return 17;
  if (c.r === level) return 15;
  return c.r;
}

function gdRankVal(r, level) {
  if (r === 16) return 18;
  if (r === 15) return 17;
  if (r === level) return 15;
  return r;
}

/** 顺子类窗口：A 可当 1 也可当 14 */
function gdWindows(len) {
  const out = [];
  for (let s = 1; s <= 14 - len + 1; s += 1) {
    const w = [];
    for (let i = 0; i < len; i += 1) {
      const p = s + i;
      w.push(p === 1 ? 14 : p);
    }
    out.push({ ranks: w, top: s === 1 ? len : s + len - 1 });
  }
  return out;
}

const GD_WIN5 = gdWindows(5);
const GD_WIN3 = gdWindows(3);
const GD_WIN2 = gdWindows(2);

/* ---------------------------------------------------------------- 牌型识别 */

/**
 * 识别一组牌是什么牌型。cards 可以含逢人配（自动当任意牌用）。
 * 返回 {type, key} 或 null。key 用于同型比较。
 */
function gdAnalyze(cards, level) {
  const n = cards.length;
  if (!n) return null;
  const wilds = [];
  const norm = [];
  for (const c of cards) {
    if (gdIsWild(c, level)) wilds.push(c);
    else norm.push(c);
  }
  const W = wilds.length;
  const cnt = new Map();
  for (const c of norm) cnt.set(c.r, (cnt.get(c.r) || 0) + 1);
  const ranks = [...cnt.keys()];
  const distinct = ranks.length;
  const lv = (r) => gdRankVal(r, level);

  /* 四大天王 */
  if (n === 4 && W === 0 && distinct === 2 && ranks[0] === 15 && ranks[1] === 16
    && cnt.get(15) === 2 && cnt.get(16) === 2) {
    return { type: GD_T.KINGS, key: 0 };
  }

  /* 炸弹：除逢人配外同点 */
  if (distinct === 1 && n >= 4 && n <= 8 && W <= n) {
    const r = ranks[0];
    if (r < 15) {
      const t = n === 4 ? GD_T.B4 : n === 5 ? GD_T.B5 : n === 6 ? GD_T.B6
        : n === 7 ? GD_T.B7 : GD_T.B8;
      return { type: t, key: lv(r) };
    }
    return null;
  }

  if (n === 1) return { type: GD_T.SINGLE, key: lv(cards[0].r) };

  if (n === 2) {
    if (distinct === 0) return { type: GD_T.PAIR, key: 15 }; /* 两张逢人配 = 一对级牌 */
    if (distinct === 1) return { type: GD_T.PAIR, key: lv(ranks[0]) };
    return null;
  }

  if (n === 3) {
    if (distinct === 0) return { type: GD_T.TRIPLE, key: 15 };
    if (distinct === 1 && W <= 2) return { type: GD_T.TRIPLE, key: lv(ranks[0]) };
    return null;
  }

  if (n === 5) {
    /* 三带二 */
    let best = null;
    for (const a of ranks) {
      for (const b of ranks) {
        if (a === b) continue;
        const ca = cnt.get(a);
        const cb = cnt.get(b);
        if (ca + cb + W !== 5) continue;
        if (Math.max(0, 3 - ca) + Math.max(0, 2 - cb) !== W) continue;
        const k = lv(a);
        if (!best || k > best.key) best = { type: GD_T.FULL, key: k };
      }
    }
    if (best) return best;

    /* 同花顺 */
    if (distinct >= 3 && norm.every((c) => !gdIsJoker(c))) {
      const suits = new Set(norm.map((c) => c.s));
      if (suits.size === 1) {
        for (const win of GD_WIN5) {
          const set = new Set(win.ranks);
          if (!ranks.every((r) => set.has(r))) continue;
          if (distinct + W !== 5) continue;
          return { type: GD_T.FLUSH, key: win.top };
        }
      }
    }

    /* 顺子 */
    if (distinct >= 3 && norm.every((c) => !gdIsJoker(c))) {
      for (const win of GD_WIN5) {
        const set = new Set(win.ranks);
        if (!ranks.every((r) => set.has(r))) continue;
        if (distinct + W !== 5) continue;
        return { type: GD_T.STRAIGHT, key: win.top };
      }
    }
    return null;
  }

  if (n === 6) {
    /* 钢板：两个连续点数各三张 */
    for (const win of GD_WIN2) {
      const [a, b] = win.ranks;
      if (ranks.some((r) => r !== a && r !== b)) continue;
      const ca = cnt.get(a) || 0;
      const cb = cnt.get(b) || 0;
      if (Math.max(0, 3 - ca) + Math.max(0, 3 - cb) !== W) continue;
      if (ca + cb + W !== 6) continue;
      return { type: GD_T.PLATE, key: win.top };
    }
    /* 连对：三个连续点数各两张 */
    for (const win of GD_WIN3) {
      const set = new Set(win.ranks);
      if (ranks.some((r) => !set.has(r))) continue;
      /* 每个点数最多两张，缺的由逢人配补（旧写法用 distinct + W 比 6，
         distinct 是「不同点数个数」(3)，永远对不上 6，连对因此从来识别不出来）。 */
      let ok = true;
      for (const r of win.ranks) {
        const c = cnt.get(r) || 0;
        if (c > 2) { ok = false; break; }
      }
      if (!ok) continue;
      let need = 0;
      for (const r of win.ranks) need += Math.max(0, 2 - (cnt.get(r) || 0));
      if (need !== W) continue;
      return { type: GD_T.CONPAIR, key: win.top };
    }
    return null;
  }

  return null;
}

/** a 能不能压 b（b 为空表示自由出牌） */
function gdBeats(a, b) {
  if (!a) return false;
  if (!b) return true;
  const ab = a.type >= 10;
  const bb = b.type >= 10;
  if (ab && bb) {
    if (a.type !== b.type) return a.type > b.type;
    return a.key > b.key;
  }
  if (ab) return true;
  if (bb) return false;
  return a.type === b.type && a.key > b.key;
}

/* ---------------------------------------------------------------- 出牌枚举 */

function gdSplit(hand, level) {
  const wilds = [];
  const byRank = new Map();
  for (const c of hand) {
    if (gdIsWild(c, level)) wilds.push(c);
    else {
      if (!byRank.has(c.r)) byRank.set(c.r, []);
      byRank.get(c.r).push(c);
    }
  }
  return { wilds, byRank };
}

/**
 * 枚举手牌所有可能的出牌。为了不爆量，只生成"每种牌型一档最省的形态"。
 * 返回 [{cards, type, key, size}]
 */
function gdGenPlays(hand, level) {
  const out = [];
  const seen = new Set();
  const { wilds, byRank } = gdSplit(hand, level);
  const W = wilds.length;
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  const add = (cards) => {
    if (!cards || cards.length !== cards.length) return;
    const ids = cards.map((c) => c.id).sort((a, b) => a - b).join(",");
    if (seen.has(ids)) return;
    const a = gdAnalyze(cards, level);
    if (!a) return;
    seen.add(ids);
    out.push({ cards, type: a.type, key: a.key, size: cards.length });
  };

  /* 单张 */
  for (const c of hand) add([c]);

  /* 对子 */
  for (const r of ranks) {
    const g = byRank.get(r);
    if (g.length >= 2) add([g[0], g[1]]);
    if (g.length >= 1 && W >= 1) add([g[0], wilds[0]]);
  }
  if (W >= 2) add([wilds[0], wilds[1]]);

  /* 三张 */
  for (const r of ranks) {
    const g = byRank.get(r);
    if (g.length >= 3) add([g[0], g[1], g[2]]);
    if (g.length >= 2 && W >= 1) add([g[0], g[1], wilds[0]]);
    if (g.length >= 1 && W >= 2) add([g[0], wilds[0], wilds[1]]);
  }

  /* 炸弹 4~8 张 */
  for (const r of ranks) {
    if (r >= 15) continue;
    const g = byRank.get(r);
    for (let size = 4; size <= 8; size += 1) {
      const needWild = Math.max(0, size - g.length);
      if (needWild > W) break;
      if (size > g.length + W) break;
      const useNat = Math.min(g.length, size);
      const cards = g.slice(0, useNat).concat(wilds.slice(0, size - useNat));
      if (cards.length === size) add(cards);
    }
  }

  /* 四大天王 */
  const big = hand.filter((c) => c.r === 16);
  const small = hand.filter((c) => c.r === 15);
  if (big.length === 2 && small.length === 2) add([big[0], big[1], small[0], small[1]]);

  /* 三带二 */
  for (const a of ranks) {
    const ga = byRank.get(a);
    for (const b of ranks) {
      if (a === b) continue;
      const gb = byRank.get(b);
      for (let useA = 3; useA >= 1; useA -= 1) {
        const needA = Math.max(0, useA - ga.length);
        if (useA > ga.length + W) continue;
        const cardsA = ga.slice(0, Math.min(ga.length, useA)).concat(wilds.slice(0, needA));
        if (cardsA.length !== useA) continue;
        const restW = W - needA;
        for (let useB = 2; useB >= 1; useB -= 1) {
          const needB = Math.max(0, useB - gb.length);
          if (needB > restW) continue;
          const cardsB = gb.slice(0, Math.min(gb.length, useB)).concat(wilds.slice(needA, needA + needB));
          if (cardsB.length !== useB) continue;
          add(cardsA.concat(cardsB));
        }
      }
    }
  }

  /* 顺子 / 同花顺 */
  for (const win of GD_WIN5) {
    /* 顺子 */
    {
      const picked = [];
      const usedW = [];
      let ok = true;
      for (const r of win.ranks) {
        const g = byRank.get(r) || [];
        if (g.length) picked.push(g[0]);
        else if (usedW.length < W) usedW.push(wilds[usedW.length]);
        else { ok = false; break; }
      }
      if (ok && picked.length + usedW.length === 5) add(picked.concat(usedW));
    }
    /* 同花顺：逐花色试 */
    for (let s = 0; s < 4; s += 1) {
      const picked = [];
      let usedW = 0;
      let ok = true;
      for (const r of win.ranks) {
        const g = (byRank.get(r) || []).filter((c) => c.s === s);
        if (g.length) picked.push(g[0]);
        else if (usedW < W) usedW += 1;
        else { ok = false; break; }
      }
      if (ok && picked.length + usedW === 5) add(picked.concat(wilds.slice(0, usedW)));
    }
  }

  /* 连对 */
  for (const win of GD_WIN3) {
    const picked = [];
    let usedW = 0;
    let ok = true;
    for (const r of win.ranks) {
      const g = byRank.get(r) || [];
      const take = Math.min(2, g.length);
      picked.push(...g.slice(0, take));
      const need = 2 - take;
      if (usedW + need > W) { ok = false; break; }
      usedW += need;
    }
    if (ok && picked.length + usedW === 6) add(picked.concat(wilds.slice(0, usedW)));
  }

  /* 钢板 */
  for (const win of GD_WIN2) {
    const picked = [];
    let usedW = 0;
    let ok = true;
    for (const r of win.ranks) {
      const g = byRank.get(r) || [];
      const take = Math.min(3, g.length);
      picked.push(...g.slice(0, take));
      const need = 3 - take;
      if (usedW + need > W) { ok = false; break; }
      usedW += need;
    }
    if (ok && picked.length + usedW === 6) add(picked.concat(wilds.slice(0, usedW)));
  }

  return out;
}

/** 手牌里能压过 last 的所有出牌 */
function gdResponses(hand, level, last) {
  const all = gdGenPlays(hand, level);
  return all.filter((p) => gdBeats(p, last));
}

/* ---------------------------------------------------------------- 对局状态 */

const GD_SEAT_NAME = ["你", "下家", "对家", "上家"];

function gdShuffle(deck) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = d[i];
    d[i] = d[j];
    d[j] = t;
  }
  return d;
}

function gdSortHand(hand, level) {
  return hand.slice().sort((a, b) => {
    if (a.r !== b.r) return gdVal(b, level) - gdVal(a, level);
    return a.s - b.s;
  });
}

/**
 * 开一局。
 * @param {[number,number]} levels 两队当前级别（0 队 = 座位 0/2，1 队 = 座位 1/3）
 * @param {number} level 本局级牌
 * @param {number} first 首出座位
 * @param {number} humanSeat 玩家座位
 */
function gdNewDeal(opts) {
  const o = opts || {};
  const level = o.level || 2;
  const deck = gdShuffle(gdDeck());
  const hands = [[], [], [], []];
  for (let i = 0; i < deck.length; i += 1) hands[i % 4].push(deck[i]);
  for (let s = 0; s < 4; s += 1) hands[s] = gdSortHand(hands[s], level);
  return {
    level,
    levels: o.levels || [level, level],
    hands,
    turn: typeof o.first === "number" ? o.first : 0,
    leadSeat: typeof o.first === "number" ? o.first : 0,
    lastPlay: null,
    pass: 0,
    out: [],
    phase: "play",
    log: [],
    tribute: null,
    humanSeat: typeof o.humanSeat === "number" ? o.humanSeat : 0,
    over: false,
    result: null,
  };
}

function gdActive(st) {
  const out = [];
  for (let s = 0; s < 4; s += 1) if (!st.out.includes(s) && st.hands[s].length > 0) out.push(s);
  return out;
}

function gdNextActive(st, seat) {
  for (let i = 1; i <= 4; i += 1) {
    const s = (seat + i) % 4;
    if (!st.out.includes(s) && st.hands[s].length > 0) return s;
  }
  return seat;
}

function gdPushLog(st, text) {
  st.log = st.log.concat([text]);
  if (st.log.length > 60) st.log = st.log.slice(-60);
}

/** 出牌。返回新 state（纯函数式浅拷贝） */
function gdPlay(st, seat, cards) {
  if (st.phase !== "play" || st.over) return st;
  if (st.turn !== seat) return st;
  const ids = new Set(cards.map((c) => c.id));
  const mine = st.hands[seat];
  if (![...ids].every((id) => mine.some((c) => c.id === id))) return st;
  const a = gdAnalyze(cards, st.level);
  if (!a) return st;
  if (st.lastPlay && st.lastPlay.seat !== seat) {
    if (!gdBeats({ type: a.type, key: a.key }, st.lastPlay)) return st;
  }
  const next = {
    ...st,
    hands: st.hands.map((h, i) => (i === seat ? h.filter((c) => !ids.has(c.id)) : h)),
    lastPlay: { seat, cards: cards.slice(), type: a.type, key: a.key, size: cards.length },
    pass: 0,
    /* 谁最后出牌谁就是本轮领出者：一轮三家全过之后把牌权交回给他。
       旧写法只在「领出人自己出完」时才改 leadSeat，导致 leadSeat 永远是
       开局那个人，一轮结束牌权总是还给他 —— 先手 20 局 20 胜。 */
    leadSeat: seat,
  };
  gdPushLog(next, `${GD_SEAT_NAME[seat]} 出 ${gdCardText(cards, next.level)}（${GD_TNAME[a.type]}）`);

  if (next.hands[seat].length === 0) {
    next.out = next.out.concat([seat]);
    gdPushLog(next, `${GD_SEAT_NAME[seat]} 出完了，第 ${next.out.length} 名`);
    if (next.out.length >= 3) {
      for (let s = 0; s < 4; s += 1) if (!next.out.includes(s)) next.out = next.out.concat([s]);
      return gdSettle(next);
    }
    /* 出完的人已经离场，牌权交给他下一位还在打的人 */
    if (next.out.includes(next.leadSeat)) {
      next.leadSeat = gdNextActive(next, seat);
      next.turn = next.leadSeat;
      return next;
    }
  }
  next.turn = gdNextActive(next, seat);
  return next;
}

function gdPass(st, seat) {
  if (st.phase !== "play" || st.over) return st;
  if (st.turn !== seat) return st;
  if (!st.lastPlay) return st; /* 领出不能过 */
  const next = { ...st, pass: st.pass + 1 };
  gdPushLog(next, `${GD_SEAT_NAME[seat]} 过`);
  const others = gdActive(next).length - 1;
  if (next.pass >= others) {
    /* 一轮结束，出牌者重新领出 */
    next.lastPlay = null;
    next.pass = 0;
    const lead = next.leadSeat;
    next.turn = next.out.includes(lead) ? gdNextActive(next, lead) : lead;
    if (next.out.includes(lead)) next.leadSeat = next.turn;
  } else {
    next.turn = gdNextActive(next, seat);
  }
  return next;
}

/* ---------------------------------------------------------------- 结算 + 进贡 */

function gdTeamOf(seat) {
  return seat % 2;
}

function gdSettle(st) {
  const out = st.out.slice();
  const first = out[0];
  const second = out[1];
  const last = out[3];
  const winTeam = gdTeamOf(first);
  const loseTeam = 1 - winTeam;
  const same = gdTeamOf(second) === winTeam;

  /* 1&4 时 second 是输家 —— 双上才是同队连坐 */
  const up = same ? 3 : gdTeamOf(out[2]) === winTeam ? 2 : 1;
  const levels = st.levels.slice();
  const before = levels[winTeam];
  let after = before + up;
  let finished = false;
  let stuckAtA = false;
  if (before >= 14) {
    /* 真规则：打 A 必须双下（双上）才能过 A 通关；
       赢成 1、3 或 1、4 都只能留在 A 继续打。 */
    if (same) {
      finished = true;
      after = 14;
    } else {
      after = 14;
      stuckAtA = true;
    }
  } else if (after > 14) {
    after = 14; /* 升级封顶在 A */
  }
  levels[winTeam] = after;

  const next = {
    ...st,
    over: true,
    phase: "done",
    levels,
    result: {
      out,
      winTeam,
      loseTeam,
      up,
      same,
      finished,
      stuckAtA,
      levelBefore: before,
      levelAfter: after,
      levels: levels.slice(),
    },
  };
  gdPushLog(
    next,
    `${winTeam === gdTeamOf(st.humanSeat) ? "你方" : "对方"}${same ? "双上" : "获胜"}，`
      + `${stuckAtA ? "打 A 未双下，留在 A" : `升 ${up} 级`}，${before} → ${after}`
      + `${finished ? "，过 A 通关！" : ""}`,
  );
  return next;
}

/** 下一局要打的级牌：赢方升级后的级别 */
function gdNextLevel(st) {
  if (!st.result) return st.level;
  const lv = (st.result.levels || st.levels || [])[st.result.winTeam];
  return typeof lv === "number" ? lv : st.level;
}

/**
 * 计算进贡需求。返回 null 表示抗贡或无需进贡。
 * 主流规则：双下 → 两个输家各进一张最大牌给两个赢家；1/3 或 1/4 → 末游进给头游。
 */
function gdTributeNeed(st, handsMaybe) {
  if (!st.result && !st.out) return null;
  const hands = handsMaybe || st.hands;
  const out = st.result ? st.result.out : st.out;
  if (st.result.same) {
    const winners = [out[0], out[1]];
    const losers = [out[2], out[3]];
    /* 抗贡：两个输家合计摸到两张大王 */
    let kings = 0;
    for (const s of losers) kings += hands[s].filter((c) => c.r === 16).length;
    if (kings >= 2) return { resist: true, winners, losers };
    return { resist: false, winners, losers, count: 2 };
  }
  const winner = out[0];
  const loser = out[3];
  const kings = hands[loser].filter((c) => c.r === 16).length;
  if (kings >= 2) return { resist: true, winners: [winner], losers: [loser] };
  return { resist: false, winners: [winner], losers: [loser], count: 1 };
}

/** 进贡牌：手里除红桃级牌外最大的一张 */
function gdTributeCard(hand, level) {
  let best = null;
  for (const c of hand) {
    if (gdIsWild(c, level)) continue;
    if (!best || gdVal(c, level) > gdVal(best, level)) best = c;
  }
  return best || hand[0];
}

/** 还贡牌：不大于 10 的最小牌（优先还最小） */
function gdReturnCard(hand, level) {
  const cand = hand.filter((c) => !gdIsWild(c, level) && c.r <= 10);
  const pool = cand.length ? cand : hand.filter((c) => !gdIsWild(c, level));
  const use = pool.length ? pool : hand;
  let best = use[0];
  for (const c of use) if (gdVal(c, level) < gdVal(best, level)) best = c;
  return best;
}

/**
 * 执行进贡（自动）：输家交出最大牌，赢家收下。
 * 还贡的牌由 gdReturnCard 自动选，人机一致的规则口径。
 * 返回 {hands: [[...]], log, first}
 */
function gdApplyTribute(hands, level, need) {
  const h = hands.map((x) => x.slice());
  const logs = [];
  if (!need || need.resist) {
    return { hands: h, logs: need ? ["抗贡，不进贡。"] : [], first: -1 };
  }
  const gives = [];
  for (const loser of need.losers) {
    const card = gdTributeCard(h[loser], level);
    if (!card) continue;
    h[loser] = h[loser].filter((c) => c.id !== card.id);
    gives.push({ loser, card });
  }
  /* 贡牌大的给头游 */
  gives.sort((a, b) => gdVal(b.card, level) - gdVal(a.card, level));
  const receivers = need.winners.slice();
  const pairs = [];
  for (let i = 0; i < gives.length; i += 1) {
    const giver = gives[i];
    const recv = receivers[Math.min(i, receivers.length - 1)];
    h[recv] = h[recv].concat([giver.card]);
    logs.push(`${GD_SEAT_NAME[giver.loser]} 进贡 ${gdCardText([giver.card], level)} 给 ${GD_SEAT_NAME[recv]}`);
    pairs.push({ giver: giver.loser, recv });
  }
  /* 还贡 */
  for (const p of pairs) {
    const back = gdReturnCard(h[p.recv], level);
    if (!back) continue;
    h[p.recv] = h[p.recv].filter((c) => c.id !== back.id);
    h[p.giver] = h[p.giver].concat([back]);
    logs.push(`${GD_SEAT_NAME[p.recv]} 还贡 ${gdCardText([back], level)} 给 ${GD_SEAT_NAME[p.giver]}`);
  }
  for (let s = 0; s < 4; s += 1) h[s] = gdSortHand(h[s], level);
  return { hands: h, logs, first: need.winners[0] };
}

/* ---------------------------------------------------------------- AI */

function gdHandCount(st, seat) {
  return st.hands[seat].length;
}

/** 对手里最少的牌数（判断要不要放炸弹） */
function gdMinOpponent(st, seat, level) {
  let min = 99;
  for (let s = 0; s < 4; s += 1) {
    if (s === seat) continue;
    if (gdTeamOf(s) === gdTeamOf(seat)) continue;
    if (st.out.includes(s)) continue;
    min = Math.min(min, st.hands[s].length);
  }
  return min;
}

const GD_AI_NAMES = ["稳", "狠", "算"];

/**
 * AI 决策。返回 {cards} 或 {pass:true}
 * level: 1 简单 / 2 普通 / 3 困难
 */
function gdAiDecide(st, seat, level) {
  const lv = level || 2;
  const hand = st.hands[seat];
  if (!hand.length) return { pass: true };
  const lead = !st.lastPlay || st.lastPlay.seat === seat;

  if (lead) {
    const plays = gdGenPlays(hand, st.level);
    if (!plays.length) return { pass: true };
    const oppMin = gdMinOpponent(st, seat, st.level);
    /* 能一把走完就一把走完 */
    const finisher = plays.filter((p) => p.cards.length === hand.length);
    if (finisher.length) {
      finisher.sort((a, b) => a.type - b.type);
      return { cards: finisher[0].cards };
    }
    /* 领出优先甩长牌型、先小后大；炸弹留到收尾 */
    const normal = plays.filter((p) => p.type < 10);
    const pool = normal.length ? normal : plays;
    pool.sort((a, b) => {
      if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
      return a.key - b.key;
    });
    if (lv === 1) return { cards: pool[Math.floor(Math.random() * pool.length)].cards };
    /* 普通/困难：对手快出完时改用能压住对方的最强牌型 */
    if (oppMin <= 2 && normal.length) {
      const bombs = plays.filter((p) => p.type >= 10);
      if (bombs.length && lv >= 3) {
        bombs.sort((a, b) => a.type - b.type || a.key - b.key);
        return { cards: bombs[0].cards };
      }
    }
    return { cards: pool[0].cards };
  }

  const last = st.lastPlay;
  const sameTeam = gdTeamOf(last.seat) === gdTeamOf(seat);
  const resps = gdResponses(hand, st.level, last);
  if (!resps.length) return { pass: true };

  /* 能出完就出完 */
  const finisher = resps.filter((p) => p.cards.length === hand.length);
  if (finisher.length) return { cards: finisher[0].cards };

  /* 队友在领出，一般让过，除非队友的牌很小而自己有大牌可以抢回主动 */
  if (sameTeam) {
    if (lv >= 3 && last.size <= 2 && resps.some((p) => p.type < 10 && p.key > last.key + 3)) {
      const cheap = resps.filter((p) => p.type < 10).sort((a, b) => a.key - b.key);
      if (cheap.length) return { cards: cheap[0].cards };
    }
    return { pass: true };
  }

  const normal = resps.filter((p) => p.type < 10).sort((a, b) => a.key - b.key || a.cards.length - b.cards.length);
  if (normal.length) {
    /* 简单档随便压一张 */
    if (lv === 1) return { cards: normal[Math.floor(Math.random() * Math.min(3, normal.length))].cards };
    return { cards: normal[0].cards };
  }

  /* 只剩炸弹可用 */
  const bombs = resps.sort((a, b) => a.type - b.type || a.key - b.key);
  const oppMin = gdMinOpponent(st, seat, st.level);
  const myCount = hand.length;
  const worth = oppMin <= 4 || myCount <= 8 || last.size >= 5 || lv >= 3;
  if (!worth) return { pass: true };
  return { cards: bombs[0].cards };
}

/* ---------------------------------------------------------------- 文本 */

function gdCardText(cards, level) {
  return cards
    .slice()
    .sort((a, b) => gdVal(b, level) - gdVal(a, level))
    .map((c) => {
      if (c.r === 16) return "大王";
      if (c.r === 15) return "小王";
      return GD_SUIT[c.s] + GD_RN[c.r];
    })
    .join(" ");
}

function gdCardColor(c, dark) {
  if (c.r === 16) return dark ? "#f0b0b0" : "#c0392b";
  if (c.r === 15) return dark ? "#d8d8e0" : "#3a3a44";
  if (c.s === 1 || c.s === 2) return dark ? "#f08878" : "#c0392b";
  return dark ? "#dfe3ee" : "#22262e";
}

/* ---------------------------------------------------------------- 对局推进 */

/**
 * 开下一局：接上一局的升级与进贡。
 * prevSt 为上一局已结算的状态；没有就是首局。
 */
function gdStartDeal(prevSt, humanSeat, keepLevels) {
  const hs = typeof humanSeat === "number" ? humanSeat : 0;
  let levels = [2, 2];
  let level = 2;
  let first = 0;
  let prevResult = null;

  if (prevSt && prevSt.result) {
    prevResult = prevSt.result;
    if (prevResult.finished) {
      levels = [2, 2];
      level = 2;
      first = 0;
    } else {
      levels = (prevResult.levels || prevSt.levels || [2, 2]).slice();
      level = gdNextLevel(prevSt);
      first = prevResult.out[0];
    }
  } else if (keepLevels) {
    levels = keepLevels.slice();
    level = levels[0];
  }

  /* 先发牌，再判进贡：抗贡要看的是「这一局新摸到的手牌里有没有两张大王」，
     拿上一局已经打空的手牌去判永远不会抗贡。 */
  let st = gdNewDeal({ level, levels, first, humanSeat: hs });
  if (!prevResult || prevResult.finished) return st;

  const need = gdTributeNeed({ result: prevResult }, st.hands);
  if (!need) return st;

  if (need.resist) {
    const logs = ["抗贡，不进贡。"];
    return { ...st, tribute: { need, logs }, log: logs.slice() };
  }
  const r = gdApplyTribute(st.hands, level, need);
  return {
    ...st,
    hands: r.hands,
    tribute: { need, logs: r.logs },
    log: r.logs.slice(),
    turn: r.first,
    leadSeat: r.first,
  };
}

/** 某个座位最后一句日志 */
function gdSeatTip(st, seat) {
  const name = GD_SEAT_NAME[seat];
  for (let i = st.log.length - 1; i >= 0; i -= 1) {
    const line = st.log[i];
    if (line.slice(0, name.length + 1) === name + " ") return line.slice(name.length + 1);
  }
  return "";
}

/* ---------------------------------------------------------------- 界面 */

const GD_CSS = `
.gd-wrap{width:100%;height:100%;display:flex;flex-direction:column;min-height:0;gap:5px;font-size:12px}
.gd-opps{display:flex;gap:8px;flex:none}
.gd-opp{display:flex;flex-direction:column;align-items:center;gap:3px;flex:1 1 0;min-width:0}
.gd-opp-name{font-size:10.5px;letter-spacing:.14em;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gd-opp-name.on{color:var(--gc-accent);font-weight:700}
.gd-cnt{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));font-variant-numeric:tabular-nums}
.gd-tip{font-size:10.5px;min-height:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gd-mid{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:7px;overflow:hidden}
.gd-lv{display:inline-flex;align-items:center;gap:8px;padding:3px 12px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));font-size:11px}
.gd-lv b{font-weight:700;font-variant-numeric:tabular-nums}
.gd-lv .me{color:var(--gc-accent)}
.gd-lv .foe{color:var(--gc-warn,#e8b64a)}
.gd-last{display:flex;align-items:center;gap:8px;min-height:46px}
.gd-lastlbl{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gd-msg{font-size:11.5px;min-height:15px;color:var(--gc-warn,#e8b64a)}
.gd-hand{display:flex;justify-content:center;padding:12px 2px 0;flex:none;min-height:62px}
.gd-card{position:relative;width:34px;height:48px;border-radius:5px;flex:none;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
  background:linear-gradient(160deg,#fefefe,#e4e7ef);border:1px solid rgba(0,0,0,.28);
  font-weight:700;line-height:1;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,.32);
  transition:transform .1s ease,box-shadow .1s ease}
.gd-card+.gd-card{margin-left:-9px}
.gd-card:hover{transform:translateY(-5px)}
.gd-card.sel{transform:translateY(-14px);border-color:var(--gc-accent);
  box-shadow:0 5px 14px rgba(124,140,255,.55)}
.gd-card.wild{border-color:#d9a520;box-shadow:0 0 0 2px rgba(232,182,74,.75)}
.gd-card.wild.sel{box-shadow:0 5px 14px rgba(124,140,255,.55),0 0 0 2px rgba(232,182,74,.9)}
.gd-card .r{font-size:13px}
.gd-card .s{font-size:10px;margin-top:-1px}
.gd-card .big{font-size:9.5px;letter-spacing:-.04em}
.gd-card.mini{width:26px;height:37px;cursor:default;opacity:.92}
.gd-card.mini .r{font-size:10.5px}
.gd-card.mini .s{font-size:8px}
.gd-card.mini+.gd-card.mini{margin-left:-7px}
.gd-back{width:18px;height:26px;border-radius:3px;flex:none;
  background:linear-gradient(150deg,#3d4d92,#1e2650);border:1px solid rgba(255,255,255,.16)}
.gd-backs{display:flex}
.gd-backs .gd-back+.gd-back{margin-left:-11px}
.gd-act{display:flex;gap:8px;justify-content:center;flex:none;padding:2px 0}
.gd-tribute{font-size:10.5px;line-height:1.5;max-width:420px;text-align:center;
  color:var(--dsw-alias-label-tertiary,#8b8f98)}
`;

function gdCardEl(c, level, opts) {
  const o = opts || {};
  const txt = c.r === 16 ? "大王" : c.r === 15 ? "小王" : GD_RN[c.r];
  const small = c.r >= 15;
  return h(
    "div",
    {
      key: o.key === undefined ? c.id : o.key,
      className: `gd-card${o.sel ? " sel" : ""}${gdIsWild(c, level) ? " wild" : ""}${o.mini ? " mini" : ""}`,
      style: { color: gdCardColor(c, false) },
      onClick: o.onClick || undefined,
      title: gdIsWild(c, level) ? "红桃级牌（逢人配）" : undefined,
    },
    small
      ? h("span", { className: "big" }, txt)
      : [
          h("span", { className: "r", key: "r" }, txt),
          h("span", { className: "s", key: "s" }, GD_SUIT[c.s]),
        ],
  );
}

function GuandanGame({ onExit }) {
  const HUMAN = 0;
  const [diff, setDiff] = useState(2);
  const [st, setSt] = useState(() => gdStartDeal(null, HUMAN));
  const [sel, setSel] = useState([]);
  const [msg, setMsg] = useState("");
  const [hintIdx, setHintIdx] = useState(0);
  const aiLv = diff <= 1 ? [1, 1, 1] : diff === 2 ? [2, 2, 2] : [2, 3, 3];

  /* 座位 0 是玩家，AI 座位 1/2/3 对应 aiLv 的 0/1/2 号档位 */
  const seatLv = (seat) => aiLv[Math.max(0, Math.min(2, seat - 1))];

  /* AI 回合 */
  useEffect(() => {
    if (st.over) return undefined;
    const seat = st.turn;
    if (seat === HUMAN) return undefined;
    const t = setTimeout(() => {
      setSt((cur) => {
        if (cur.over || cur.turn !== seat) return cur;
        const dec = gdAiDecide(cur, seat, seatLv(seat));
        let nxt = dec.pass ? gdPass(cur, seat) : gdPlay(cur, seat, dec.cards);
        if (nxt === cur) nxt = gdPass(cur, seat);
        if (nxt === cur) {
          /* 兜底：领出环节 AI 判空时也要走一手，否则会卡死 */
          const plays = gdGenPlays(cur.hands[seat], cur.level);
          if (plays.length) nxt = gdPlay(cur, seat, plays[plays.length - 1].cards);
        }
        return nxt;
      });
    }, 460);
    return () => clearTimeout(t);
  }, [st, diff]);

  const reset = useCallback(() => {
    setSt(gdStartDeal(null, HUMAN));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  }, []);

  const humanTurn = !st.over && st.turn === HUMAN;

  const toggle = (id) => {
    if (!humanTurn) return;
    setMsg("");
    setSel((p) => (p.indexOf(id) >= 0 ? p.filter((x) => x !== id) : p.concat([id])));
  };

  const doPlay = () => {
    if (!humanTurn) return;
    const cards = st.hands[HUMAN].filter((c) => sel.indexOf(c.id) >= 0);
    if (!cards.length) {
      setMsg("先点牌选中");
      return;
    }
    const a = gdAnalyze(cards, st.level);
    if (!a) {
      setMsg("这不是合法牌型");
      return;
    }
    if (st.lastPlay && st.lastPlay.seat !== HUMAN && !gdBeats({ type: a.type, key: a.key }, st.lastPlay)) {
      setMsg(`压不过上家的${GD_TNAME[st.lastPlay.type]}`);
      return;
    }
    setSt(gdPlay(st, HUMAN, cards));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  };

  const doPass = () => {
    if (!humanTurn) return;
    if (!st.lastPlay) {
      setMsg("你是本轮领出，必须出牌");
      return;
    }
    setSt(gdPass(st, HUMAN));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  };

  const doHint = () => {
    if (!humanTurn) return;
    const resps = st.lastPlay
      ? gdResponses(st.hands[HUMAN], st.level, st.lastPlay)
      : gdGenPlays(st.hands[HUMAN], st.level);
    if (!resps.length) {
      setMsg(st.lastPlay ? "没有能压过的牌，过吧" : "无牌可出");
      return;
    }
    const p = resps[hintIdx % resps.length];
    setSel(p.cards.map((c) => c.id));
    setHintIdx(hintIdx + 1);
    setMsg(`${GD_TNAME[p.type]}（提示 ${((hintIdx % resps.length) + 1)}/${resps.length}）`);
  };

  const nextRound = () => {
    setSt(gdStartDeal(st, HUMAN));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  };

  /* 结算面板上换难度要连下一局一起开，否则难度点了没反应 */
  const changeDiff = (d) => {
    setDiff(d);
    setSt(gdStartDeal(st, HUMAN));
    setSel([]);
    setMsg("");
    setHintIdx(0);
  };

  const myLevels = st.levels[gdTeamOf(HUMAN)];
  const foeLevels = st.levels[1 - gdTeamOf(HUMAN)];
  const nameOf = (lv) => (lv >= 15 ? "A" : GD_RN[lv] || String(lv));
  const lastCards = st.lastPlay ? st.lastPlay.cards : null;

  const oppRows = [3, 2, 1].map((s) => {
    const on = !st.over && st.turn === s;
    const done = st.out.indexOf(s) >= 0;
    return h(
      "div",
      { className: "gd-opp", key: s },
      h("div", { className: `gd-opp-name${on ? " on" : ""}` }, `${GD_SEAT_NAME[s]}${s === 2 ? "(队友)" : ""}`),
      h(
        "div",
        { className: "gd-cnt" },
        h("div", { className: "gd-backs" }, [0, 1, 2].map((i) => h("div", { className: "gd-back", key: i }))),
        h("b", null, done ? "完" : String(st.hands[s].length)),
      ),
      h("div", { className: "gd-tip" }, gdSeatTip(st, s)),
    );
  });

  const result = st.result;
  const myTeamWon = result ? result.winTeam === gdTeamOf(HUMAN) : false;

  return h(
    GameChrome,
    {
      hud: [
        { k: "级牌", v: nameOf(st.level) },
        { k: "我方", v: nameOf(myLevels) },
        { k: "对方", v: nameOf(foeLevels) },
        { k: "状态", v: st.over ? "本局结束" : humanTurn ? "轮到你" : `${GD_SEAT_NAME[st.turn]} 出牌` },
      ],
      onRestart: reset,
      overlay: st.over
        ? h(GameOverlay, {
            title: result && result.finished ? (myTeamWon ? "打过 A，通关！" : "对方通关") : myTeamWon ? "你方这局赢了" : "这局输了",
            lines: [
              result
                ? `名次：${result.out.map((s, i) => `${i + 1}.${GD_SEAT_NAME[s]}`).join("  ")}`
                : "",
              result
                ? `${result.same ? "双上" : "单下"}，升 ${result.up} 级（${nameOf(result.levelBefore)} → ${nameOf(result.levelAfter)}）`
                : "",
              result && result.finished ? "一队打过 A，本次对局结束。" : "下一局按进贡规则发牌。",
            ].filter(Boolean),
            actions: [
              { label: result && result.finished ? "重新开始" : "下一局", primary: true, onClick: nextRound },
              { label: "难度 简单", onClick: () => changeDiff(1) },
              { label: "难度 普通", onClick: () => changeDiff(2) },
              { label: "难度 困难", onClick: () => changeDiff(3) },
            ],
          })
        : null,
    },
    h("style", null, GD_CSS),
    h(
      "div",
      { className: "gd-wrap" },
      h("div", { className: "gd-opps" }, oppRows),
      h(
        "div",
        { className: "gd-mid" },
        h(
          "div",
          { className: "gd-lv" },
          h("span", null, "级牌 "),
          h("b", null, nameOf(st.level)),
          h("span", { className: "me" }, `我方 ${nameOf(myLevels)}`),
          h("span", { className: "foe" }, `对方 ${nameOf(foeLevels)}`),
        ),
        lastCards
          ? h(
              "div",
              { className: "gd-last" },
              h("span", { className: "gd-lastlbl" }, `${GD_SEAT_NAME[st.lastPlay.seat]} 出`),
              lastCards.map((c) => gdCardEl(c, st.level, { mini: true })),
              h("span", { className: "gd-lastlbl" }, GD_TNAME[st.lastPlay.type]),
            )
          : h("div", { className: "gd-last" }, h("span", { className: "gd-lastlbl" }, "新一轮，由领出方随意出牌")),
        st.tribute && st.tribute.logs.length
          ? h("div", { className: "gd-tribute" }, st.tribute.logs.join("　"))
          : null,
        h("div", { className: "gd-msg" }, msg || (humanTurn ? "" : " ")),
      ),
      h(
        "div",
        { className: "gd-hand" },
        st.hands[HUMAN].map((c) => gdCardEl(c, st.level, { sel: sel.indexOf(c.id) >= 0, onClick: () => toggle(c.id) })),
      ),
      h(
        "div",
        { className: "gd-act" },
        h("button", { type: "button", className: "gc-btn primary", onClick: doPlay, disabled: !humanTurn }, `出牌${sel.length ? `（${sel.length}）` : ""}`),
        h("button", { type: "button", className: "gc-btn", onClick: doPass, disabled: !humanTurn }, "过"),
        h("button", { type: "button", className: "gc-btn", onClick: doHint, disabled: !humanTurn }, "提示"),
        h("button", { type: "button", className: "gc-btn", onClick: () => setSel([]), disabled: !sel.length }, "清空"),
      ),
    ),
  );
}

attachKernel("guandan", {
  T: GD_T,
  TNAME: GD_TNAME,
  SEAT_NAME: GD_SEAT_NAME,
  deck: gdDeck,
  val: gdVal,
  isWild: gdIsWild,
  analyze: gdAnalyze,
  beats: gdBeats,
  genPlays: gdGenPlays,
  responses: gdResponses,
  newDeal: gdNewDeal,
  startDeal: gdStartDeal,
  play: gdPlay,
  pass: gdPass,
  settle: gdSettle,
  tributeNeed: gdTributeNeed,
  applyTribute: gdApplyTribute,
  aiDecide: gdAiDecide,
  sortHand: gdSortHand,
  teamOf: gdTeamOf,
});

defineGame({
  id: "guandan",
  name: "掼蛋",
  sub: "GUANDAN",
  icon: "♦",
  tag: "棋牌",
  color: "#e6a23c",
  desc: "四人两队的完整掼蛋：级牌、逢人配、进贡还贡、全套牌型，三个 AI 陪你打。",
  order: 110,
  component: GuandanGame,
});
