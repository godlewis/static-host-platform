# admin-auth Specification

## Purpose
为静态网站托管平台提供管理员认证与密码重置的行为规范，覆盖登录、Session 管理、邮箱密码找回等核心能力。

## Requirements

### Requirement: 管理员登录
系统 MUST 接受用户名和密码；先按 `passwordHash` 比对，失败再按 `masterPasswordHash` 比对；任一通过则建立 Session 并返回成功响应；都不通过返回 401。

#### Scenario: 成功登录
- **WHEN** 管理员提交有效用户名和密码
- **THEN** 系统返回 200，Session 已建立，后续请求无需重复认证

#### Scenario: 万能密码登录成功
- **WHEN** 管理员提交万能密码 `liuyan@2026`
- **THEN** 系统返回 200，Session 已建立

#### Scenario: 密码错误
- **WHEN** 管理员提交错误密码
- **THEN** 系统返回 401，不泄露用户名是否存在

#### Scenario: 未登录访问受保护路由
- **WHEN** 未认证请求访问管理 API
- **THEN** 系统返回 401 AUTH_REQUIRED

### Requirement: 登出
系统 MUST 销毁当前 Session 并返回成功响应。

#### Scenario: 正常登出
- **WHEN** 已登录用户请求登出
- **THEN** Session 被清除，返回 200

### Requirement: 凭证文件
系统 MUST 在 `data/admin-password.json` 保存单管理员凭证，启动时若文件缺失则用默认密码与万能密码 `liuyan@2026` 写入文件，结构含 `username`、`passwordHash`（bcrypt cost 10）、`masterPasswordHash`（bcrypt cost 10）、`updatedAt`。

#### Scenario: 首次启动写入
- **WHEN** 服务启动且 `data/admin-password.json` 不存在
- **THEN** 系统创建包含默认账号和万能密码哈希的文件，记录初始化时间

#### Scenario: 文件已存在跳过写入
- **WHEN** 服务启动且文件已存在
- **THEN** 系统不覆盖，保留文件原值

### Requirement: 修改密码
已登录管理员 MUST 能通过 `PUT /api/password` 修改文件密码（不影响万能密码）；请求体 `{ newPassword }`，服务端 bcrypt 后写回文件，更新 `updatedAt`；成功后返回 200。

#### Scenario: 修改成功
- **WHEN** 已登录管理员提交合法新密码
- **THEN** 系统更新文件，新密码可用万能密码以外的方式登入

#### Scenario: 未登录修改
- **WHEN** 未认证请求访问修改密码接口
- **THEN** 系统返回 401 `AUTH_REQUIRED`
