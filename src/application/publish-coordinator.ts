import { serializeArticle, validateMetadata } from "../domain/frontmatter";
import { HexoSendError, errorMessage } from "../domain/errors";
import { PublishStateMachine } from "../domain/publish-state-machine";
import type { ArticleResult, DiagnosticEvent, HexoEnvironment, JobState, PublishPlan, PublishResult } from "../domain/publish-types";
import type { LocalAssetResolver } from "../infrastructure/assets/asset-service";
import { AssetService } from "../infrastructure/assets/asset-service";
import { SafeFileSystem } from "../infrastructure/files/safe-file-system";
import { TempJobJournal } from "../infrastructure/files/temp-job-journal";
import { GitService } from "../infrastructure/git/git-service";
import { HexoService } from "../infrastructure/hexo/hexo-service";
import type { ProcessRunner } from "../ports/process-runner";
import type { HexoSendSettings } from "../settings";

export interface ProgressUpdate { state: JobState; message: string; current: number; total: number; }

export class PublishCoordinator {
  private active: AbortController | null = null;
  constructor(private readonly runner: ProcessRunner) {}
  get busy(): boolean { return this.active !== null; }
  cancel(): void { this.active?.abort(); }

  async execute(plan: PublishPlan, environment: HexoEnvironment, settings: HexoSendSettings, resolveLocal: LocalAssetResolver, progress: (update: ProgressUpdate) => void): Promise<PublishResult> {
    if (this.active) throw new Error("已有预发布任务正在执行");
    const controller = new AbortController(); this.active = controller;
    const state = new PublishStateMachine("awaiting_review"); const diagnostics: DiagnosticEvent[] = []; const results: ArticleResult[] = [];
    const emit = (message: string, current = 0, total = plan.articles.length) => progress({ state: state.state, message, current, total });
    const git = new GitService(this.runner, settings.gitExecutable); const hexo = new HexoService(this.runner, settings.npxExecutable,settings.nodeExecutable);
    const safeFs = new SafeFileSystem(plan.repositoryPath); const journal = new TempJobJournal(plan.repositoryPath, plan.id); const assetService = new AssetService(this.runner);
    let createdCommitHash: string | undefined;
    try {
      const snapshot = await git.assertSafeForWrite(plan.repositoryPath);
      if (snapshot.head !== plan.baselineHead) throw new HexoSendError("GIT_UNSAFE", "预览后 HEAD 已变化，请重新预览");
      const baselineChanged = new Set(await git.changedPaths(plan.repositoryPath));
      const dirtyTargets = plan.allowedPaths.filter((item)=>baselineChanged.has(item));
      if(dirtyTargets.length) throw new HexoSendError("GIT_UNSAFE","目标文章已有未提交修改，拒绝覆盖",{dirtyTargets});
      for (const article of plan.articles) {
        const metadataErrors = validateMetadata(article.metadata); if (metadataErrors.length) throw new HexoSendError("METADATA_INVALID", `${article.sourcePath}: ${metadataErrors.join("；")}`);
      }
      await journal.begin(plan.allowedPaths);
      state.transition("generating"); emit("正在写入文章副本…");
      for (const [index, article] of plan.articles.entries()) {
        await safeFs.write(article.targetRelativePath, serializeArticle({ ...article.metadata, abbrlink: article.action === "update" ? article.metadata.abbrlink : "", topImg: false, cover: false }, article.body));
        await journal.markWritten(article.targetRelativePath); emit(`已写入 ${article.metadata.title}`, index + 1);
      }
      await hexo.clean(plan.repositoryPath, controller.signal);
      try { await hexo.generate(plan.repositoryPath, controller.signal); }
      finally { for (const article of plan.articles) await journal.markWritten(article.targetRelativePath).catch(()=>undefined); }
      const abbrlinks = new Set<string>(); const actualPaths = new Set(plan.allowedPaths);
      for (const [index, article] of plan.articles.entries()) {
        const abbrlink = article.action === "update" && article.metadata.abbrlink ? article.metadata.abbrlink : await hexo.readAbbrlink(plan.repositoryPath, article.targetRelativePath);
        if (abbrlinks.has(abbrlink)) throw new HexoSendError("HEXO_VALIDATION_FAILED", `批次内 abbrlink 重复：${abbrlink}`); abbrlinks.add(abbrlink);
        const assets = await assetService.process({ repositoryPath: plan.repositoryPath, imagesDir: environment.imagesDir, abbrlink, body: article.body, images: article.images, resolveLocal, proxy: settings.imageProxy || undefined, signal: controller.signal, allowRemoteFallback: article.allowRemoteImageFallback,
          beforeWrite: async (relative) => { if(baselineChanged.has(relative)) throw new HexoSendError("GIT_UNSAFE",`目标图片已有未提交修改：${relative}`); await journal.begin([relative]); } });
        for (const assetPath of assets.paths) actualPaths.add(assetPath);
        const metadata = { ...article.metadata, abbrlink, topImg: assets.firstImage, cover: assets.firstImage };
        await safeFs.write(article.targetRelativePath, serializeArticle(metadata, assets.body)); await journal.markWritten(article.targetRelativePath);
        for (const assetPath of assets.paths) await journal.markWritten(assetPath);
        results.push({ sourcePath: article.sourcePath, targetRelativePath: article.targetRelativePath, action: article.action, abbrlink, imageDirectory: assets.paths.length ? `${environment.imagesDir}/${abbrlink}` : undefined, imageCount: assets.paths.length, expectedUrl: expectedPostUrl(environment,article.metadata.categories[0] ?? [],abbrlink,article.metadata.date), warnings: [...article.warnings, ...assets.warnings] });
        emit(`已处理图片 ${article.metadata.title}`, index + 1);
      }
      state.transition("validating"); emit("正在执行最终 Hexo 验证…");
      try { await hexo.generate(plan.repositoryPath, controller.signal); }
      finally { for (const article of plan.articles) await journal.markWritten(article.targetRelativePath).catch(()=>undefined); }
      const changedAfter = await git.changedPaths(plan.repositoryPath); const extras = changedAfter.filter((item) => !baselineChanged.has(item) && !actualPaths.has(item));
      if (extras.length) throw new HexoSendError("GIT_UNSAFE", "Hexo 生成产生了计划外 source 变更", { extras });
      state.transition("committing"); emit("正在精确暂存并提交…");
      const paths = [...actualPaths].sort(); await git.stageExact(plan.repositoryPath, paths); await git.verifyIndex(plan.repositoryPath, paths);
      createdCommitHash = await git.commit(plan.repositoryPath, plan.commitMessage); await git.verifyCommit(plan.repositoryPath, createdCommitHash, paths);
      state.transition("committed"); await journal.complete(); emit("已提交，尚未推送", plan.articles.length);
      return { jobId: plan.id, state: state.state, commitHash:createdCommitHash, branch: snapshot.branch, remote: environment.remote || snapshot.remote, articles: results, diagnostics };
    } catch (error) {
      const next: JobState = error instanceof HexoSendError && error.code === "CANCELLED" ? "cancelled" : state.state === "committing" ? "commit_failed" : "validation_failed";
      if (state.can(next)) state.transition(next);
      diagnostics.push({ at: new Date().toISOString(), level: "failure", code: error instanceof HexoSendError ? error.code : "UNEXPECTED", message: errorMessage(error), details: error instanceof HexoSendError ? error.details : undefined });
      if(createdCommitHash)await journal.complete().catch(()=>undefined);
      const completed = new Map(results.map((item)=>[item.sourcePath,item]));
      const articleResults = plan.articles.map((article) => completed.get(article.sourcePath) ?? ({ sourcePath: article.sourcePath, targetRelativePath: article.targetRelativePath, action: article.action, imageCount: 0, warnings: article.warnings, error: errorMessage(error) }));
      return { jobId: plan.id, state: state.state,commitHash:createdCommitHash, branch: environment.branch, remote: environment.remote, articles: articleResults, diagnostics };
    } finally { this.active = null; }
  }
}

function expectedPostUrl(environment: HexoEnvironment, categories: readonly string[], abbrlink: string, dateText: string): string | undefined {
  if (!environment.url || !environment.permalink) return undefined;
  const date = new Date(dateText.replace(" ","T")); const pad=(value:number)=>String(value).padStart(2,"0");
  const category = categories.map((item)=>environment.categoryMap[item] || encodeURIComponent(item)).join("/");
  const relative = environment.permalink.replace(":abbrlink",abbrlink).replace(":category",category).replace(":year",String(date.getFullYear())).replace(":month",pad(date.getMonth()+1)).replace(":day",pad(date.getDate())).replace(/^\/+/,"");
  try { return new URL(relative,`${environment.url.replace(/\/$/,"")}/`).toString(); } catch { return undefined; }
}
