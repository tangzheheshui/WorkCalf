# 官网 / 下载页

地址：<https://workcalf.app.tangzheheshui.cn/>

纯静态页面，无构建步骤。整个 `site/` 目录上传到任意静态托管即可
（GitHub Pages、Cloudflare Pages、Vercel、OSS/COS 等）。

目录里所有版本信息都来自 `version.json`，下载页和客户端「检查更新」共用这一份清单。

## 下载区

两个平台卡片，四个按钮：

| 平台 | 按钮 | 产物 | 来源 |
| --- | --- | --- | --- |
| Windows | 64 位便携版（主推） | `download/WorkCalf.exe` | GitHub Actions |
| Windows | 64 位安装版 | `download/WorkCalf-Setup.exe` | GitHub Actions |
| macOS | Apple 芯片版 | `download/WorkCalf-mac-arm64.dmg` | GitHub Actions |
| macOS | Intel 芯片版 | `download/WorkCalf-mac-x64.dmg` | GitHub Actions |

文件名固定，`version.json` 里的地址就不用每次发版都改。

四个包全部由 GitHub Actions 构建：push `v*` tag 触发 `build-macos.yml` /
`build-windows.yml`，产物挂到 GitHub Release
（`https://github.com/tangzheheshui/WorkCalf/releases`），发版脚本再按固定文件名
下载到 `site/download/`。

## 发版流程

一条命令：

```bash
bash tools/release.sh 1.2.0
```

它会串起整条链路：改三处版本号并提交 → 打 tag 推送 → 等 CI 出四个包 →
下载到 `site/download/` → 生成 `version.json` → 同步 `site/` 到服务器 → 线上自检
（版本号、四个下载链接、CORS）。中途失败可直接重跑同一条命令，细节和排错见
`.claude/skills/release/SKILL.md`。

只改官网页面、不发版时，单独跑：

```bash
SERVER=ubuntu@193.112.26.217 bash tools/sync-site.sh
```

它会用 `tauri.conf.json` 里的版本号重写 `version.json`，同步后检查线上版本和下载链接；
本机没有 rsync 时自动退回 `tar | ssh`。

## 应用内检查更新

已配置在 `ui/settings.js`：

```js
const UPDATE_URL = 'https://workcalf.app.tangzheheshui.cn/version.json';
```

设置面板里的「官网 / 下载」和「去下载」都由它推导/跳转。

客户端会读取 `version` 做比较，有新版本时显示「去下载」，点击用系统浏览器
打开 `url`。

## 部署要求

- 必须是 HTTPS。
- `version.json` 需要允许跨域访问，返回头里带
  `Access-Control-Allow-Origin: *`，否则应用内检查更新会被拦。
  GitHub Pages / Cloudflare Pages 默认满足；对象存储需要手动配置。
- `version.json` 建议设置较短的缓存时间（或 `Cache-Control: no-store`），
  发版后客户端才能马上读到新版本号。
- 安装包二进制不要提交进 git，`download/` 下只保留 `.gitkeep`。
