/**
 * dsh-game-hub — host half（服务端入口）
 *
 * 硬约束：main 指向的文件会在服务端 boot profile 时被 import。
 * 任何顶层 window / document 引用都会让整个服务起不来。
 * 本文件必须保持服务端安全 —— 全部游戏逻辑都在 dist/client.js 里跑。
 */
export const name = "dsh-game-hub";

export function apply() {
  /* 无宿主侧行为：纯客户端 UI 插件 */
}

export default { name, apply };
