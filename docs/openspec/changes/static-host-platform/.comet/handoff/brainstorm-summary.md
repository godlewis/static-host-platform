# Brainstorm Summary

- Change: static-host-platform
- Date: 2026-09-19

## 确认的技术方案

- **双端口架构**：两个独立 Express 实例（3001 admin / 3000 public），同一进程内启动
- **认证**：express-session + bcryptjs，Session 内存存储（24h 过期）
- **文件存储**：ZIP 解压到 uploads/{slug}/，路径安全校验防遍历
- **前端**：Vanilla JS + Tailwind CSS CDN，SPA 单页（登录/主界面切换）
- **预览**：管理后台内嵌 iframe 加载 http://localhost:3000/sites/{slug}
- **Docker**：node:20-alpine 多阶段构建，docker-compose 管理卷（uploads/ + data/）

## 关键取舍与风险

- 内存 Session：重启失效 → 单管理员场景可接受
- SQLite WAL 模式：防止并发写锁，单管理员几乎无竞争
- ZIP 炸弹防护：adm-zip 内置限制，100MB 上传上限
- HTTPS 外置：由反向代理负责，Node.js 不内嵌 TLS

## 测试策略

- 冒烟测试：登录 → 上传 → 访问 → 删除全流程
- 安全验证：路径遍历、未认证访问、令牌过期
- Docker 端到端：compose up -d → 功能验证

## Spec Patch

无。现有 delta spec 已覆盖全部需求，无需回写。
