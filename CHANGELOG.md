# Changelog

## 0.1.4

- 设置页迁移到 Obsidian 1.13 declarative settings API，并支持设置搜索。
- 接入官方 `eslint-plugin-obsidianmd`，将社区审核规则纳入本地质量门。
- AI 请求改用 `requestUrl`；远程图片改为固定已验证公网 IP 的流式 HTTP(S) 下载。
- 固定 SecretStorage ID、重新验证 AI 缓存，并移除配置驱动的可执行文件覆盖和启动时自动检测。
- 修复静态样式、窗口计时器、异步事件、Zod 废弃 API 和 Electron 类型安全问题。

## 0.1.3

- 增加完整英文 README，并保留独立的简体中文 README。
- Release 只上传社区插件市场支持的 `main.js`、`manifest.json` 和 `styles.css`。
- 移除直接 Clipboard API 访问，诊断详情改为只读文本窗口。
- 移除 npx 回退，只运行仓库本地 Hexo CLI。
- 加固仓库路径、符号链接、恢复记录和代理图片重定向的安全边界。

## 0.1.2

- 调整社区插件市场描述，移除目录上下文中重复的 “Obsidian” 字样。

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
