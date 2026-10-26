---
name: release
description: 发版上线 WorkCalf。用户说「发版」「上线」「出新版本」「升版本」时触发——版本号、tag、CI 出包、官网同步一条龙。
---

# WorkCalf 发版

核心是一条命令，已固化为 `tools/release.sh`，它会做完所有事：

1. 版本号三处同步（tauri.conf.json / Cargo.toml / Cargo.lock）
2. 提交 + 打 `v*` tag + push（tag 同时触发 build-macos / build-windows 两个 workflow）
3. 轮询 GitHub Release，等四个产物挂齐（mac dmg ×2 + Windows exe ×2，上限 40 分钟）
4. 四个包下载到 `site/download/` 固定文件名
5. `tools/sync-site.sh` rsync 整个 `site/` 到 VPS（`ubuntu@193.112.26.217:/var/www/workcalf`，本机已配免密）

## 操作步骤

1. `git status -s` 确认 main 干净；有未提交的官网/代码改动，先提交推上去
2. 跟用户确认版本号（有新功能升次版本号，如 1.1.0 → 1.2.0）
3. 跑 `bash tools/release.sh <版本号>`，等到最后 `[OK] 已同步到 …`
4. 线上验证四件事：
   - `curl -s https://workcalf.app.tangzheheshui.cn/version.json` 的 `version` 是新版
   - 四个下载产物 `curl -sI` 都是 200（download/WorkCalf.exe、WorkCalf-Setup.exe、WorkCalf-mac-arm64.dmg、WorkCalf-mac-x64.dmg）
   - 官网首页内容改动的部分正常显示
   - version.json 响应头带 `Access-Control-Allow-Origin: *`（应用内检查更新靠它）
5. 向用户汇报：新版本号、四个包、官网变化

## 已知坑

- push 偶发 GitHub `Internal Server Error`：等几秒重跑脚本即可（tag 已存在会报错，先 `git tag -d` + `git push origin :refs/tags/<tag>` 清掉重推）
- Windows workflow 首次跑没有 cargo 缓存，15-20 分钟属正常，别急着判失败
- 官网安装包文件名固定（`download/` 下四个），CI 产物已按此命名，不要改
- `site/download/` 里的安装包不进 git（只有 .gitkeep），本地有包即可同步
- 官网页面单独改动（不发版）：直接 `SERVER=ubuntu@193.112.26.217 bash tools/sync-site.sh`，注意它会用 tauri.conf.json 的版本号重写 version.json
