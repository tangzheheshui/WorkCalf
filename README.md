# 勤劳的牛牛 WorkCalf

佛系打工小牛桌面悬浮桌宠：监听全局键鼠驱动角色动画 —— 打字时跟着"打工"（视线跟随鼠标、按键在键盘上实时高亮，右手会大幅抬起再砸向对应键位），闲置后自动切换敲木鱼静心态。当前视觉为 MS Paint 涂鸦风：**透明背景**（小牛背后就是空气），白牛牛坐在工位后；整幅画面（小牛、桌子、键盘、鼠标垫）像照片一样统一带一个很小的镜头倾角（右高左低），键盘和鼠标垫的长边与桌沿互相平行，键盘像参考梗图那样平铺在桌上；键盘采用 12 单位宽布局、键帽更大、黑边更细，数字/字母清晰可读并完整落在键帽内；键盘斜向小牛（空格排靠小牛、文字也是小牛的视角），而不是正对观众。打字时身体和脑袋不抖动，只有右手在动。按键识别覆盖数字/字母/空格/回车/退格/Delete/Tab/Shift/Ctrl/Alt/方向键/常用标点，键盘上没有的键（如 F1-F12）会在手边浮出键帽提示。鼠标垫放在键盘左下、靠近小牛座位的桌面上，与键盘完全不重叠；鼠标默认停在垫子正中间，按真实鼠标的位移在垫子上跟手滑动。方向按小牛自己的视角来（它面对你坐着，所以左右、上下都和手的移动方向相反），停手约 1 秒后慢慢回到垫子中央。

**纯单机**：无登录、无账号、无付费，不上传任何键鼠数据。全局监听只取**键位**和鼠标位移用于本地动画——**不记录你打出的文字、不写日志、不落盘、不联网上传**。只有在你主动提交反馈或检查更新时，才会访问对应的服务地址。

**开源**：源码在 <https://github.com/tangzheheshui/WorkCalf>，MIT 协议（见 [LICENSE](LICENSE)），可自行审查、编译或分发。

## 技术栈

- **Tauri 2 + Rust**：核心业务逻辑（状态机、配置、窗口、托盘、输入监听抽象）一份代码跨平台
- **Web 前端（零框架、零 npm 依赖）**：Canvas 2D 涂鸦风渲染（工位场景 + 按键高亮）；Live2D 接入点已预留（见下）
- **平台输入适配**：Windows = rdev(Win32 低级钩子，免系统权限)；macOS = rdev(CGEventTap，需辅助功能权限)

## 目录结构

```
├── ui/                      # 前端（静态，无构建步骤，随 exe 打包内嵌）
│   ├── index.html           # 桌宠主窗口（透明、置顶、可拖拽、右键菜单）
│   ├── main.js              # 事件订阅 → 动画参数 → 渲染器/音效
│   ├── doodle.js            # 当前渲染器：涂鸦风工位场景（键盘/鼠标/按键高亮）
│   ├── placeholder.js       # 旧版矢量小牛渲染器（未启用，保留参考）
│   ├── sounds.js            # 音效（Web Audio 程序化合成占位；真实音效文件替换点）
│   ├── settings.html/js     # 设置面板窗口
├── src-tauri/
│   ├── src/main.rs          # 入口、单实例、窗口配置
│   ├── src/state_machine.rs # 三态状态机：忙碌→发呆(0~阈值s)→木鱼(>阈值s)
│   ├── src/input/           # IGlobalInputListener 抽象 + windows/macos 适配
│   ├── src/config.rs        # config.json（Win: exe 同目录；Mac: ~/Library/...）
│   ├── src/tray.rs          # 系统托盘（穿透开启时的兜底入口）
│   ├── src/commands.rs      # IPC 命令 + 窗口几何/穿透/位置
│   ├── capabilities/        # Tauri v2 ACL
│   └── icons/               # 由 tools/gen-icons.js 生成
├── site/                    # 官网下载页（纯静态；version.json 与应用内检查更新共用）
├── admin/                   # 服务器统一后台（静态页，读 PocketBase 里的反馈）
├── config.template.json     # 默认配置模板
├── LICENSE                  # MIT
├── readme.txt               # 随程序分发的使用说明
└── tools/                   # 图标生成、窗口检查、输入注入、站点同步等辅助脚本
```

