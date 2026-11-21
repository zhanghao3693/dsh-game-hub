/* ============================================================================
 * 外壳：悬浮按钮 + 面板 + 游戏卡片墙 + 游戏容器。
 *
 * 这里只做三件事：开合、选游戏、给游戏一个能自适应大小的容器。
 * 具体玩法一律交给 src/games/ 或 src/legacy/，外壳不认识任何规则。
 *
 * 尺寸约束来自 DSH 宿主：右下角 bottom 76px 以内被输入框占着，旧插件
 * （三国 bottom:96 / 弹珠台 bottom:148）就是为避开它才抬高的，沿用 96。
 * ========================================================================== */

const GC_FAB_BOTTOM = 96;

const GC_CSS = `
.gc-root{position:fixed;inset:0;pointer-events:none;z-index:2147483100;
  --gc-accent:#7c8cff;--gc-accent-2:#4fd1c5;--gc-warn:#e8b64a;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  -webkit-font-smoothing:antialiased}
body:not([data-ds-dark-theme]) .gc-root{--gc-accent:#4453c4;--gc-accent-2:#0e7c73;--gc-warn:#8a6512}

/* ---------------------------------------------------------------- 悬浮按钮 */
.gc-fab{position:absolute;right:18px;bottom:${GC_FAB_BOTTOM}px;pointer-events:auto;
  display:flex;align-items:center;gap:7px;padding:9px 14px 9px 11px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));
  background:var(--dsw-alias-bg-layer-1,#1f1f22);color:var(--dsw-alias-label-primary,#e8e8ea);
  box-shadow:0 6px 20px rgba(0,0,0,.28);font-size:13px;font-weight:600;letter-spacing:.02em;
  transition:transform .14s ease,box-shadow .14s ease}
.gc-fab:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(0,0,0,.34)}
.gc-fab:active{transform:translateY(0)}
.gc-fab-ico{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;
  border-radius:6px;background:linear-gradient(135deg,var(--gc-accent),var(--gc-accent-2));
  color:#fff;font-size:12px;line-height:1}

/* ------------------------------------------------------------------ 面板 */
.gc-panel{position:absolute;right:16px;bottom:76px;pointer-events:auto;display:flex;flex-direction:column;
  width:min(760px,calc(100vw - 32px));height:min(700px,calc(100vh - 100px));
  border-radius:14px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,#1b1b1f);
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));
  box-shadow:0 18px 52px rgba(0,0,0,.42);
  color:var(--dsw-alias-label-primary,#eceef1);font-size:13px;line-height:1.5}
.gc-head{flex:none;display:flex;align-items:center;gap:9px;padding:9px 12px;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03))}
.gc-head-t{font-weight:700;letter-spacing:.12em;font-size:13px}
.gc-head-sub{color:var(--dsw-alias-label-secondary,#a2a6ad);font-size:11px;letter-spacing:.06em}
.gc-head-sp{flex:1}
.gc-back{display:inline-flex;align-items:center;gap:5px;padding:3px 9px 3px 7px;border-radius:7px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:transparent;cursor:pointer;
  color:var(--dsw-alias-label-secondary,#a2a6ad);font-size:12px;font-family:inherit;
  transition:background .12s ease,color .12s ease}
.gc-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));
  color:var(--dsw-alias-label-primary,#eceef1)}
.gc-x{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#a2a6ad);cursor:pointer;
  font-size:15px;line-height:1;padding:3px 6px;border-radius:6px}
.gc-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));
  color:var(--dsw-alias-label-primary,#eceef1)}

/* 游戏容器：flex:1 + min-height:0 是让内部 canvas/网格能拿到真实高度去自适应的前提 */
.gc-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.gc-body-pad{padding:14px}

/* --------------------------------------------------------------- 卡片墙 */
.gc-wall{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px}
.gc-wall::-webkit-scrollbar{width:8px}
.gc-wall::-webkit-scrollbar-thumb{background:rgba(128,128,128,.3);border-radius:4px}
.gc-sect{font-size:11px;letter-spacing:.16em;color:var(--dsw-alias-label-tertiary,#8b8f98);
  margin:0 2px 10px;font-weight:600}
.gc-sect+.gc-grid{margin-bottom:18px}
.gc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.gc-card{position:relative;display:flex;flex-direction:column;gap:4px;padding:12px 12px 11px;
  border-radius:11px;cursor:pointer;text-align:left;font-family:inherit;font-size:inherit;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));
  background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.035));
  color:inherit;transition:transform .13s ease,border-color .13s ease,background .13s ease}
.gc-card:hover{transform:translateY(-2px);border-color:var(--gc-hue,var(--gc-accent));
  background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.06))}
.gc-card-top{display:flex;align-items:center;gap:8px}
.gc-card-ico{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:30px;height:30px;border-radius:9px;font-size:15px;line-height:1;
  background:color-mix(in srgb,var(--gc-hue,var(--gc-accent)) 20%,transparent);
  border:1px solid color-mix(in srgb,var(--gc-hue,var(--gc-accent)) 45%,transparent)}
.gc-card-nm{font-weight:650;font-size:13.5px;letter-spacing:.01em}
.gc-card-sub{font-size:10px;letter-spacing:.1em;color:var(--dsw-alias-label-tertiary,#8b8f98);
  text-transform:uppercase}
.gc-card-desc{font-size:11.5px;color:var(--dsw-alias-label-secondary,#a2a6ad);line-height:1.45;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gc-card-hi{position:absolute;top:9px;right:10px;font-size:10px;font-variant-numeric:tabular-nums;
  color:var(--gc-warn);letter-spacing:.02em}

/* --------------------------------------------------- 迁入游戏的浮层压平 */
/* 三国/弹珠台原本是 position:fixed 的独立浮层。放进 .gc-body 后要把它们
   压成普通块级元素，否则会盖住整个页面、还会各自带一层 z-index。 */
.gc-body .tk3k-root,.gc-body .np-root{position:static;inset:auto;z-index:auto;
  pointer-events:auto;height:100%;display:flex;flex-direction:column}
.gc-body .tk3k-panel,.gc-body .np-panel{position:static;right:auto;bottom:auto;left:auto;
  width:100%;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;
  background:transparent;flex:1 1 auto;min-height:0}
/* 旧面板自带的标题条里已经有自己的关闭键，和外壳头重复，藏掉标题条的文字区 */
.gc-body .tk3k-head,.gc-body .np-head{border-radius:0}

/* ------------------------------------------------------------ 通用小组件 */
.gc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:6px 12px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12.5px;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.32));background:transparent;
  color:var(--dsw-alias-label-primary,#eceef1);transition:background .12s ease}
.gc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.gc-btn.primary{background:var(--gc-accent);border-color:transparent;color:#fff;font-weight:600}
.gc-btn.primary:hover{filter:brightness(1.1)}
.gc-empty{display:flex;align-items:center;justify-content:center;height:100%;
  color:var(--dsw-alias-label-tertiary,#8b8f98);font-size:12px}
`;

