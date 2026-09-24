# site-management Specification

## Purpose
为静态网站托管平台提供网站元信息管理的行为规范，覆盖列表查询、信息编辑和删除操作。

## Requirements

### Requirement: 网站列表
系统 MUST 返回所有站点的列表，包含 id、slug、title、description、created_at 字段，按创建时间倒序排列。

#### Scenario: 列表为空
- **WHEN** 数据库中无站点记录
- **THEN** 系统返回空数组

#### Scenario: 正常列表
- **WHEN** 存在 N 个站点
- **THEN** 系统返回 N 条记录，按 created_at 降序

### Requirement: 编辑网站信息
系统 MUST 允许已登录管理员更新站点的 title、description 和 slug（slug 变更需满足唯一性约束）。

#### Scenario: 成功更新
- **WHEN** 管理员提交合法更新数据
- **THEN** 系统更新记录并返回 200 新数据

#### Scenario: slug 冲突
- **WHEN** 更新后的 slug 与已有站点重复
- **THEN** 系统返回 409 DUPLICATE_SLUG

### Requirement: 删除网站
系统 MUST 删除站点记录及其对应文件目录，删除前需二次确认（前端行为），后端接口直接执行删除。

#### Scenario: 成功删除
- **WHEN** 管理员请求删除已存在的站点
- **THEN** 系统删除 DB 记录和文件目录，返回 200

#### Scenario: 站点不存在
- **WHEN** 删除不存在的 slug
- **THEN** 系统返回 404 SITE_NOT_FOUND
