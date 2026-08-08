# Architecture

依赖方向为 `domain <- application <- UI`，应用层只通过适配器访问进程、Git、Hexo、文件和 AI。

预览确认后生成不可变 `PublishPlan`。执行时先核对 Git HEAD 与空暂存区，然后写文章副本、运行第一次 Hexo generate 获取 abbrlink、处理图片、运行第二次 generate、检查计划外变更、精确 stage 并创建一个 commit。Push 是独立用例，执行前再次核对 commit、branch 和 remote。

所有外部命令均通过 `spawn` 参数数组执行且 `shell: false`。任务 journal 位于系统临时目录，保存目标旧版本与哈希；恢复时若文件已被外部修改则拒绝覆盖。
