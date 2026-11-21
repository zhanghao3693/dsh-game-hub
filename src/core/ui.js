/* ============================================================================
 * 游戏通用件：统一外观、键盘、主循环。
 *
 * 9 款游戏如果各写一遍 HUD、各挂一次 window keydown、各写一遍 rAF 循环，
 * 加起来就是 9 份重复代码 + 9 个没清干净的监听器。这里收成三个东西：
 *
 *   GameChrome  —— 外框（标题条 + HUD 数字 + 画布区 + 底栏按钮）
 *   useKeys     —— 带 isTyping 让位、自动解绑的键盘钩子
 *   useLoop     —— 固定步长的 rAF 循环，切走/卸载自动停
 * ========================================================================== */

const GC_GAME_CSS = `
.gc-game{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.gc-game-hud{flex:none;display:flex;align-items:center;gap:14px;padding:8px 14px;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.025));font-size:11px}
.gc-hud-cell{display:flex;flex-direction:column;gap:1px;min-width:0}
.gc-hud-cell b{font-size:9px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;
  color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gc-hud-cell span{font-size:13px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.gc-hud-sp{flex:1}
.gc-hud-btn{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:transparent;
  cursor:pointer;color:var(--dsw-alias-label-secondary,#a2a6ad);font-family:inherit;font-size:11.5px;
  padding:4px 10px;border-radius:7px;transition:background .12s,color .12s}
.gc-hud-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));
  color:var(--dsw-alias-label-primary,#eceef1)}

.gc-stage{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;
  justify-content:center;padding:12px;overflow:hidden}
.gc-stage canvas{display:block;touch-action:none;max-width:100%;max-height:100%;
  border-radius:10px;image-rendering:auto}

.gc-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:9px;background:rgba(10,10,14,.72);backdrop-filter:blur(3px);
  border-radius:10px;text-align:center;padding:20px;z-index:2}
.gc-overlay h3{margin:0;font-size:17px;font-weight:700;letter-spacing:.1em;color:#fff}
.gc-overlay p{margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,.72);max-width:300px}
.gc-overlay .gc-btn{color:#fff;border-color:rgba(255,255,255,.35)}
.gc-overlay .gc-btn:hover{background:rgba(255,255,255,.14)}
.gc-overlay .gc-btn.primary{background:var(--gc-accent);border-color:transparent}

.gc-foot{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px;
  border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.025));font-size:11px;
  color:var(--dsw-alias-label-tertiary,#8b8f98)}
.gc-foot-sp{flex:1}
.gc-key{display:inline-block;padding:1px 5px;border-radius:4px;margin:0 1px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));
  background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.05));
  font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
`;

/* ------------------------------------------------------------ 键盘 */

/**
 * 绑定 window 键盘。
 * @param {object} handlers  { ArrowLeft: fn, " ": fn } 或 { down: {key:fn}, up: {key:fn} }
 * @param {boolean} active   为 false 时完全不挂监听
 *
 * key 一律归一化：` ` → Space 保持原样，ArrowUp/Enter 等直接用 e.key。
 * 焦点在输入框时 isTyping 会拦下 —— 否则在对话里打字会把蛇按死。
 */
function useKeys(active, handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!active) return undefined;
    const norm = (e) => {
      if (e.key === " ") return "Space";
      return e.key;
    };
    const onDown = (e) => {
      if (isTyping(e.target)) return;
      const h2 = ref.current || {};
      const k = norm(e);
      const fn = (h2.down && h2.down[k]) || (typeof h2[k] === "function" ? h2[k] : null);
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    const onUp = (e) => {
      if (isTyping(e.target)) return;
      const h2 = ref.current || {};
      const k = norm(e);
      const fn = h2.up && h2.up[k];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [active]);
}

/* ------------------------------------------------------------ 主循环 */

/**
 * 固定步长循环：逻辑按 step 秒稳定推进，渲染每帧一次。
 * 好处是不受显示器刷新率影响 —— 120Hz 屏上贪吃蛇不会跑两倍速。
 *
 * @param {boolean} active
 * @param {(dt:number)=>void} step  逻辑步进（dt 恒为 stepMs）
 * @param {(t:number)=>void} [draw] 每帧渲染
 * @param {number} [stepFps=60]     逻辑帧率
 */
