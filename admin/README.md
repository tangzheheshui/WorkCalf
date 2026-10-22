# 统一后台

地址：<https://admin.app.tangzheheshui.cn/>

一个静态页面，不跑服务进程：登录和反馈数据都直接走 PocketBase
（`auth.tangzheheshui.cn`）的 REST API。

## 登录

账号填 `admin` 即可（页面会自动补成 `admin@tangzheheshui.cn`，PocketBase
超管只认邮箱格式），密码与 `auth.tangzheheshui.cn/_/` 相同。
token 存在浏览器 localStorage，过期后页面会提示重新登录。

## 页面

- **反馈**：读 `wc_feedback` 集合，给 WorkCalf 的「意见反馈」用。
  客户端 POST 到
  `https://auth.tangzheheshui.cn/api/collections/wc_feedback/records`。
- **应用**：各站点 / 现有后台的入口，目前是写死在 `index.html` 里的链接，
  加新应用直接改那块 `.app-grid`。
- **账号**：跳 PocketBase 自带管理界面。

## 集合规则（重要）

`wc_feedback`：

| 规则 | 值 | 说明 |
| --- | --- | --- |
| create | `""`（公开） | 客户端不需要登录就能提交 |
| list / view / update / delete | `null` | 只有超管能看，后台靠超管 token 读 |

集合由迁移创建：
`/opt/pocketbase/pb_migrations/<ts>_created_wc_feedback.js`。
以后加别的应用的反馈，照这个迁移复制一份、改集合名即可，
后台再加一个导航项。

## 部署

```bash
scp admin/index.html ubuntu@<server>:/var/www/admin-app/index.html
```

nginx 站点：`/etc/nginx/sites-available/tan-admin`，
证书：`certbot certonly --webroot -w /var/www/certbot -d admin.app.tangzheheshui.cn`。