/* ------------------------------------------------------------------ 组件 */

function GameCenterOverlay() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const games = allGames();
  const active = activeId ? gameById(activeId) : null;

  /* 选择游戏时先把键盘焦点从上一个游戏里挪开，避免两个游戏同时吃按键 */
  const enter = useCallback((id) => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setActiveId(id);
  }, []);

  const exit = useCallback(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setActiveId(null);
  }, []);

  const closeAll = useCallback(() => {
    exit();
    setOpen(false);
  }, [exit]);

  /* 面板开着时按 Esc 返回上一层：游戏内先回卡片墙，墙上再关面板。
     捕获阶段拦下，避免和游戏内部的按键（弹珠台的 R、三国的方向键）抢。 */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (isTyping(e.target)) return;
      if (activeId) {
        e.preventDefault();
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeId, exit]);

  if (!open) {
    return h(
      "div",
      { className: "gc-root" },
      h("style", null, GC_CSS + GC_GAME_CSS),
      h(
        "button",
        {
          type: "button",
          className: "gc-fab",
          title: "游戏中心",
          onClick: () => setOpen(true),
        },
        h("span", { className: "gc-fab-ico" }, "🎮"),
        "游戏中心",
      ),
    );
  }

  return h(
    "div",
    { className: "gc-root" },
    h("style", null, GC_CSS + GC_GAME_CSS),
    h(
      "div",
      { className: "gc-panel" },
      h(
        "div",
        { className: "gc-head" },
        active
          ? h(
              "button",
              { type: "button", className: "gc-back", onClick: exit, title: "返回游戏列表" },
              "← 游戏库",
            )
          : null,
        h("span", { className: "gc-head-t" }, active ? active.name : "游戏中心"),
        h("span", { className: "gc-head-sub" }, active ? active.sub : `GAME CENTER · ${games.length} 款`),
        h("span", { className: "gc-head-sp" }),
        h("button", { type: "button", className: "gc-x", onClick: closeAll, title: "收起" }, "✕"),
      ),
      active
        ? h(
            "div",
            { className: "gc-body" },
            /* key 让换游戏时强制卸载重建，避免上一个游戏的 tick 残留 */
            h(active.component, { key: active.id, onExit: exit }),
          )
        : h("div", { className: "gc-wall" }, renderWall(games, enter)),
    ),
  );
}

/** 卡片墙：先按 tag 分组，组内保持 registry 给的顺序 */
function renderWall(games, onPick) {
  const groups = [];
  for (const g of games) {
    const tag = g.tag || "经典";
    let bucket = groups.find((x) => x.tag === tag);
    if (!bucket) groups.push((bucket = { tag, items: [] }));
    bucket.items.push(g);
  }
  return groups.map((bucket) =>
    h(
      "div",
      { key: bucket.tag },
      h("div", { className: "gc-sect" }, bucket.tag),
      h(
        "div",
        { className: "gc-grid" },
        bucket.items.map((g) => {
          const hi = bestScore(g.id);
          return h(
            "button",
            {
              key: g.id,
              type: "button",
              className: "gc-card",
              style: { "--gc-hue": g.color },
              onClick: () => onPick(g.id),
              title: g.desc,
            },
            hi > 0 ? h("span", { className: "gc-card-hi" }, fmtNum(hi)) : null,
            h(
              "div",
              { className: "gc-card-top" },
              h("span", { className: "gc-card-ico" }, g.icon || "🎲"),
              h(
                "div",
                { style: { minWidth: 0 } },
                h("div", { className: "gc-card-nm" }, g.name),
                h("div", { className: "gc-card-sub" }, g.sub || ""),
              ),
            ),
            h("div", { className: "gc-card-desc" }, g.desc),
          );
        }),
      ),
    ),
  );
}
