/* ============================================================================
 * 插件出口：注册一个 shell.overlay 槽位。
 *
 * order 取 59 —— 排在旧三国（60）、旧弹珠台（61）之前。
 * 两个旧包已从 profile 的 bundles 里移出，这里的相对次序只是兜底：
 * 若哪天把旧包加回来，游戏中心按钮会显示在它们上方。
 * ========================================================================== */

const NS = "dsh-game-hub";

const inject = ["slots"];

function apply(ctx) {
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      {
        name: "shell.overlay",
        id: NS,
        order: 59,
        label: () => "游戏中心",
      },
      GameCenterOverlay,
    ),
  );
}

exports.name = NS;
exports.inject = inject;
exports.apply = apply;

/* 供无头测试直接取内核：三国规则、弹珠台物理都不经过 React 也能验 */
exports.__internals = {
  threeKingdoms: ThreeKingdomsGame.internals,
  pinball: PinballGame.internals,
  registry: { allGames, gameById, defineGame },
  kernels: GAME_KERNELS,
  util: { storeGet, storeSet, storeDel, loadBoard, saveScore, bestScore, makeRng, isTyping },
  GameCenterOverlay,
};
