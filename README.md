# 🚀 Hexo Send

把写作留在 Obsidian，把繁琐的博客整理工作交给 Hexo Send。📝

Hexo Send 是一个仅支持桌面端的 Obsidian 插件。它可以把选中的 Markdown 文件、目录或多选内容预发布到本地 Hexo 仓库，完成图片整理、Hexo 验证并创建一个本地 commit。插件不会偷偷 Push，不执行 `hexo deploy`，也不追踪 GitHub Actions——最后一步始终由你决定。🛡️

## ✨ 功能亮点

- 📂 支持单篇笔记、整个目录、文件树多选和当前笔记。
- 🏷️ 预发布前确认分类，并可编辑标签、keywords 和 description。
- 🖼️ 将本地图片整理到 `/images/<abbrlink>/`，检查图片 alt、cover 和 top image。
- 🔍 自动检测 Hexo、Node.js、Git、分类映射和 abbrlink 配置。
- 🤖 AI 元数据建议完全可选；不配置 AI 也能使用全部核心流程。
- ✅ 先执行两阶段 Hexo 验证，再精确暂存本次文章和图片并创建单个 commit。
- 🚦 Commit 后明确显示“已提交，尚未推送”，只有再次确认才会 Push。

## 📥 安装

### 社区插件市场

审核上架后，在 Obsidian 中打开“设置 → 第三方插件 → 浏览”，搜索 **Hexo Send** 并安装即可。🎉

### Beta 或手动安装

1. 从 [GitHub Releases](https://github.com/FountainChan/obsidian-hexo-send/releases) 下载对应版本的 ZIP。
2. 解压到 Vault 的 `.obsidian/plugins/hexo-send/`。
3. 确认目录中包含 `main.js`、`manifest.json` 和 `styles.css`。
4. 重启或重新加载 Obsidian，然后在“第三方插件”中启用 Hexo Send。

也可以使用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 添加仓库 `FountainChan/obsidian-hexo-send` 参与 Beta 测试。🧪

## 🛠️ 安装开发版

```powershell
npm install
npm run verify
```

将 `main.js`、`manifest.json`、`styles.css` 复制到测试 Vault 的 `.obsidian/plugins/hexo-send/`，然后在 Obsidian 社区插件设置中启用 Hexo Send。最低 Obsidian 版本为 1.11.4，因为 API key 使用官方 SecretStorage。

## 🧭 使用流程

1. 在插件设置中填写 Hexo 仓库路径，点击“重新检测”。
2. 在文件树中右键 Markdown、目录或多选，选择“预发布到 Hexo…”。
3. 检查标题、分类、标签、keywords、description、图片 alt 和冲突动作。
4. 点击“生成并提交”。成功后状态为“已提交，尚未推送”。
5. 只有需要时才在结果页点击 Push。Push 成功仅表示远端接收 commit。

## 🔐 安全与隐私

- 不修改 Obsidian 源笔记。
- 已有 staged changes 或 Git 中间态会阻止执行。
- 只暂存本次文章和图片，禁止 `git add .`。
- AI 可选；API key 只保存到 SecretStorage。
- 远程图片下载失败默认阻止；只有预览中明确允许才保留原 URL。
- 不查询或报告部署状态。

### 🌐 网络与文件访问说明

- 插件会按你的配置读取和写入 Vault 外的本地 Hexo 仓库，用于生成文章、复制图片并创建 Git commit。
- 只有你明确点击 Push 后，插件才会连接 Hexo 仓库配置的 Git 远端。
- 文章包含远程图片时，预发布过程会访问对应图片地址并尝试下载。
- 只有启用可选 AI 功能时，插件才会把待补充的文章元数据发送到你配置的 OpenAI-compatible API endpoint。
- 插件不包含客户端遥测、广告或后台自动更新逻辑。

## 🧰 开发

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify`
- `npm run package`（生成仅含 main.js、manifest.json、styles.css 的 `dist/hexo-send/`）

## 🎁 发布版本

推送与 `package.json`、`manifest.json` 版本完全一致的标签后，GitHub Actions 会执行完整质量门、生成构建产物证明并创建 Release。Obsidian 要求标签不能带 `v` 前缀。Release 同时提供：

- `hexo-send-<version>.zip` 安装包
- Obsidian/BRAT 可直接读取的 `main.js`、`manifest.json`、`styles.css`
- `SHA256SUMS.txt` 完整性校验文件

例如，当前 `0.1.2` 版本必须使用标签 `0.1.2`。

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

详细设计见 `docs/plans/2026-08-08-technical-development-plan.md`。
