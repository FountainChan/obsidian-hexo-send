# 0.1.1 桌面修复验证（2026-08-09）

## 用户报告

- 预发布 Modal 的 Description 无法正常复制粘贴，快捷键被文件树处理为复制/粘贴 Markdown 文件。
- 多层目录笔记中的相对图片没有写入 `/images/<abbrlink>/`。
- 设置页“通过”在窄列中竖排。

## 根因与修复

- 输入控件未阻止 keydown/copy/cut/paste 向 Obsidian 全局快捷键冒泡；0.1.1 在输入控件边界停止传播但不阻止浏览器默认编辑行为。
- 图片失败任务共有 48 张本地图片；旧流程复制前 29 张后，在第 30 张空 alt 处中止，因此正文仍是第一次 generate 的诊断副本。0.1.1 增加：
  - 基于源笔记目录解析 `../../../../assets/...`；
  - 空 alt 自动生成“最近章节标题 + 示意图”的可编辑建议；
  - 预览确认阶段拦截空 alt；
  - 所有本地图片先完整预检，全部存在后才开始复制。
- 设置状态使用 Obsidian SVG 图标，并通过 aria-label 保留“通过/警告/失败”可访问文本。

## 真实 Obsidian 证据

- 插件版本：0.1.1。
- 真实源文图片引用：48；resolver 成功：48；缺失：0。
- Description synthetic keydown/copy/paste 冒泡次数：全部为 0。
- 设置状态单元格：26；SVG 图标：26；状态文字节点为空；aria-label 正常。
- 临时 Hexo 克隆真实预发布成功：
  - commit `8345d85178a8f8c8ee35271cbea0570e4188cbe5`；
  - abbrlink `30605`；
  - 图片文件 48；正文 `/images/30605/` 链接 48；旧相对路径 0；
  - commit 路径 49（文章 1 + 图片 48）；
  - `top_img` / `cover` 均为 `/images/30605/01.jpg`；
  - 临时仓库 ahead 1 / behind 0，未 Push。
- 正式 Hexo 的失败 journal 已安全恢复；失败文章与 29 张半成品图片已清除。
- 正式 Hexo 未创建新 commit，只保留测试前已存在的 SEO 文章改动。
