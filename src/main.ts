import { FileSystemAdapter, Menu, Notice, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";
import path from "node:path";
import { createPublishPlan, toReviewedArticles } from "./application/create-publish-plan";
import { PublishCoordinator } from "./application/publish-coordinator";
import { validateMetadata } from "./domain/frontmatter";
import type { DetectionItem, HexoEnvironment, ImageReference, ReviewedArticle, SourceArticle } from "./domain/publish-types";
import { parseSource } from "./infrastructure/markdown/source-parser";
import { resolveVaultAssetPath } from "./infrastructure/markdown/vault-path";
import { EnvironmentDetector } from "./infrastructure/hexo/environment-detector";
import { GitService } from "./infrastructure/git/git-service";
import { OpenAiCompatibleProvider, type AiMetadata } from "./infrastructure/ai/openai-compatible-provider";
import { NodeProcessRunner } from "./infrastructure/process/node-process-runner";
import { TempJobJournal } from "./infrastructure/files/temp-job-journal";
import { DEFAULT_SETTINGS, parseSettings, type HexoSendSettings } from "./settings";
import { HexoSendSettingTab } from "./obsidian/settings-tab";
import { PublishPreviewModal } from "./ui/publish-preview-modal";
import { PublishProgressModal } from "./ui/publish-progress-modal";
import { PublishResultModal } from "./ui/publish-result-modal";
import { RecoveryModal } from "./ui/recovery-modal";
import { HexoSendError } from "./domain/errors";

export default class HexoSendPlugin extends Plugin {
  settings: HexoSendSettings = DEFAULT_SETTINGS;
  environment: HexoEnvironment | null = null;
  detectionItems: DetectionItem[] = [];
  detectionError = "";
  private workflowActive = false;
  private readonly runner = new NodeProcessRunner();
  private readonly coordinator = new PublishCoordinator(this.runner);

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.addSettingTab(new HexoSendSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => this.addFileMenu(menu, [file])));
    this.registerEvent(this.app.workspace.on("files-menu", (menu, files) => this.addFileMenu(menu, files)));
    this.addCommand({ id: "publish-current-note", name: "预发布当前笔记到 Hexo", checkCallback: (checking) => { const file = this.app.workspace.getActiveFile(); if (!file || file.extension.toLowerCase() !== "md") return false; if (!checking) void this.startPublish([file]); return true; } });
    if (this.settings.repositoryPath) void this.detectEnvironment(false);
    const incomplete = await TempJobJournal.findIncomplete(); if (incomplete.length) new RecoveryModal(this.app,incomplete,(directory)=>{void openDirectory(directory);},(directory)=>this.restoreJob(directory)).open();
  }
  onunload(): void { this.coordinator.cancel(); }
  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
  async detectEnvironment(notify: boolean): Promise<HexoEnvironment | null> {
    try { this.environment = await new EnvironmentDetector(this.runner).detect(this.settings); this.detectionItems = this.environment.items; this.detectionError = ""; if (notify) new Notice("Hexo 环境检测完成"); return this.environment; }
    catch (error) { this.environment = null; const items = (error as {items?:DetectionItem[]}).items; this.detectionItems = items ?? [{key:"environment",label:"Hexo 环境",status:"failure",value:error instanceof Error ? error.message : String(error),blocking:true}]; this.detectionError = error instanceof Error ? error.message : String(error); if (notify) new Notice(this.detectionError, 8000); return null; }
  }
  private addFileMenu(menu: Menu, files: TAbstractFile[]): void {
    const publishable = files.some((file) => file instanceof TFolder || (file instanceof TFile && file.extension.toLowerCase() === "md")); if (!publishable) return;
    menu.addItem((item) => item.setTitle(files.length > 1 || files.some((file) => file instanceof TFolder) ? "批量预发布到 Hexo…" : "预发布到 Hexo…").setIcon("send").onClick(() => void this.startPublish(files)));
  }
  private async startPublish(selections: readonly TAbstractFile[]): Promise<void> {
    if (this.workflowActive || this.coordinator.busy) { new Notice("已有预发布任务正在执行或等待确认"); return; }
    this.workflowActive = true;
    const environment = await this.detectEnvironment(false); if (!environment) { this.workflowActive=false; new Notice(this.detectionError || "请先配置并检测 Hexo 仓库", 8000); return; }
    const blockers = environment.items.filter((item) => item.blocking && item.status === "failure"); if (blockers.length) { this.workflowActive=false; new Notice(`环境检测未通过：${blockers.map((item) => item.label).join("、")}`, 8000); return; }
    let scanProgress: PublishProgressModal | null = null;
    try {
      const files = this.collectMarkdownFiles(selections); if (!files.length) { this.workflowActive=false; new Notice("选择中没有可预发布的 Markdown 文件"); return; }
      const scanController = new AbortController(); const modal = new PublishProgressModal(this.app,()=>scanController.abort()); scanProgress = modal; modal.open(); let completed = 0;
      const sources = await mapLimit(files, 4, async (file) => { if (scanController.signal.aborted) throw new HexoSendError("CANCELLED","扫描已取消"); const source = parseSource(file.path, await this.app.vault.cachedRead(file)); completed += 1; modal.update({state:"scanning",message:`正在扫描 ${file.path}`,current:completed,total:files.length}); return source; });
      modal.update({state:"enriching",message:"正在检查和补齐元数据…",current:0,total:sources.length});
      const enrichmentWarnings = await this.enrichSources(sources, environment,scanController.signal);
      const reviewed = await toReviewedArticles(sources, environment); for (const article of reviewed) article.warnings.push(...(enrichmentWarnings.get(article.sourcePath) ?? []));
      scanProgress.close(); scanProgress = null;
      new PublishPreviewModal(this.app, reviewed, environment, (articles, message) => void this.executeReviewed(articles, environment, message),()=>{this.workflowActive=false;}).open();
    } catch (error) { this.workflowActive=false; scanProgress?.close(); new Notice(error instanceof Error ? error.message : String(error), 10000); }
  }
  private collectMarkdownFiles(selections: readonly TAbstractFile[]): TFile[] {
    const files = new Map<string,TFile>(); const visit = (file: TAbstractFile) => {
      if (this.isExcluded(file.path)) return;
      if (file instanceof TFile && file.extension.toLowerCase() === "md") files.set(file.path, file);
      else if (file instanceof TFolder) for (const child of file.children) visit(child);
    }; selections.forEach(visit); return [...files.values()].sort((a,b) => a.path.localeCompare(b.path));
  }
  private isExcluded(vaultPath: string): boolean { return this.settings.excludePatterns.some((pattern) => globRegex(pattern).test(vaultPath)); }
  private async enrichSources(sources: SourceArticle[], environment: HexoEnvironment, signal:AbortSignal): Promise<Map<string,string[]>> {
    const warnings = new Map<string,string[]>(); if (!this.settings.aiEnabled) return warnings;
    const key = this.app.secretStorage.getSecret(this.settings.aiSecretId); if (!key) { for (const source of sources) warnings.set(source.sourcePath,["AI 已启用但未设置 API key，请人工补齐元数据"]); return warnings; }
    const provider = new OpenAiCompatibleProvider();
    await mapLimit(sources.filter((source) => validateMetadata(source.metadata).length > 0), 2, async (source) => {
      if(signal.aborted)throw new HexoSendError("CANCELLED","元数据分析已取消");
      const cacheKey = OpenAiCompatibleProvider.cacheKey(source.body, environment.categories, this.settings.aiModel);
      try {
        const cached = this.settings.aiCache[cacheKey]?.value as AiMetadata | undefined;
        const ai = cached ?? await provider.enrich({ endpoint: this.settings.aiEndpoint, model: this.settings.aiModel, apiKey: key, body: source.body, categories: environment.categories, tags: environment.tags,signal });
        if (!cached) this.settings.aiCache[cacheKey] = { value: ai, createdAt: new Date().toISOString() };
        applyAi(source, ai, environment.tags); if (ai.confidence === "low") warnings.set(source.sourcePath,["AI 分类置信度较低，请人工确认"]);
      } catch (error) { if(signal.aborted)throw new HexoSendError("CANCELLED","元数据分析已取消"); warnings.set(source.sourcePath,[`AI 补齐失败，已切换人工表单：${error instanceof Error ? error.message : String(error)}`]); }
    });
    await this.saveSettings(); return warnings;
  }
  private async executeReviewed(articles: ReviewedArticle[], environment: HexoEnvironment, message: string): Promise<void> {
    try {
      const git = new GitService(this.runner, this.settings.gitExecutable); const snapshot = await git.assertSafeForWrite(environment.repositoryPath);
      const plan = await createPublishPlan(articles, environment, snapshot.head, message);
      const adapter=this.app.vault.adapter;
      if(adapter instanceof FileSystemAdapter){
        for(const article of plan.articles){ const source=path.resolve(adapter.getFullPath(article.sourcePath)).toLowerCase(); const target=path.resolve(environment.repositoryPath,...article.targetRelativePath.split("/")).toLowerCase(); if(source===target) throw new Error(`目标与 Obsidian 源笔记相同，已拒绝写入：${article.sourcePath}`); }
      }
      const progress = new PublishProgressModal(this.app, () => this.coordinator.cancel()); progress.open();
      const result = await this.coordinator.execute(plan, environment, this.settings, (reference) => this.resolveLocalAsset(reference, articles), (update) => progress.update(update));
      progress.close();
      new PublishResultModal(this.app, result, environment.repositoryPath,
        async () => { if (!result.commitHash || !result.remote || !result.branch) throw new Error("缺少 Push 上下文"); await new GitService(this.runner, this.settings.gitExecutable).pushConfirmed(environment.repositoryPath, result.commitHash, result.remote, result.branch); },
        () => { void openDirectory(environment.repositoryPath); },
        async () => { await this.restoreJob(TempJobJournal.pathFor(result.jobId)); },
        async () => { const succeeded = new Set(result.articles.filter((item)=>!item.error).map((item)=>item.sourcePath)); await this.restoreJob(TempJobJournal.pathFor(result.jobId)); const retry = articles.map((item)=>({...item,selected:succeeded.has(item.sourcePath)})); await this.executeReviewed(retry,environment,message); },
        ()=>{this.workflowActive=false;}).open();
    } catch (error) { this.workflowActive=false; new Notice(error instanceof Error ? error.message : String(error), 10000); }
  }
  private async resolveLocalAsset(reference: ImageReference, articles: readonly ReviewedArticle[]): Promise<string | null> {
    const source = articles.find((article) => article.images.includes(reference)); if (!source) return null;
    const normalizedPath=resolveVaultAssetPath(source.sourcePath,reference.target);
    const direct=normalizedPath?this.app.vault.getAbstractFileByPath(normalizedPath):null;
    let decoded=reference.target;try{decoded=decodeURIComponent(reference.target);}catch{/* Keep the literal target for MetadataCache fallback. */}
    const file = direct instanceof TFile?direct:this.app.metadataCache.getFirstLinkpathDest(decoded, source.sourcePath); if (!file) return null;
    const adapter = this.app.vault.adapter; return adapter instanceof FileSystemAdapter ? adapter.getFullPath(file.path) : null;
  }
  private async restoreJob(directory: string): Promise<void> {
    const info = await TempJobJournal.infoAt(directory);
    if (!this.settings.repositoryPath || path.resolve(info.repositoryPath).toLowerCase() !== path.resolve(this.settings.repositoryPath).toLowerCase()) throw new Error("恢复记录不属于当前配置的 Hexo 仓库");
    await new GitService(this.runner,this.settings.gitExecutable).unstageExact(info.repositoryPath,info.paths); await TempJobJournal.restoreAt(directory);
  }
}

