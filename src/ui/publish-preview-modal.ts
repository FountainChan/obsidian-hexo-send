import { Modal, Notice } from "obsidian";
import { validateMetadata } from "../domain/frontmatter";
import type { HexoEnvironment, ReviewedArticle } from "../domain/publish-types";
import { targetForCategory } from "../domain/target-path";

export class PublishPreviewModal extends Modal {
  private confirmed = false;
  constructor(app: import("obsidian").App, private readonly articles: ReviewedArticle[], private readonly environment: HexoEnvironment, private readonly onConfirm: (articles: ReviewedArticle[], commitMessage: string) => void, private readonly onDismiss: ()=>void) { super(app); }
  onOpen(): void { this.render(); }
  private render(): void {
    this.modalEl.addClass("hexo-send-modal"); this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.articles.length > 1 ? "批量预发布到 Hexo" : "预发布到 Hexo" });
    this.contentEl.createEl("p", { text: `目标：${this.environment.repositoryPath} · ${this.environment.branch}`, cls: "hexo-send-muted" });
    if (this.articles.length > 1) this.renderBulkCategory();
    const list = this.contentEl.createDiv({ cls: "hexo-send-list" });
    this.articles.forEach((article, index) => this.renderArticle(list, article, index));
    const commitInput = this.contentEl.createEl("input", { type: "text", placeholder: "留空使用默认 commit message" });
    commitInput.style.width = "100%";
    const actions = this.contentEl.createDiv({ cls: "hexo-send-actions" });
    const cancel = actions.createEl("button", { text: "取消" }); cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { text: "生成并提交", cls: "mod-cta" });
    confirm.addEventListener("click", () => {
      const selected = this.articles.filter((item) => item.selected && item.action !== "skip");
      const errors = selected.flatMap((item) => validateMetadata(item.metadata).map((message) => `${item.sourcePath}: ${message}`));
      for(const item of selected){ const category=item.metadata.categories[0]??[]; if(!this.environment.categories.some((known)=>JSON.stringify(known)===JSON.stringify(category)))errors.push(`${item.sourcePath}: 分类必须从 Hexo 检测结果中选择`); }
      for(const item of selected)for(const image of item.images)if(!image.alt.trim())errors.push(`${item.sourcePath}: 第 ${image.line} 行图片 alt 不能为空`);
      if (!selected.length) errors.push("至少选择一篇文章");
      if (errors.length) { new Notice(errors.slice(0, 4).join("\n"), 8000); return; }
      this.confirmed = true; this.close(); this.onConfirm(this.articles, commitInput.value);
    });
  }
  private renderBulkCategory(): void {
    const row = this.contentEl.createDiv({ cls: "hexo-send-card" }); row.createSpan({ text: "将已勾选文章批量设为：" });
    const select = row.createEl("select"); select.createEl("option", { text: "选择分类…", value: "" }); this.addCategoryOptions(select);
    const apply = row.createEl("button", { text: "应用" }); apply.addEventListener("click", () => { if (!select.value) return; const category = JSON.parse(select.value) as string[]; for (const article of this.articles) if (article.selected) article.metadata.categories = [category]; this.render(); });
  }
  private renderArticle(parent: HTMLElement, article: ReviewedArticle, index: number): void {
    const card = parent.createDiv({ cls: "hexo-send-card" });
    const heading = card.createEl("h3"); const selected = heading.createEl("input", { type: "checkbox" }); selected.checked = article.selected; selected.addEventListener("change", () => { article.selected = selected.checked; }); heading.appendText(` ${index + 1}. ${article.sourcePath}`);
    const grid = card.createDiv({ cls: "hexo-send-grid" });
    const targetCode: { current?: HTMLElement } = {};
    const updateTarget = () => { article.targetRelativePath = targetForCategory(this.environment.postsDir, this.environment.seoPostsDir, article.metadata.categories[0] ?? [], article.metadata.title); targetCode.current?.setText(article.targetRelativePath); };
    this.field(grid, "标题", "input", article.metadata.title, (value) => { article.metadata.title = value; updateTarget(); });
    const category = this.selectField(grid, "分类"); this.addCategoryOptions(category);
    const currentCategory = article.metadata.categories[0] ?? [];
    if (currentCategory.length && !this.environment.categories.some((item)=>JSON.stringify(item)===JSON.stringify(currentCategory))) category.createEl("option",{value:JSON.stringify(currentCategory),text:`${currentCategory.join(" → ")}（源笔记）`});
    category.value = JSON.stringify(currentCategory); category.addEventListener("change", () => { article.metadata.categories = [JSON.parse(category.value) as string[]]; updateTarget(); });
    this.field(grid, "标签（逗号分隔）", "input", article.metadata.tags.join(", "), (value) => { article.metadata.tags = splitList(value); });
    this.field(grid, "Keywords（逗号分隔）", "input", article.metadata.keywords.join(", "), (value) => { article.metadata.keywords = splitList(value); });
    this.field(grid, "Description", "textarea", article.metadata.description, (value) => { article.metadata.description = value; });
    const exceptionLabel = grid.createEl("label", { text: "Description 长度例外" }); const exception = grid.createEl("input", { type: "checkbox" }); exception.checked = Boolean(article.metadata.descriptionExceptionConfirmed); exception.addEventListener("change", () => { article.metadata.descriptionExceptionConfirmed = exception.checked; }); exceptionLabel.htmlFor = exception.id;
    const action = this.selectField(grid, "目标动作");
    for (const [value,label] of [["create","新增"],["update","更新已有文章"],["save-as-new","另存为新文章"],["skip","跳过"]] as const) action.createEl("option", { value, text: label });
    action.value = article.action; action.addEventListener("change", () => { article.action = action.value as ReviewedArticle["action"]; });
    grid.createEl("span", { text: "当前目标" }); targetCode.current = grid.createEl("code", { text: article.targetRelativePath });
    for (const image of article.images) this.field(grid, `图片 alt（第 ${image.line} 行）`, "input", image.alt, (value) => { image.alt = value; });
    if (article.images.some((image) => image.remote)) {
      grid.createEl("span", { text: "远程图片失败" }); const fallback = grid.createEl("label"); const checkbox = fallback.createEl("input", { type: "checkbox" }); checkbox.checked = Boolean(article.allowRemoteImageFallback); checkbox.addEventListener("change", () => { article.allowRemoteImageFallback = checkbox.checked; }); fallback.appendText(" 下载失败时保留远程 URL（可能失效）");
    }
    for (const unsupported of article.unsupported) card.createEl("p", { text: `⚠ 第 ${unsupported.line} 行不支持自动转换：${unsupported.type}`, cls: "hexo-send-warning" });
    for (const warning of article.warnings) card.createEl("p", { text: `⚠ ${warning}`, cls: "hexo-send-warning" });
  }
  private field(parent: HTMLElement, label: string, kind: "input"|"textarea", value: string, onChange: (value:string)=>void): void {
    parent.createEl("label", { text: label }); const element = parent.createEl(kind); element.value = value; element.addEventListener("input", () => onChange(element.value));
    for(const eventName of ["keydown","keyup","copy","cut","paste"]) element.addEventListener(eventName,(event)=>event.stopPropagation());
  }
  private selectField(parent: HTMLElement, label: string): HTMLSelectElement { parent.createEl("label", { text: label }); return parent.createEl("select"); }
  private addCategoryOptions(select: HTMLSelectElement): void { for (const category of this.environment.categories) select.createEl("option", { value: JSON.stringify(category), text: category.join(" → ") }); }
  onClose(): void { this.contentEl.empty(); if(!this.confirmed)this.onDismiss(); }
}
const splitList = (value: string) => value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
