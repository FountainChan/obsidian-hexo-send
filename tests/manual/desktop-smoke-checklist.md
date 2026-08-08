# Windows Obsidian 桌面冒烟清单

2026-08-09 已完成的实际验证与证据见 `desktop-smoke-results-2026-08-09.md`。

- [ ] 插件在 Obsidian 1.11.4+ 加载，开发者控制台无未处理异常。
- [ ] 只填写 Hexo 路径即可回显站点、目录、分类、abbrlink 与 Git 信息。
- [ ] API key 未出现在插件 data.json 和复制诊断中。
- [ ] 单文件、目录、多选和当前笔记命令均打开预览；非 Markdown 单文件无入口。
- [ ] 批量分类、逐篇分类、元数据编辑、图片 alt 与冲突动作可编辑。
- [ ] 100 篇目录扫描期间界面可响应；执行期可取消，commit 临界区不可取消。
- [ ] 两阶段 generate 成功后仅生成一个本地 commit，结果显示“已提交，尚未推送”。
- [ ] 已有 staged changes、merge/rebase、index.lock 均阻止写入。
- [ ] 无关 unstaged 文件保持不变，commit 只含预览文章和图片。
- [ ] 关闭结果页、重启或卸载插件不会自动 Push。
- [ ] HEAD/branch/remote 变化后 Push 被拒绝；Push 失败保留 commit 并可重试。
- [ ] Push 成功只显示远端已接收，不显示部署成功或 GitHub Actions 状态。
