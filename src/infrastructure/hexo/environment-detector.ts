import { promises as fs } from "node:fs";
import path from "node:path";
import type { DetectionItem, HexoEnvironment } from "../../domain/publish-types";
import type { HexoSendSettings } from "../../settings";
import { GitService } from "../git/git-service";
import { readHexoConfig } from "./hexo-config-reader";
import type { ProcessRunner } from "../../ports/process-runner";
import { SafeFileSystem } from "../files/safe-file-system";

export class EnvironmentDetector {
  constructor(private readonly runner: ProcessRunner) {}

  async detect(settings: HexoSendSettings): Promise<HexoEnvironment> {
    const repositoryPath = path.resolve(settings.repositoryPath);
    const items: DetectionItem[] = [];
    const add = (key: string, label: string, status: DetectionItem["status"], value: string, blocking = false, advice?: string) =>
      items.push({ key, label, status, value, blocking, ...(advice ? { advice } : {}) });
    if (!settings.repositoryPath) throw new Error("请先选择 Hexo 仓库路径");
    await fs.access(repositoryPath);
    let config;
    try {
      config = await readHexoConfig(repositoryPath, {
        postsDir: settings.postsDirOverride || undefined,
        seoPostsDir: settings.seoPostsDirOverride || undefined,
        imagesDir: settings.imagesDirOverride || undefined,
      });
      add("hexo-config", "Hexo 配置", "pass", "_config.yml 与 package.json 可读取");
    } catch (error) {
      add("hexo-config", "Hexo 配置", "failure", error instanceof Error ? error.message : String(error), true, "确认目录为 Hexo 仓库根目录");
      throw Object.assign(new Error("Hexo 配置检测失败"), { items });
    }
    add("site-title", "站点标题", config.siteTitle ? "pass" : "warning", config.siteTitle || "未配置");
    add("site-author", "作者", config.author ? "pass" : "warning", config.author || "未配置");
    add("site-url", "站点 URL", config.url ? "pass" : "warning", config.url || "未配置");
    add("locale", "语言 / 时区", "pass", `${config.language || "未配置"} / ${config.timezone || "未配置"}`);
    add("source-dir", "source_dir", "pass", config.sourceDir);
    add("permalink", "Permalink", config.permalink ? "pass" : "warning", config.permalink || "未配置");
    add("post-assets", "post_asset_folder", "pass", String(config.postAssetFolder));
    add("categories", "分类", config.categories.length ? "pass" : "warning", config.categories.map((item)=>item.join(" → ")).join("、") || "未发现分类");
    add("category-map", "category_map", Object.keys(config.categoryMap).length ? "pass" : "warning", Object.entries(config.categoryMap).map(([name,slug])=>`${name} → ${slug}`).join("、") || "未配置");
    add("hexo-version", "Hexo 版本", config.hexoVersion ? "pass" : "failure", config.hexoVersion || "未安装", !config.hexoVersion, "在仓库中安装 Hexo");
    add("abbrlink", "hexo-abbrlink", config.abbrlinkInstalled ? "pass" : "failure", config.abbrlinkInstalled ? JSON.stringify(config.abbrlinkConfig) || "已安装" : "未安装", !config.abbrlinkInstalled, "安装并配置 hexo-abbrlink");
    const safeFs = new SafeFileSystem(repositoryPath);
    for (const [key, label, value] of [["posts-dir","文章目录",config.postsDir],["seo-dir","SEO 文章目录",config.seoPostsDir],["images-dir","图片目录",config.imagesDir]] as const) {
      try {
        const exists = await safeFs.exists(value);
        add(key, label, exists ? "pass" : "warning", value, false, exists ? undefined : "目录将在首次预发布时创建");
      } catch (error) {
        add(key, label, "failure", error instanceof Error ? error.message : String(error), true, "目录必须位于 Hexo 仓库内且不能是符号链接");
      }
    }
    const git = new GitService(this.runner, settings.gitExecutable);
    const snapshot = await git.inspect(repositoryPath);
    add("git", "Git 仓库", "pass", snapshot.head.slice(0, 12));
    add("git-identity", "Git 身份", snapshot.identity.includes("<") ? "pass" : "failure", snapshot.identity || "未配置", !snapshot.identity.includes("<"), "配置 user.name 与 user.email");
    add("git-operation", "Git 操作状态", snapshot.operation ? "failure" : "pass", snapshot.operation || "正常", Boolean(snapshot.operation), "完成或中止当前 Git 操作");
    add("git-stage", "暂存区", snapshot.staged.length ? "failure" : "pass", snapshot.staged.length ? `${snapshot.staged.length} 个 staged 文件` : "为空", Boolean(snapshot.staged.length), "先提交或取消已有 staged changes");
    add("git-worktree", "工作区", snapshot.dirty ? "warning" : "pass", snapshot.dirty ? "存在未提交修改；插件只会处理计划内路径" : "干净");
    add("git-branch", "分支 / upstream", snapshot.branch ? "pass" : "failure", `${snapshot.branch || "detached"} / ${snapshot.upstream || "未配置"} · ahead ${snapshot.ahead} / behind ${snapshot.behind}`, !snapshot.branch, "切换到普通分支");
    add("git-remote", "Git remote", snapshot.remote ? "pass" : "warning", snapshot.remote || "未配置", false, "Push 前需要 upstream remote，或在高级设置中覆盖");
    const nodeVersion = await this.runner.run({ executable: settings.nodeExecutable, args: ["--version"], cwd: repositoryPath, timeoutMs: 10_000 }).then((r) => r.stdout.trim()).catch(() => "");
    const localHexoCli=await fs.access(path.join(repositoryPath,"node_modules","hexo","bin","hexo")).then(()=>true).catch(()=>false);
    add("node", "Node", nodeVersion ? "pass" : "failure", nodeVersion || "不可用", !nodeVersion, "在高级设置中指定 Node 路径");
    add("hexo-cli","本地 Hexo CLI",localHexoCli?"pass":"failure",localHexoCli?"node_modules/hexo/bin/hexo":"未安装到 node_modules",!localHexoCli,"在 Hexo 仓库执行 npm install");
    const hookPath=path.join(repositoryPath,".git","hooks","pre-commit");
    const hookContent=await fs.readFile(hookPath,"utf8").catch(()=>""); const hookPresent=Boolean(hookContent);
    const checks=[/alt/i.test(hookContent)?"图片 alt":"",/tags/i.test(hookContent)?"tags":"",/keywords/i.test(hookContent)?"keywords":""].filter(Boolean);
    add("pre-commit", "pre-commit hook", hookPresent ? "pass" : "warning", hookPresent ? `已检测到${checks.length?`（${checks.join("、")}）`:""}` : "未检测到");
    return {
      repositoryPath, ...config,
      branch: settings.branchOverride || snapshot.branch,
      remote: settings.remoteOverride || snapshot.remote,
      upstream: snapshot.upstream, ahead: snapshot.ahead, behind: snapshot.behind, dirty: snapshot.dirty,
      staged: snapshot.staged, gitIdentity: snapshot.identity, hookPresent, items,
    };
  }
}

export function copyableDiagnostics(environment: HexoEnvironment): string {
  return environment.items.map((item) => `[${item.status.toUpperCase()}] ${item.label}: ${item.value}${item.advice ? ` — ${item.advice}` : ""}`).join("\n");
}
