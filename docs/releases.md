# GitHub Actions 自动发布

工作流：`.github/workflows/release.yml`（**Release desktop and npm**）。
推送稳定版本标签 `vX.Y.Z` 后自动执行；也可在 Actions 选择同一个版本标签手动重试。
在分支上手动运行会被版本校验拒绝。

## 发布内容

- Windows x64：NSIS EXE、MSI。
- macOS：Apple Silicon、Intel 的 DMG 与 `.app.tar.gz`。
- npm：`termexo`，内含同一次 Windows 构建的主程序及 ConPTY 组件，以及两种 macOS 架构的完整应用压缩包。
- GitHub Release：以上文件、各平台构建记录和统一的 `SHA256SUMS.txt`。

前端单元测试与所有平台的 Rust 测试通过后，工作流校验安装包和 npm 包的版本、
源码提交、目标架构及校验和，先上传草稿 Release，再发布 npm，最后公开 Release。
npm 使用 OIDC 和来源证明，不需要保存长期 npm 令牌。

Windows 和 Mac 均可使用 `npx termexo` 或 `npm install --global termexo`。
Mac 首次启动时按 Node.js 架构选择应用，将其解压到
`~/Library/Caches/Termexo/npm/` 后通过系统 `open` 命令启动。
解压保留权限、符号链接、应用资源和签名，无需运行时下载。
macOS 构建任务会验证解压后的可执行权限、架构和签名。

## npm 首次配置

在 npm 包 `termexo` 的 **Settings → Trusted Publisher** 添加：

| 字段                 | 值                  |
| -------------------- | ------------------- |
| Publisher            | GitHub Actions      |
| Organization or user | `gemron`            |
| Repository           | `Termexo`           |
| Workflow filename    | `release.yml`       |
| Environment name     | `npm`               |
| Allowed actions      | Allow `npm publish` |

GitHub 仓库的 `npm` environment 应只允许 `v*` 标签部署。
不需要勾选独立的 `npm dist-tag` 管理权限。

官方说明：[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)。

## 每次发布

1. 同步根目录、前端、npm 包、Tauri 和 Cargo 的版本及锁文件。
2. 更新中英文 changelog，并新增 `docs/releases/vX.Y.Z.md` 发布说明。
3. 提交并推送源码，再创建并推送同版本标签，例如：

```bash
git tag -a v0.11.0 -m "Termexo v0.11.0"
git push origin v0.11.0
```

失败后可重跑失败任务。已发布的 npm 版本无法覆盖；重试只接受校验值完全相同的包。
已公开的 GitHub Release 不会被工作流覆盖。

## 签名状态

当前 Windows 安装包未正式签名，macOS 使用 ad-hoc 签名、没有 Apple 公证。
SignPath 审核通过并完成配置后，可设置仓库变量 `RELEASE_SIGN_WINDOWS=true`，
自动发布即改用已准备的签名流程；每次签名仍需在 SignPath 人工批准。
详见 [Windows 签名说明](windows-build.md)与 [macOS 构建说明](macos-build.md)。
