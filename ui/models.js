// 模型库：每个模型 = 一个自包含的角色模块（ui/characters/<id>.js）。
//
// 上架 / 下架一个模型：只在 ui/characters/index.js 里加 / 删一行 import，
// 本文件和核心渲染器（doodle.js）都不用改。
//
// 将来接入 Live2D 等非涂鸦模型时，可在此增加 { id, name, type: 'live2d', url } 条目。
import { CHARACTERS } from './characters/index.js';

export const MODELS = CHARACTERS.map((c) => ({
  id: c.id,
  name: c.name,
  desc: c.desc,
  // 角色可选：preview 是给开发预览页截动作帧用的（不影响正式运行）
  preview: c.preview,
  // character 告诉核心渲染器用哪个角色模块，其余字段覆盖默认配色
  style: { ...c.style, character: c.id },
}));

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}
