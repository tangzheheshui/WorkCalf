---
name: release
description: 发版上线 WorkCalf。用户说「发版」「发布」「上线」「出新版本」「升版本」时触发——版本号、tag、CI 出包、官网同步一条龙。用户可以不指定版本号，脚本自动定。
---

# WorkCalf 发版

一条命令搞定：`bash tools/release.sh [版本号]`

用户只说「发版」时**不用问版本号**，直接跑不带参数的脚本：它按上次 tag 以来的提交自动定
——有 `feat` 类改动升次版本（1.1.0 → 1.2.0），其余升补丁（1.1.0 → 1.1.1）。用户明确给了
版本号就用给的。上次 tag 之后只有官网/工具/文档改动时脚本会拒绝并提示改走 `sync-site.sh`。

脚本依次做：

1. 预检：main 分支、工作区干净、SSH 能连上 VPS（连不上直接退出，不白等一次 CI）
2. 版本号三处同步（tauri.conf.json / Cargo.toml / Cargo.lock）；已是目标版本则跳过
3. 提交 + 打 `v*` tag + push；push 失败自动重试 3 次；tag 已存在时，只要它之后的提交只动了 `site/`、`tools/`、`.claude/`、`docs/`、`*.md` 就复用产物（改了会进包的文件则拦下并给出清 tag 命令）
4. 轮询 Release 等四个产物（每 75 秒，直接 HEAD 下载地址，不走 GitHub API；CI 失败靠 workflow badge 连续两轮确认后提前退出，不干等 40 分钟）
5. 四个包下载到 `site/download/`（校验文件大小，防止把错误页当安装包）
6. `sync-site.sh` 同步官网，并自动自检：version.json 版本、每个下载 200、CORS 头

跑完最后一行是 `[完成] vX.Y.Z 已上线`，不需要再手工验证。

## 操作步骤

1. `git status -s` 确认 main 干净；官网/代码改动先提交推上去
2. `bash tools/release.sh`（用户给了版本号就带上），等最后 `[完成]`
3. 汇报：版本号、四个包、官网变化

版本号不用先问用户：没说就自动定，说错了再发一版反而麻烦。

## 中途失败怎么办

直接重跑同一条命令，脚本会从断点继续：

- 版本号已经改过 → 跳过提交
- tag 已经打好（发版中途只又提交了官网/工具/文档改动）→ 复用这套产物
- 已经 push 过 → push 是空操作
- 包已下载、官网已同步 → 覆盖重来

需要手动清 tag 的情况：CI 失败后改了会进包的文件（`src/`、`src-tauri/`、`ui/`、依赖等），想用同一个版本号重发。脚本会列出 tag 之后的改动并给出命令：

    git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z

清掉后重跑即可。不用手动删 Release——同名 asset 会被新一轮 CI 覆盖；远端还没有该 tag 时，脚本也只认本轮新上传的包（按 `Last-Modified` 判断新鲜度），不会拿旧包冒充。

发版成功后再重跑同一个版本号是幂等的（tag 之后的提交只有 site/version.json，属可复用范围），但没必要；只想重新同步官网时直接跑 `SERVER=ubuntu@193.112.26.217 bash tools/sync-site.sh`。

## 已知坑

- Windows workflow 首次跑没有 cargo 缓存，15-20 分钟正常
- **Windows 上 `python3` 可能是应用商店占位程序**：`command -v` 能找到，但一执行就
  `exit 49` 且无输出。脚本现在会实际跑一次 `import sys` 才采用，别再退回只查路径的写法，
  否则轮询会静默地一直显示 `0/4`（v1.1.0 发版就因此白等 17 分钟）
- 轮询计数偶尔会来回跳（`2/4 → 1/4 → 4/4`），是个别 HEAD 请求瞬时失败，以 `4/4` 为准
- CI 失败检测走 badge（约 5 分钟缓存），连续两轮确认，最晚约 10 分钟报错；想立刻看原因就去 Actions 页
- 官网安装包文件名固定（`download/` 下四个），CI 产物已按此命名，不要改
- `site/download/` 不进 git（`site/.gitignore`），本地有包即可同步；sync-site.sh 现在要求两个 Windows 包存在，缺了直接报错
- 官网页面单独改动（不发版）：`SERVER=ubuntu@193.112.26.217 bash tools/sync-site.sh`，它同样会重写 version.json 并自检；`SKIP_VERIFY=1` 可跳过自检
- 脚本在 macOS（BSD sed / python3）和 Windows Git Bash（GNU sed / python）上都能跑，不要再用 `sed -i ''`
