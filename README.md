# 闲牛 WorkCalf

佛系打工小牛桌面悬浮桌宠：监听全局键鼠驱动 Live2D 风格角色动画 —— 打字时跟着"打工"（点头、视线跟随鼠标、高速敲击流汗），闲置后自动切换敲木鱼静心态。

**纯单机**：无网络请求、无登录、无付费、无版本校验、无自动更新，不上传任何键鼠数据。

## 技术栈

- **Tauri 2 + Rust**：核心业务逻辑（状态机、配置、窗口、托盘、输入监听抽象）一份代码跨平台
- **Web 前端（零框架、零 npm 依赖）**：Canvas 2D 程序化渲染占位小牛；Live2D 接入点已预留（见下）
- **平台输入适配**：Windows = rdev(Win32 低级钩子，免系统权限)；macOS = rdev(CGEventTap，需辅助功能权限)

## 目录结构

```
├── ui/                      # 前端（静态，无构建步骤，随 exe 打包内嵌）
│   ├── index.html           # 桌宠主窗口（透明、置顶、可拖拽、右键菜单）
│   ├── main.js              # 事件订阅 → 动画参数 → 渲染器/音效
│   ├── placeholder.js       # 占位渲染器（Canvas 2D 程序化小牛，Live2D 同构接口）
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
├── config.template.json     # 默认配置模板
├── readme.txt               # 随程序分发的使用说明
└── tools/                   # 图标生成、窗口检查、输入注入等辅助脚本
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

## 配置项（config.json）

| 字段 | 说明 | 可选值/默认 |
|------|------|------------|
| `idle_timeout_secs` | 闲置多久开始敲木鱼 | 3/4/5/8，默认 4 |
| `anim_speed` | 动画速度 | slow/normal/fast |
| `scale` | 挂件缩放 | 0.5~2.0，默认 1.0 |
| `click_through` | 鼠标穿透 | 开启后无法拖拽，用托盘关回 |
| `sound_enabled` | 音效总开关 | 默认 true |
| `pos_x/pos_y` | 窗口位置（自动记忆，-1=右下角默认） | 逻辑坐标 |
| `debug_dump` | 调试：导出渲染帧+状态快照到 %TEMP% | 默认 false |

## 鼠标穿透设计（重要）

窗口是 340×340 的方形，但小牛是圆形轮廓。默认开启了**逐像素命中测试**：
光标悬在透明区域上时窗口自动穿透，只有悬在小牛本体上才可交互（拖拽/右键）。
设置面板里的"鼠标穿透"开关是全局强制穿透。两种穿透都在托盘可关闭。

## Live2D 接入点（资源到位后）

当前 `placeholder.js` 用 Canvas 2D 程序化绘制小牛，与 Live2D 渲染器接口同构：

```js
renderer.render(dt, { state, intensity, headX, headY, clickAge, speed, onKnock })
renderer.hitTest(x, y)  // 供逐像素穿透
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
- ✅ 窗口 340×340 置顶、透明、默认右下角（24px 边距）、位置自动记忆
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

## 路线图（V1.1 候选）

- 开机自启、休眠睡觉动画（原文档排期）
- Live2D 真实模型接入（阻塞：等资源）
- 真实音效素材替换合成音
