# Changelog

## 0.1.1

- 修复预发布 Modal 内 Ctrl+C/Ctrl+V 被 Obsidian 文件树快捷键抢占的问题。
- 修复多层目录笔记中的 `../../assets/...` Markdown 图片无法解析的问题。
- 设置页检测状态改为图标，避免“通过”文字被窄列挤成竖排。
- Windows GUI 优先通过 Node 调用仓库本地 Hexo CLI，不再依赖 npx 可执行性。

## 0.1.0

- 首个 Beta：文件、目录、多选和当前笔记预发布入口。
- Hexo/Git/Node 自动检测及动态分类回显。
- 可选 AI 元数据补齐与 SecretStorage 密钥保存。
- 本地/远程图片本地化、图片 alt 检查、cover/top_img 回填。
- 两阶段 Hexo generate、精确单 commit、失败恢复和显式 Push。