## 构建

```bash
# Windows（产物：src-tauri/target/release/workcalf.exe 单文件免安装）
cd src-tauri && cargo build --release

# macOS（需在 Mac 上执行；产物 .app/.dmg）
cd src-tauri && cargo build --release        # 运行调试
cargo tauri build                            # 需 cargo install tauri-cli；签名公证见 tauri 官方文档
```

依赖：Rust stable（MSVC 工具链）、WebView2（Win10/11 系统自带）。

## 角色模型

- **白牛牛**（`classic`）：嚣张眯眼的打工老伙计，默认模型。

模型是独立模块，可单独上架 / 下架，互不影响：

```
ui/
  draw-kit.js          # 中立绘图原语（歪椭圆、描边、烟…），不含任何配色/物种
  doodle.js            # 核心渲染器：身体、工位、姿态、特效；只认下面的角色接口
  characters/
    index.js           # 模型注册表（唯一需要改的地方）
    cow.js             # 白牛牛：耳朵、五官、头像，全部自包含
  models.js            # 由注册表生成模型列表，本身不用改
```

- **上架**：新增 `ui/characters/<id>.js`，导出 `id / name / desc / style / drawHead / drawPortrait`，
  再在 `characters/index.js` 里 `import` 并加进 `CHARACTERS`。
- **下架**：删掉 `characters/index.js` 里那一行和数组项（文件可保留）；配置里残留的
  `model_id` 会自动回落到第一个模型。
- 核心渲染器不认识任何具体物种：头长什么样、烟叼在哪，全部由角色模块返回的
  `drawHead` 决定（返回 `{ smokeTip }` 供烟雾粒子定位）。
- 设置面板 →「模型」点卡片即热切换，不用重启。
- `tools/model-preview.html` 是开发用的模型预览页（浏览器打开即可看全部模型各状态的渲染效果）。

## 配置项（config.json）

| 字段 | 说明 | 可选值/默认 |
|------|------|------------|
| `idle_timeout_secs` | 闲置多久开始敲木鱼（保留内部字段，界面不再提供） | 3/4/5/8，默认 4 |
| `anim_speed` | 动画速度（保留内部字段，界面不再提供） | slow/normal/fast，默认 normal |
| `scale` | 挂件缩放 | 0.3~2.0，默认 0.65 |
| `opacity` | 挂件不透明度 | 0.2~1.0，默认 1.0 |
| `click_through` | 鼠标穿透 | 开启后无法拖拽，用托盘关回 |
| `sound_enabled` | 音效总开关 | 默认 true |
| `pos_x/pos_y` | 窗口位置（自动记忆，-1=右下角默认） | 逻辑坐标 |
| `debug_dump` | 调试：导出渲染帧+状态快照到 %TEMP% | 默认 false |

## 交互与穿透设计（重要）

窗口默认 221×221（340 × 0.65），**整个窗口矩形都参与交互**：任意位置都能拖拽、
右键弹菜单，不再只限小牛本体。鼠标停在桌宠上滚动滚轮可以直接缩放显示比例
（每格 0.05，范围 0.3~2.0，往下滚缩小、往上滚放大，窗口左上角位置不变），
比进设置面板更方便。设置面板里另有缩放滑杆和不透明度滑杆（0.2~1.0，默认 1.0），
拖动即时生效。
透明像素的穿透交给设置面板里的"鼠标穿透"开关统一控制；开启后整窗穿透，
拖拽、右键和滚轮缩放都不可用，需从系统托盘或设置面板关回。

渲染器仍保留 `hitTest(x, y)` 接口（Live2D 接入时可能用于精细命中），但主窗口
当前不做逐像素判断。缩放只改变窗口尺寸，**保持左上角位置不动**。