function applyAi(source: SourceArticle, ai: AiMetadata, existingTags: readonly string[]): void {
  const caseMap = new Map(existingTags.map((tag) => [tag.toLowerCase(),tag]));
  if (!source.metadata.title) source.metadata.title = ai.title.trim();
  if (!source.metadata.categories.length) source.metadata.categories = [[ai.confidence === "low" ? "生活" : ai.category]];
  if (source.metadata.tags.length < 3) source.metadata.tags = [...new Set([...source.metadata.tags,...ai.tags].map((tag) => caseMap.get(tag.toLowerCase()) ?? tag))].slice(0,5);
  if (!source.metadata.keywords.length) source.metadata.keywords = ai.keywords;
  if (!source.metadata.description) source.metadata.description = ai.description;
  source.metadata.confidence = ai.confidence;
}
function globRegex(pattern: string): RegExp { const escaped = pattern.replace(/[.+^${}()|[\]\\]/g,"\\$&").replace(/\*\*/g,".*").replace(/\*/g,"[^/]*").replace(/\?/g,"."); return new RegExp(`(?:^|/)${escaped}(?:$|/)`,"i"); }
async function mapLimit<T,R>(items: readonly T[], concurrency: number, worker: (item:T,index:number)=>Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency,items.length) }, async () => { while (true) { const index = next++; if (index >= items.length) return; results[index] = await worker(items[index] as T,index); } })); return results;
}
async function openDirectory(directory: string): Promise<void> {
  try {
    const electron = (window as typeof window & { require?: (id: string) => { shell?: { openPath(path: string): Promise<string> } } }).require?.("electron");
    if (!electron?.shell) throw new Error("Electron shell 不可用");
    const error = await electron.shell.openPath(directory); if (error) throw new Error(error);
  } catch (error) { new Notice(`无法打开目录：${error instanceof Error ? error.message : String(error)}`); }
}
