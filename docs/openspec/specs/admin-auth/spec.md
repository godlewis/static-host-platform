# admin-auth Specification

## Purpose
为静态网站托管平台提供管理员认证与密码重置的行为规范，覆盖登录、Session 管理、邮箱密码找回等核心能力。

## Requirements

### Requirement: 管理员登录
系统 MUST 接受用户名和密码，验证成功后建立 Session 并返回成功响应；凭证错误时返回 401。

#### Scenario: 成功登录
- **WHEN** 管理员提交有效用户名和密码
- **THEN** 系统返回 200，Session 已建立，后续请求无需重复认证

#### Scenario: 密码错误
- **WHEN** 管理员提交错误密码
- **THEN** 系统返回 401，不泄露用户名是否存在

#### Scenario: 未登录访问受保护路由
- **WHEN** 未认证请求访问管理 API
- **THEN** 系统返回 401 AUTH_REQUIRED

### Requirement: 密码重置令牌生成
系统 SHALL 在收到重置请求后生成一次性令牌，设置 60 分钟过期时间，并通过 SMTP 发送邮件（SMTP 未配置时返回 200 但不实际发送）。

#### Scenario: 有效邮箱请求重置
- **WHEN** 用户提供已注册邮箱
- **THEN** 系统生成令牌并存入 reset_tokens 表，返回 200

#### Scenario: 不存在邮箱请求重置
- **WHEN** 用户提供未注册邮箱
- **THEN** 系统仍返回 200（不泄露邮箱是否存在）

#### Scenario: SMTP 未配置
- **WHEN** 邮件服务未初始化
- **THEN** 系统返回 200，控制台输出警告日志

### Requirement: 密码重置执行
系统 MUST 验证令牌有效（存在、未过期、与邮箱匹配），验证通过后允许设置新密码。

#### Scenario: 有效令牌重置密码
- **WHEN** 用户提交有效令牌和新密码
- **THEN** 系统更新密码哈希，删除令牌，返回 200

#### Scenario: 令牌已过期
- **WHEN** 用户提交超过 60 分钟的令牌
- **THEN** 系统返回 400 INVALID_TOKEN

#### Scenario: 令牌已被使用
- **WHEN** 用户重复使用同一令牌
- **THEN** 系统返回 400 INVALID_TOKEN

### Requirement: 登出
系统 MUST 销毁当前 Session 并返回成功响应。

#### Scenario: 正常登出
- **WHEN** 已登录用户请求登出
- **THEN** Session 被清除，返回 200
