// 角色 / 模型注册表。
//
// 上架一个模型：新增 characters/<id>.js，在这里 import 并加进 CHARACTERS；
// 下架一个模型：删掉下面那一行 import 和数组里的那一项（文件可保留，方便回滚）。
// 核心渲染器（doodle.js）、设置面板、模型列表（models.js）都不用改。
//
// 每个角色模块的接口见 characters/cow.js 顶部说明。

import cow from './cow.js';
import shiba from './shiba.js';

export const CHARACTERS = [cow, shiba];

/** 按 id 取角色；未知 id（比如配置里留着已下架的模型）回落到第一个 */
export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
