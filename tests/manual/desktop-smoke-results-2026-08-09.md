# Windows Obsidian 桌面冒烟结果（2026-08-09）

## 环境

- Obsidian 可执行文件：`D:\Software\Obsidian\Obsidian.exe`
- 桌面版本：1.12.7（全局实例已加载 1.13.4 app package）
- 测试 Vault：`D:\WorkDev\SEOKnowleageBase`
- 正式 Hexo：`D:\WorkDev\hexoNote\vastBlog`
- 插件：Hexo Send 0.1.0

## 通过项

- 插件处于 enabled，实例、命令 `hexo-send:publish-current-note` 和设置页均注册成功。
- 设置页回显站点、author、URL、目录、分类/category_map、Hexo/abbrlink、Git、Node 和 pre-commit 检查。
- 发现 Obsidian GUI 无法执行 npx 后，改为优先通过 Node 直接调用仓库内 `node_modules/hexo/bin/hexo`；修复后阻塞项为 0。
- 文件树目录右键显示“批量预发布到 Hexo…”。
- 当前 Markdown 命令打开预览，显示动态分类、元数据、目标路径、冲突动作、图片 alt 和“生成并提交”。
- 取消预览后 modal 关闭、workflow lock 释放；正式 Hexo HEAD/status 和 Vault 原有内容状态未改变。
- 在 `D:\tmp` 的隔离 Hexo 克隆中完成真实端到端预发布：
  - 两阶段 Hexo generate 成功；
  - abbrlink 回写为 `32953`；
  - 本地 commit：`52e82175499e7a2f53c5c73feed96135acebb2b4`；
  - commit 只包含 `source/_posts/Hexo Send 桌面冒烟测试 20260809.md`；
  - 临时仓库相对 `origin/main` 为 ahead 1 / behind 0，证明没有 Push；
  - 结果页显示“已提交，尚未推送”、预计地址和 Push 按钮，测试未点击 Push。
- 测试后插件恢复正式 Hexo 路径，测试笔记已从 Vault 删除。
- 正式 Hexo 最终仍为 `67a50ce440f4325912d7717154d94e4edede1b4d` 且工作区干净。

## 未对真实内容执行的项目

- 未对正式 Hexo 创建 commit。
- 未执行 Push、`hexo deploy` 或 GitHub Actions 检查。
- 未使用真实 AI API key。
