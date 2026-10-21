// 模型库：每套模型 = 一套配色 + 装饰特征。
// 渲染器（placeholder.js）按 style 绘制，切换模型无需重启。
// 将来接入 Live2D 真实模型时，可在此增加 { id, name, type: 'live2d', url } 条目。

export const MODELS = [
  {
    id: 'classic',
    name: '憨厚棕牛（经典）',
    style: {
      body: '#9c6b4a',
      bodyDark: '#82563a',
      belly: '#c99e77',
      horn: '#e9dcc0',
      innerEar: '#d9a688',
      muzzle: '#d9a679',
      hoof: '#5a3d2b',
      blush: 'rgba(232,130,110,0.35)',
      accessory: 'straw', // 草帽
    },
  },
  {
    id: 'holstein',
    name: '黑白奶牛',
    style: {
      body: '#f2efe9',
      bodyDark: '#3a3330',
      belly: '#fbf9f5',
      horn: '#e6dcc4',
      innerEar: '#e8b3ab',
      muzzle: '#e8b3ab',
      hoof: '#3a3330',
      blush: 'rgba(232,130,130,0.30)',
      spots: true,
      accessory: 'bell', // 牛铃
    },
  },
  {
    id: 'golden',
    name: '小黄牛',
    style: {
      body: '#d9a441',
      bodyDark: '#b9832c',
      belly: '#f3d99a',
      horn: '#fff2d0',
      innerEar: '#e8b98a',
      muzzle: '#f0d09a',
      hoof: '#7a5322',
      blush: 'rgba(240,140,90,0.35)',
      accessory: 'headphones', // 耳机（打工牛）
    },
  },
  {
    id: 'sakura',
    name: '樱花粉牛',
    style: {
      body: '#e8a4a8',
      bodyDark: '#d4878c',
      belly: '#f9d8da',
      horn: '#fff4ea',
      innerEar: '#f3c3c6',
      muzzle: '#f7d0d2',
      hoof: '#8c5b60',
      blush: 'rgba(230,110,120,0.35)',
      accessory: 'bow', // 蝴蝶结
    },
  },
];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}

export function nextModelId(currentId) {
  const i = MODELS.findIndex((m) => m.id === currentId);
  return MODELS[(i + 1) % MODELS.length].id;
}
