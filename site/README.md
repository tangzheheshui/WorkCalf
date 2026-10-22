# 官网 / 下载页

地址：<https://workcalf.app.tangzheheshui.cn/>

纯静态页面，无构建步骤。整个 `site/` 目录上传到任意静态托管即可
（GitHub Pages、Cloudflare Pages、Vercel、OSS/COS 等）。

目录里所有版本信息都来自 `version.json`，下载页和客户端「检查更新」共用这一份清单。

## 下载区

两个平台卡片，四个按钮：

| 平台 | 按钮 | 产物 |
| --- | --- | --- |
| Windows | 64 位便携版（主推） | `download/WorkCalf.exe` |
| Windows | 64 位安装版 | `download/WorkCalf-Setup.exe` |
| macOS | Apple 芯片版 | 暂未发布，按钮置灰 |
| macOS | Intel 芯片版 | 暂未发布，按钮置灰 |

文件名固定，`version.json` 里的地址就不用每次发版都改。

## 发版流程

1. 构建：`cd src-tauri && tauri build --bundles nsis`
   产出 `target/release/workcalf.exe`（便携版）和
   `target/release/bundle/nsis/WorkCalf_<版本>_x64-setup.exe`（安装版）。
2. 拷到固定文件名：`site/download/WorkCalf.exe`、`site/download/WorkCalf-Setup.exe`
3. `version.json`：

   ```json
   {
     "version": "1.1.0",
     "updated": "2026-11-01",
     "url": "download/WorkCalf.exe",
     "urls": {
       "win_portable": "download/WorkCalf.exe",
       "win_setup": "download/WorkCalf-Setup.exe"
     },
     "notes": "这一版改了什么"
   }
   ```

   `url` 是主推链接，客户端「检查更新」用它；`urls` 按按钮的 `data-key`
   对应到具体产物。都可以写相对路径。
4. 同时把 `src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 的
   `version` 改成同一个版本号，再重新打包上传。
5. 部署整个 `site/`。

第 1～3 步可以交给脚本：`SERVER=user@vps bash tools/sync-site.sh local`。
版本号从 `tauri.conf.json` 读取，`updated` 自动填当天；
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
