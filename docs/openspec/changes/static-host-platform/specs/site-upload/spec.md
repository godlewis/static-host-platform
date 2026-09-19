# Spec Delta

## Purpose

为静态网站托管平台提供 ZIP 文件上传与解压部署的行为规范，确保文件路径安全、格式合法、部署可靠。

## ADDED Requirements

### Requirement: ZIP 文件上传
系统 MUST 接受 multipart/form-data 上传的 ZIP 文件，校验大小不超过 100MB，验证扩展名为 .zip，解压后存储到 uploads/{slug}/ 目录。

#### Scenario: 成功上传合法 ZIP
- **WHEN** 管理员上传 ≤100MB 的有效 ZIP 文件并提供 title 和 slug
- **THEN** 系统解压文件、创建站点记录、返回 201 及站点信息

#### Scenario: 文件超过 100MB
- **WHEN** 上传文件大小超过 100MB
- **THEN** 系统返回 400 FILE_TOO_LARGE

#### Scenario: 非 ZIP 文件
- **WHEN** 上传非 .zip 扩展名的文件
- **THEN** 系统返回 400 INVALID_FILE_TYPE

#### Scenario: ZIP 内含路径遍历
- **WHEN** ZIP 中存在 entries 的 entryName 包含 ".." 或绝对路径
- **THEN** 系统拒绝上传，返回 400 PATH_TRAVERSAL

### Requirement: Slug 唯一性
系统 MUST 确保同一 slug 在同一租户下唯一，重复创建时返回 409 DUPLICATE_SLUG。

#### Scenario: 重复 slug
- **WHEN** 使用已存在的 slug 创建新站点
- **THEN** 系统返回 409 DUPLICATE_SLUG

### Requirement: 默认 index.html 识别
系统 MUST 在解压后识别 index.html 作为默认入口，公开访问 slug 根路径时自动提供 index.html。

#### Scenario: 访问站点根路径
- **WHEN** 用户 GET /sites/:slug（无 path）
- **THEN** 系统返回该站点的 index.html（若存在）
