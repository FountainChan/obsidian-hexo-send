# 🚀 Hexo Send

[English](./README.md) | **简体中文**

把写作留在 Obsidian，把繁琐的博客整理工作交给 Hexo Send。📝

Hexo Send 是一个仅支持桌面端的插件。它可以把选中的 Markdown 文件、目录或多选内容预发布到本地 Hexo 仓库，完成图片整理、Hexo 验证并创建一个本地 commit。插件不会偷偷 Push，不执行 `hexo deploy`，也不追踪 GitHub Actions——最后一步始终由你决定。🛡️

## ✨ 功能亮点

- 📂 支持单篇笔记、整个目录、文件树多选和当前笔记。
- 🏷️ 预发布前确认分类，并可编辑标签、keywords、description 和图片 alt。
- 🖼️ 将本地图片整理到 `/images/<abbrlink>/`，并回填 cover 和 top image。
- 🔍 自动检测 Hexo、Node.js、Git、分类映射和 abbrlink 配置。
- 🤖 AI 元数据建议完全可选；不配置 AI 也能使用全部核心流程。
- ✅ 先执行两阶段 Hexo 验证，再精确暂存本次文章和图片并创建单个 commit。
- 🚦 Commit 后显示“已提交，尚未推送”，只有再次确认才会 Push。

## 📋 运行要求

- 桌面版 Obsidian 1.13.0 或更高版本。
- 已安装依赖且可信的本地 Hexo Git 仓库。
- 仓库中存在 `node_modules/hexo/bin/hexo`，并已配置 `hexo-abbrlink`。
- 桌面系统可以使用 Node.js 和 Git。

插件不会通过 `npx` 自动下载或执行缺失的 Hexo。找不到仓库本地 Hexo CLI 时，环境检测会阻止预发布，并提示你自行安装仓库依赖。

## 📥 安装

### 社区插件市场

审核上架后，在 Obsidian 中打开“设置 → 第三方插件 → 浏览”，搜索 **Hexo Send** 并安装即可。🎉

### Beta 或手动安装

- 使用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 添加仓库 `FountainChan/obsidian-hexo-send` 参与 Beta 测试。
- 手动安装时，从同一个 [GitHub Release](https://github.com/FountainChan/obsidian-hexo-send/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`，放入 `<vault>/.obsidian/plugins/hexo-send/`，重新加载 Obsidian 后启用插件。

## 🧭 使用流程

1. 在插件设置中填写 Hexo 仓库路径，点击“重新检测”。
2. 在文件树中右键 Markdown、目录或多选，选择“预发布到 Hexo…”。
3. 检查标题、分类、标签、keywords、description、图片 alt 和冲突动作。
4. 点击“生成并提交”。成功后状态为“已提交，尚未推送”。
5. 只有需要时才在结果页点击 Push。

## 🔐 安全、隐私与高权限能力

Hexo Send 仅支持桌面端，因为核心流程需要把 Obsidian 连接到本地 Hexo 工具链。社区目录可能会针对以下能力显示文件系统和进程执行 Warning。

### 直接文件系统访问

- 插件使用 Node.js 文件系统 API 读写用户明确选择的本地 Hexo 仓库。
- 源笔记通过 Obsidian Vault API 读取；插件可能读取被选中文章引用的 Vault 附件，以便复制到 Hexo 仓库，但不会修改源笔记。
- 崩溃恢复记录和文件备份保存在操作系统临时目录中。
- 仓库相对路径在读取、写入、复制和恢复前都会检查路径穿越、目录链接和最终目标符号链接。
- Git 暂存区会与精确路径白名单核对，禁止 `git add .`。

### 进程执行

- 插件会从系统 `PATH` 解析并启动 Git 和 Node.js，解析程序路径时不会把所选仓库作为搜索位置；Node.js 只执行该仓库中已经安装的 Hexo CLI。
- 远程图片通过流式 Node.js HTTP(S) 客户端下载；每次连接固定到已经验证的公网 IP，每一次重定向都会重新验证。
- 所有进程都使用 `shell: false` 和独立参数数组，不会把文章内容拼接成 Shell 命令。
- Hexo 插件、Hexo 主题和 Git hooks 都属于可执行代码。请只使用可信的仓库、依赖和 hooks。
- 插件执行 `hexo clean`、`hexo generate --bail` 以及范围受控的 Git 检测、暂存、commit 和 push 命令。只有用户明确确认后才会执行 `git push`。

### 剪贴板

插件不调用系统 Clipboard API。诊断详情会显示在只读文本框中，需要复制时由用户使用操作系统的普通快捷键手动完成。

### 网络与 AI

- 只有选中文章引用远程图片时才会下载；本机地址、私网地址、不安全重定向、非图片响应和超过 20 MB 的文件都会被拒绝。
- 只有用户点击 Push 后，Git 才会连接已配置的远端。
- 启用可选 AI 功能后，完整文章正文以及候选分类和标签会发送到用户配置的 OpenAI-compatible endpoint。API key 只保存在 Obsidian SecretStorage。
- 插件不包含客户端遥测、广告或后台自动更新逻辑。

## 🧰 开发

```powershell
npm install
npm run verify
```

常用命令：

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify`
- `npm run package`

## 🎁 发布版本

推送与 `package.json`、`manifest.json` 版本完全一致且不带 `v` 前缀的标签后，GitHub Actions 会执行完整质量门、生成构建产物证明，并且只上传 Obsidian 支持的三个文件：

- `main.js`
- `manifest.json`
- `styles.css`

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

详细设计见 [`docs/plans/2026-08-08-technical-development-plan.md`](./docs/plans/2026-08-08-technical-development-plan.md)。
