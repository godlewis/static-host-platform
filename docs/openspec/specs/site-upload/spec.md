# site-upload Specification

## Purpose
为静态网站托管平台提供 ZIP 文件上传与解压部署的行为规范，确保文件路径安全、格式合法、部署可靠。

## Requirements

### Requirement: ZIP 上传与覆盖部署
系统 MUST 在 `POST /api/upload` 接收 multipart/form-data 的 ZIP 文件，校验扩展名为 .zip 且大小不超过 100MB，解压前逐 entry 校验 `path.normalize(entryName)` 不得以 `..` 开头且不得为绝对路径；解压前清空 `uploads/site/`，解压成功后返回 201。

#### Scenario: 上传合法 ZIP
- **WHEN** 已登录管理员上传 ≤100MB 有效 ZIP
- **THEN** 系统解压到 `uploads/site/`、返回 201

#### Scenario: 上传超过 100MB
- **WHEN** 上传文件大小超过 100MB
- **THEN** 系统返回 400 `FILE_TOO_LARGE`

#### Scenario: 非 ZIP 扩展名
- **WHEN** 上传文件扩展名不是 .zip
- **THEN** 系统返回 400 `INVALID_FILE_TYPE`

#### Scenario: ZIP 含路径遍历
- **WHEN** ZIP 中任意 entry 路径以 `..` 开头或为绝对路径
- **THEN** 系统拒绝解压并返回 400 `PATH_TRAVERSAL`，且不修改 `uploads/site/`

### Requirement: 上传覆盖语义
系统 MUST 在解压前清空 `uploads/site/` 中所有旧文件与子目录；解压失败时回滚到解压前快照（保留旧内容）。

#### Scenario: 二次上传覆盖
- **WHEN** 已登录管理员上传新 ZIP
- **THEN** 系统解压后 `uploads/site/` 仅含新 ZIP 的内容，旧文件不残留

#### Scenario: 解压失败回滚
- **WHEN** 解压过程中抛异常
- **THEN** 系统把 `uploads/site/` 还原到上传前状态
