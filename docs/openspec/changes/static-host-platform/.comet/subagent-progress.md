# Comet subagent checkpoint — change static-host-platform

plan: docs/superpowers/plans/2026-09-23-static-host-platform.md
review_mode: standard
build_mode: subagent-driven-development
tdd_mode: tdd
isolation: branch (feature/20260923/static-host-platform)
current_plan_task_index: 2
current_phase: implementing
open_findings: []
review_fix_round: {}

## Plan tasks (linear)

| # | 唯一任务文本 | OpenSpec 映射 | 风险信号 |
|---|---|---|---|
| 1 | Task 1: 应用工厂与双端口入口 | 1.1 双端口启动 + 1.2 npm install | 否 |
| 2 | Task 2: 认证中间件与登录/登出 | 2.1 认证中间件 + 2.2 login + 2.3 logout | 是（认证） |
| 3 | Task 3: 密码找回与重置 | 2.4 forgot-password + 2.5 reset-password | 是（密码） |
| 4 | Task 4: ZIP 上传（Multer 中间件 + 上传路由 + slug 冲突） | 3.1 upload 中间件 + 3.2 POST /sites + 3.3 slug 冲突 | 是（路径安全） |
| 5 | Task 5: 站点管理 CRUD | 4.1-4.4 list/get/put/delete | 否 |
| 6 | Task 6: 公开静态文件服务 | 5.1-5.3 公开服务 + 路径校验 | 是（路径安全） |
| 7 | Task 7: 前端管理界面 | 6.1-6.5 admin.html + admin.js | 否 |
| 8 | Task 8: Docker 生产部署 | 7.1-7.4 Dockerfile + compose + ignore + .env | 是（部署） |
| 9 | Task 9: 集成与验收 | 8.1-8.3 冒烟 + 安全 + Docker | 否 |

## Current state

Task 1: complete (commit 3c4913b, 133 lines added, no risk signals, no DONE_WITH_CONCERNS; review_mode=standard → no per-task reviewer needed)
Task 2 implementer: 待派发 (risk signal hit: 认证 = 安全敏感面 → reviewer will be dispatched after implementer report)