function useLoop(active, step, draw, stepFps) {
  const stepRef = useRef(step);
  const drawRef = useRef(draw);
  stepRef.current = step;
  drawRef.current = draw;

  useEffect(() => {
    if (!active) return undefined;
    const stepMs = 1000 / (stepFps || 60);
    let raf = 0;
    let last = 0;
    let acc = 0;
    const tick = (now) => {
      if (!last) last = now;
      /* 切标签页回来时 now-last 可能是好几秒，钳一下避免瞬间跑几百步 */
      const delta = Math.min(200, now - last);
      last = now;
      acc += delta;
      let guard = 0;
      while (acc >= stepMs && guard < 8) {
        stepRef.current(stepMs / 1000);
        acc -= stepMs;
        guard += 1;
      }
      if (guard >= 8) acc = 0;
      if (drawRef.current) drawRef.current(now);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [active, stepFps]);
}

/* ------------------------------------------------------------ 外框 */

/**
 * 统一外框。hud 是 [{k,v}]；children 里放 canvas 或任意内容。
 * overlay 有值时盖一层遮罩（开始 / 结束 / 暂停）。
 */
function GameChrome({ hud, onRestart, children, footer, overlay }) {
  return h(
    "div",
    { className: "gc-game" },
    h(
      "div",
      { className: "gc-game-hud" },
      (hud || []).map((cell, i) =>
        h(
          "div",
          { className: "gc-hud-cell", key: i },
          h("b", null, cell.k),
          h("span", null, cell.v),
        ),
      ),
      h("span", { className: "gc-hud-sp" }),
      onRestart ? h("button", { type: "button", className: "gc-hud-btn", onClick: onRestart }, "重开") : null,
    ),
    h("div", { className: "gc-stage" }, children, overlay || null),
    footer
      ? h(
          "div",
          { className: "gc-foot" },
          footer,
          h("span", { className: "gc-foot-sp" }),
        )
      : null,
  );
}

/** 遮罩层：标题 + 说明 + 一到两个按钮 */
function GameOverlay({ title, lines, actions }) {
  return h(
    "div",
    { className: "gc-overlay" },
    h("h3", null, title),
    (lines || []).map((l, i) => h("p", { key: i }, l)),
    h(
      "div",
      { style: { display: "flex", gap: 8, marginTop: 4 } },
      (actions || []).map((a, i) =>
        h(
          "button",
          {
            key: i,
            type: "button",
            className: `gc-btn${a.primary ? " primary" : ""}`,
            onClick: a.onClick,
          },
          a.label,
        ),
      ),
    ),
  );
}

/* ------------------------------------------------------ 画布自适应尺寸 */

/**
 * 让 canvas 撑满 .gc-stage 且保持逻辑宽高比 —— 手机窄屏和宽桌面都能用。
 * 返回的 ref 挂到 canvas 上，内部用 ResizeObserver 跟随容器变化。
 */
function useFitCanvas(logicalW, logicalH) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.parentElement) return undefined;
    const box = cv.parentElement;
    const apply = () => {
      const pad = 12; /* 和 .gc-stage 的 padding 一致，留一点呼吸空间 */
      const availW = Math.max(80, box.clientWidth - pad * 2);
      const availH = Math.max(80, box.clientHeight - pad * 2);
      const scale = Math.min(availW / logicalW, availH / logicalH);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(logicalW * scale * dpr);
      cv.height = Math.round(logicalH * scale * dpr);
      cv.style.width = `${Math.round(logicalW * scale)}px`;
      cv.style.height = `${Math.round(logicalH * scale)}px`;
      const ctx = cv.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(scale * dpr, scale * dpr);
      }
      cv.__scale = scale;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(box);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [logicalW, logicalH]);
  return ref;
}

/** 从主题里取几个颜色，让 canvas 里的画面跟深浅色主题一致 */
function gcTheme() {
  const dark = !document.body || document.body.hasAttribute("data-ds-dark-theme");
  return dark
    ? {
        dark: true,
        bg: "#14161d",
        bg2: "#1b1e27",
        line: "rgba(255,255,255,.12)",
        fg: "#e8e8ea",
        dim: "rgba(232,232,234,.55)",
        accent: "#7c8cff",
        accent2: "#4fd1c5",
        warn: "#e8b64a",
        danger: "#e0887e",
      }
    : {
        dark: false,
        bg: "#eef0f4",
        bg2: "#e2e5ec",
        line: "rgba(0,0,0,.13)",
        fg: "#1a1c22",
        dim: "rgba(26,28,34,.55)",
        accent: "#4453c4",
        accent2: "#0e7c73",
        warn: "#8a6512",
        danger: "#b4362a",
      };
}
