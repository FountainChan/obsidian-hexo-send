# Hexo Send

Hexo Send 是一个仅支持桌面端的 Obsidian 插件。它把选中的 Markdown 文件、目录或多选内容预发布到本地 Hexo 仓库，执行两阶段 Hexo 验证并创建一个本地 commit。插件不会自动 Push，不执行 `hexo deploy`，也不跟踪 GitHub Actions。

## 安装开发版

```powershell
npm install
npm run verify
```

将 `main.js`、`manifest.json`、`styles.css` 复制到测试 Vault 的 `.obsidian/plugins/hexo-send/`，然后在 Obsidian 社区插件设置中启用 Hexo Send。最低 Obsidian 版本为 1.11.4，因为 API key 使用官方 SecretStorage。

## 使用

1. 在插件设置中填写 Hexo 仓库路径，点击“重新检测”。
2. 在文件树中右键 Markdown、目录或多选，选择“预发布到 Hexo…”。
3. 检查标题、分类、标签、keywords、description、图片 alt 和冲突动作。
4. 点击“生成并提交”。成功后状态为“已提交，尚未推送”。
5. 只有需要时才在结果页点击 Push。Push 成功仅表示远端接收 commit。

## 安全约束

- 不修改 Obsidian 源笔记。
- 已有 staged changes 或 Git 中间态会阻止执行。
- 只暂存本次文章和图片，禁止 `git add .`。
- AI 可选；API key 只保存到 SecretStorage。
- 远程图片下载失败默认阻止；只有预览中明确允许才保留原 URL。
- 不查询或报告部署状态。

## 开发

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify`
- `npm run package`（生成仅含 main.js、manifest.json、styles.css 的 `dist/hexo-send/`）

## 发布版本

推送与 `package.json`、`manifest.json` 版本一致的 `v*` 标签后，GitHub Actions 会执行完整质量门并创建 Release。Release 同时提供：

- `hexo-send-<version>.zip` 安装包
- Obsidian/BRAT 可直接读取的 `main.js`、`manifest.json`、`styles.css`
- `SHA256SUMS.txt` 完整性校验文件

例如，当前 `0.1.1` 版本使用标签 `v0.1.1`。

详细设计见 `docs/plans/2026-08-08-technical-development-plan.md`。
