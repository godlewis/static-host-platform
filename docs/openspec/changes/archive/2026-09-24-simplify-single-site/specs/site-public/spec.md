# Spec Delta

## MODIFIED Requirements

### Requirement: 按 slug 提供静态文件
系统 MUST 在端口 3000 上响应请求，从 `uploads/site/` 目录提供对应文件，Content-Type 根据文件扩展名自动设置。

#### Scenario: 请求存在的文件
- **WHEN** 用户访问已存在的静态文件
- **THEN** 系统返回文件的实际内容，Content-Type 由扩展名决定

#### Scenario: 请求不存在的文件
- **WHEN** 用户访问不存在的文件
- **THEN** 系统返回 404

#### Scenario: 站点不存在
- **WHEN** 用户访问未部署的站点文件
- **THEN** 系统返回 404

### Requirement: 站点根路径默认页
系统 MUST 在访问站点根路径时自动提供 `uploads/site/index.html`；若不存在则返回 404。

#### Scenario: 存在 index.html
- **WHEN** 用户 GET /
- **THEN** 系统返回 index.html 内容

#### Scenario: 不存在 index.html
- **WHEN** 用户 GET /，且无 index.html
- **THEN** 系统返回 404

### Requirement: 无需认证
系统 MUST 对所有公开端请求不检查 Session 或 Token。

#### Scenario: 未登录访问
- **WHEN** 匿名用户访问已托管站点
- **THEN** 系统正常返回文件内容

### Requirement: 路径安全
系统 MUST 防止路径遍历攻击，禁止通过 ../ 访问 uploads 目录以外的文件。

#### Scenario: 路径遍历尝试
- **WHEN** 用户请求包含 ../ 的路径
- **THEN** 系统返回 400 PATH_TRAVERSAL