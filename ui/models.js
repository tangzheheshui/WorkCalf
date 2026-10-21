// 模型库：涂鸦风渲染器（doodle.js）按 style 绘制。
// 每套模型 = 一套配色 + 特征开关，切换无需重启。
// 将来接入 Live2D 真实模型时，可在此增加 { id, name, type: 'live2d', url } 条目。

// 目前只保留精修过的白牛牛；旧配色模型不再提供切换。
export const MODELS = [
  {
    id: 'classic',
    name: '白牛牛',
    style: {
      body: '#ffffff',
      patch: false,
    },
  },
];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}
