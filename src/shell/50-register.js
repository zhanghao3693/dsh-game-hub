/* ============================================================================
 * 把迁入的两款旧游戏登记进游戏库。
 *
 * 顺序说明：build.mjs 按 core → games → legacy → shell 拼接，所以执行到这里时
 * legacy/ 里的 ThreeKingdomsGame / PinballGame 已经定义好了。
 * ========================================================================== */

defineGame({
  id: "three-kingdoms",
  name: "三国志",
  sub: "THREE KINGDOMS",
  icon: "三",
  tag: "战略",
  color: "#c8a24a",
  desc: "回合制群雄割据：八座城池、内政征兵、火计伏兵，三个月一轮回。",
  order: 10,
  component: ThreeKingdomsGame.component,
});

defineGame({
  id: "nokia-pinball",
  name: "弹珠台",
  sub: "NOKIA PINBALL",
  icon: "◉",
  tag: "街机",
  color: "#4fd1c5",
  desc: "复刻诺基亚 J2ME 弹珠台：翻板、弹射器、缓冲器，蓄力越足飞得越远。",
  order: 20,
  component: PinballGame.component,
});
