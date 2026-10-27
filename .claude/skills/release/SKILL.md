---
name: release
description: 发版上线 WorkCalf。用户说「发版」「上线」「出新版本」「升版本」时触发——版本号、tag、CI 出包、官网同步一条龙。
---

# WorkCalf 发版

一条命令搞定：`bash tools/release.sh <版本号>`

脚本依次做：

1. 预检：main 分支、工作区干净、SSH 能连上 VPS（连不上直接退出，不白等一次 CI）
2. 版本号三处同步（tauri.conf.json / Cargo.toml / Cargo.lock）；已是目标版本则跳过
3. 提交 + 打 `v*` tag + push；push 失败自动重试 3 次，tag 已指向当前提交则复用
4. 轮询 Release 等四个产物（每 75 秒，直接 HEAD 下载地址，不走 GitHub API；CI 失败靠 workflow badge 连续两轮确认后提前退出，不干等 40 分钟）
5. 四个包下载到 `site/download/`（校验文件大小，防止把错误页当安装包）
6. `sync-site.sh` 同步官网，并自动自检：version.json 版本、每个下载 200、CORS 头

跑完最后一行是 `[完成] vX.Y.Z 已上线`，不需要再手工验证。

## 操作步骤

1. `git status -s` 确认 main 干净；官网/代码改动先提交推上去
2. 跟用户确认版本号（有新功能升次版本号，如 1.1.0 → 1.2.0）
3. `bash tools/release.sh <版本号>`，等最后 `[完成]`
4. 汇报：版本号、四个包、官网变化

## 中途失败怎么办

直接重跑同一条命令，脚本会从断点继续：

- 版本号已经改过 → 跳过提交
- tag 已经打好且指向当前提交 → 跳过打 tag
- 已经 push 过 → push 是空操作
- 包已下载、官网已同步 → 覆盖重来

唯一需要手动清 tag 的情况：CI 失败后改了代码，想用同一个版本号重发（tag 还指向旧提交）。脚本会直接给出命令：

    git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z

清掉后重跑即可。不用手动删 Release——同名 asset 会被新一轮 CI 覆盖；远端还没有该 tag 时，脚本也只认本轮新上传的包，不会拿旧包冒充。

成功发完之后不要再重跑同一个版本号（tag 已指向旧提交，脚本会拦下）；如果只是想重新同步官网，直接跑 `SERVER=ubuntu@193.112.26.217 bash tools/sync-site.sh`。

## 已知坑

- Windows workflow 首次跑没有 cargo 缓存，15-20 分钟正常
- CI 失败检测走 badge（约 5 分钟缓存），连续两轮确认，最晚约 10 分钟报错；想立刻看原因就去 Actions 页
- 官网安装包文件名固定（`download/` 下四个），CI 产物已按此命名，不要改
- `site/download/` 不进 git（`site/.gitignore`），本地有包即可同步；sync-site.sh 现在要求两个 Windows 包存在，缺了直接报错
- 官网页面单独改动（不发版）：`SERVER=ubuntu@193.112.26.217 bash tools/sync-site.sh`，它同样会重写 version.json 并自检；`SKIP_VERIFY=1` 可跳过自检
- 脚本在 macOS（BSD sed / python3）和 Windows Git Bash（GNU sed / python）上都能跑，不要再用 `sed -i ''`
