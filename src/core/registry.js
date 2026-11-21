/* ============================================================================
 * 注册表：每个游戏用 defineGame() 自报家门，外壳只认这张表。
 *
 * 为什么不用 import：DSH 的客户端插件只暴露一个 factory 函数，没有跨文件
 * 加载通道。build.mjs 把所有 src 文件拼进同一个函数体，所以这里的一个
 * 顶层数组就是全局唯一真相，游戏的声明顺序即加载顺序。
 * ========================================================================== */

const GAME_REGISTRY = [];

/** 各游戏暴露的纯函数内核（无头测试直调，不经过 React） */
const GAME_KERNELS = {};

function attachKernel(id, kernel) {
  GAME_KERNELS[id] = kernel;
}

/**
 * @param {object} def
 * @param {string} def.id       稳定 id（存档、路由都用它，别改）
 * @param {string} def.name     中文名
 * @param {string} def.sub      副标题 / 英文名
 * @param {string} def.icon     卡片上的字形（1-2 个字符，不依赖图片资源）
 * @param {string} def.desc     一句话说明
 * @param {string} def.tag      分类：经典 / 棋牌 / 战略
 * @param {string} [def.color]  卡片主题色
 * @param {Function} def.component  接收 { onExit } 的 React 组件
 * @param {number} [def.order]  排序权重，越小越靠前
 */
function defineGame(def) {
  if (!def || !def.id || !def.component) {
    throw new Error("defineGame 需要 id 与 component");
  }
  if (GAME_REGISTRY.some((g) => g.id === def.id)) {
    throw new Error(`游戏 id 重复：${def.id}`);
  }
  GAME_REGISTRY.push({ order: 100, color: "#7c8cff", ...def });
}

/** 按 order 再按名字排 —— 每次渲染都重新排，避免依赖声明顺序 */
function allGames() {
  return GAME_REGISTRY.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh"));
}

function gameById(id) {
  return GAME_REGISTRY.find((g) => g.id === id) || null;
}
