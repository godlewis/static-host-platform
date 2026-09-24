# Spec Delta

## REMOVED Requirements

### Requirement: ZIP 文件上传
**Reason**: 单站点场景不再按 slug 存储；改为覆盖 `uploads/site/` 单一目录。
**Migration**: 由新增的「ZIP 上传与覆盖部署」requirement 取代，调用入口从 `POST /api/sites` 改为 `POST /api/upload`，请求体从 `{ title, slug, file }` 改为 `{ file }`。

### Requirement: Slug 唯一性
**Reason**: 单站点场景无 slug 维度。
**Migration**: 无；上一轮多站点表已归档。

### Requirement: 默认 index.html 识别
**Reason**: 公开路由收敛到根路径，原 requirement 在 site-public 中重新表达。
**Migration**: 由 site-public 的「根路径默认页」requirement 取代。

## ADDED Requirements

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