## Live2D 接入点（资源到位后）

当前 `doodle.js` 用 Canvas 2D 程序化绘制，与 Live2D 渲染器接口同构：

```js
renderer.render(dt, { state, intensity, headX, headY, clickAge, keyAge, lastKey, speed, onKnock })
renderer.hitTest(x, y)  // 精细命中（预留：当前整窗热区，未使用）
```

接入真实模型时：
1. 放入 `ui/assets/model/`（.model3.json + moc3 + 贴图，Cubism 4 格式）
2. 引入 pixi.js + pixi-live2d-display + live2dcubismcore（需下载并本地化）
3. 实现同接口的 Live2DRenderer：打字强度→点头参数频率、鼠标→ParamAngleX/Y、
   状态→模型切换姿势（打字/蹲坐抱木鱼），替换 `main.js` 中的渲染器实例即可
4. 音效同理：真实音频文件放 `ui/assets/sfx/`，`sounds.js` 改为优先加载文件

注意 Live2D Cubism SDK 授权条款（小规模营业额内免费，需展示授权声明）。

## 已验证 / 待验证

**本机（无显示输出的远程会话）已自动验证**：
- ✅ 编译零警告；单 exe 8.9MB；运行内存 ~25MB
- ✅ 窗口默认 221×221（0.65 倍）置顶、透明、默认右下角（24px 边距）、位置自动记忆；
  缩放只改尺寸不改位置
- ✅ 状态机：启动→忙碌，停输入 3s→发呆，4s→木鱼（快照 `state=... ms_since_input=...` 证实）
- ✅ 渲染管线：canvas 帧导出图像正确（木鱼姿势完整：蹲坐/眯眼/木鱼/木槌/蒲团）
- ✅ IPC/ACL、托盘创建、配置自动生成与持久化、单实例

**需真实桌面人工验证**（远程会话不接受合成输入，注入测试无法进行）：
- 全局键鼠捕获 → 打断木鱼回忙碌（代码链路已就绪，rdev 钩子线程健康 `listener_ok=true`）
- 拖拽、右键菜单、音效听感、缩放/穿透交互手感

## macOS 备注

- 首次运行需授予：系统设置 → 隐私与安全性 → 辅助功能（未授权时设置面板会红条引导，
  `mac_permission_status` 命令检测，`open_mac_accessibility` 一键跳转）
- 配置文件在 `~/Library/Application Support/WorkCalf/`（写 .app 包内会破坏签名）
- 透明窗口需 `macOSPrivateApi`（已配置）+ 对应 Cargo feature（已开启）
- macOS 侧代码已写好但**未在真机编译验证**，需 MacBook 构建

### 用 GitHub Actions 打 mac 包

Windows 上没法构建 macOS 产物（需要 Xcode 工具链、codesign、hdiutil），用
`.github/workflows/build-macos.yml`：

- 在 Actions 页手动 Run workflow，或 push 一个 `v*` tag；
- 在 Apple Silicon runner 上分别交叉编译 `aarch64-apple-darwin`（M 芯片）和
  `x86_64-apple-darwin`（Intel），各产出一个 dmg；
- 构建完成后到该次 run 的 **Artifacts** 下载（`WorkCalf-macos-arm64`、`WorkCalf-macos-x86_64`）。

未签名的包首次打开会被 Gatekeeper 拦下：右键 →「打开」，或在终端执行
`xattr -dr com.apple.quarantine /Applications/WorkCalf.app`。要免这一步需要
Apple Developer Program（$99/年）做 Developer ID 签名 + 公证。

图标目前最大只有 256×256（`src-tauri/icons/icon.png`），macOS 会把它放大使用，
Retina 下偏糊；换成 1024×1024 源图后重新跑 `tauri icon` 生成全套图标即可。

## 路线图（V1.1 候选）

- 开机自启、休眠睡觉动画（原文档排期）
- Live2D 真实模型接入（阻塞：等资源）
- 真实音效素材替换合成音
