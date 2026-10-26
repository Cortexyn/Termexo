# 在 GitHub Actions 构建 Windows 安装包

在仓库的 **Actions → Build Windows installers → Run workflow** 中选择分支并启动。
工作流在 Windows x64 主机上准备 Node.js、Rust 和 MSVC，运行 Rust 单元测试，
再构建 NSIS EXE 和 MSI 两种安装包。

完成后在该次运行页面的 **Artifacts** 下载
`Termexo-Windows-x86_64-pc-windows-msvc`，其中包含：

- `Termexo_版本号_x64-setup.exe`
- `Termexo_版本号_x64_en-US.msi`
- `SHA256SUMS.txt`
- 记录版本、源码提交、架构和签名状态的 `build-info.json`

工作流检查应用的 x64 PE 架构、可执行文件版本、MSI 版本和架构，并生成 SHA-256 校验和。
下载保留 14 天；需要时可以重新手动构建。当前没有配置 Windows 代码签名证书。
工作流只上传 Actions 产物，不安装应用，也不创建或修改 GitHub Release。

工作流直接调用跨平台 Tauri CLI 包装脚本，通过 MSVC Action 获取构建环境，
不依赖本机 `scripts/tauri-msvc.cmd` 中固定的 Visual Studio 路径。

也可以通过已登录的 GitHub CLI 启动：

```bash
gh workflow run windows-build.yml --ref main
gh run list --workflow windows-build.yml
gh run download RUN_ID --dir windows-installers
```

macOS 的 Apple Silicon 和 Intel 构建见 [macOS 打包说明](macos-build.md)。

## 免费开源签名（SignPath）

当前处于申请准备阶段，还未获批，也没有可用的正式签名凭据。
普通构建保持可用；不要把准备好的工作流当作已经获得证书。

审核通过后，在仓库中配置一个 Actions Secret：

- `SIGNPATH_API_TOKEN`：只具备提交签名请求权限的 CI 用户令牌。

同时配置以下 Actions Variables，值以 SignPath 批准的项目配置为准：

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_APP_ARTIFACT_CONFIGURATION_SLUG`
- `SIGNPATH_INSTALLERS_ARTIFACT_CONFIGURATION_SLUG`
- `SIGNPATH_CERTIFICATE_THUMBPRINT`：正式签名证书的 40 位指纹。

由 SignPath 配置 GitHub 来源验证，并按其要求连接本仓库。
主程序和安装包分别使用两个 ZIP 类型的制品配置：主程序 ZIP 根目录包含
`termexo.exe`，安装包 ZIP 根目录包含本项目的 EXE 和 MSI。
不得使用本项目证书重新签署第三方组件。

然后在 **Run workflow** 勾选 **Sign with SignPath**，或执行：

```bash
gh workflow run windows-build.yml --ref main -f sign=true
```

签名流程先构建并签署主程序，再打包，最后签署两个安装包。
这需要在 SignPath 人工批准相应请求，工作流每个阶段最多等待 30 分钟。
签名成功后上传的产物名称带 `-signed` 后缀，并在签名完成后重新生成校验和。
缺少配置、证书不符、签名不受信任或缺少时间戳时，工作流会停止。

签名政策见 [Code signing policy](code-signing-policy.md)，网络与数据说明见
[Privacy and network connections](privacy.md)。
