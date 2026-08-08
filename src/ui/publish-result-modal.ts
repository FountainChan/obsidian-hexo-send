import { Modal, Notice } from "obsidian";
import type { PublishResult } from "../domain/publish-types";
import { TextDetailsModal } from "./text-details-modal";

export class PublishResultModal extends Modal {
  private handingOff = false;
  constructor(app: import("obsidian").App, private readonly result: PublishResult, private readonly repositoryPath: string, private readonly onPush: () => Promise<void>, private readonly onOpenDirectory: () => void, private readonly onRestore: () => Promise<void>, private readonly onCommitSuccessful: () => Promise<void>, private readonly onDone:()=>void) { super(app); }
  onOpen(): void { this.render(); }
  private render(): void {
    this.modalEl.addClass("hexo-send-modal"); this.contentEl.empty();
    const committed = Boolean(this.result.commitHash) || this.result.state === "committed" || this.result.state === "pushed" || this.result.state === "push_failed";
    const title=this.result.state==="commit_failed"&&this.result.commitHash?"已提交，但提交内容校验失败（禁止 Push）":committed ? (this.result.state === "pushed" ? "已推送到远端" : "已提交，尚未推送") : "预发布未完成";
    this.contentEl.createEl("h2", { text:title });
    if (this.result.commitHash) this.contentEl.createEl("p", { text: `commit: ${this.result.commitHash}\nbranch: ${this.result.branch || "-"}\nremote: ${this.result.remote || "-"}` });
    const list = this.contentEl.createDiv({ cls: "hexo-send-list" });
    for (const article of this.result.articles) {
      const card = list.createDiv({ cls: "hexo-send-card" }); card.createEl("strong", { text: article.targetRelativePath });
      card.createEl("p", { text: `动作：${article.action} · abbrlink：${article.abbrlink || "-"} · 图片：${article.imageCount}` });
      if(article.expectedUrl) card.createEl("p",{text:`预计地址（不检测上线）：${article.expectedUrl}`});
      if (article.error) card.createEl("p", { text: article.error, cls: "hexo-send-status-failure" });
      for (const warning of article.warnings) card.createEl("p", { text: warning, cls: "hexo-send-warning" });
    }
    for (const diagnostic of this.result.diagnostics) this.contentEl.createEl("pre", { text: `[${diagnostic.code}] ${diagnostic.message}`, cls: `hexo-send-status-${diagnostic.level}` });
    const actions = this.contentEl.createDiv({ cls: "hexo-send-actions" });
    actions.createEl("button", { text: "打开 Hexo 目录" }).addEventListener("click", this.onOpenDirectory);
    actions.createEl("button", { text: "查看详情" }).addEventListener("click", () => { new TextDetailsModal(this.app, "预发布诊断详情", this.details()).open(); });
    actions.createEl("button", { text: "稍后" }).addEventListener("click", () => this.close());
    if (!committed) actions.createEl("button", { text:"恢复本次改动", cls:"mod-warning" }).addEventListener("click",async()=>{ try { await this.onRestore(); new Notice("已恢复本次改动"); this.close(); } catch(error){ new Notice(error instanceof Error ? error.message : String(error),10000); } });
    const successes = this.result.articles.filter((article)=>!article.error); const failures = this.result.articles.filter((article)=>article.error);
    if (!committed && successes.length && failures.length) actions.createEl("button", { text:`只提交成功项（${successes.length}）`, cls:"mod-cta" }).addEventListener("click",async()=>{ try { this.handingOff=true; await this.onCommitSuccessful(); this.close(); } catch(error){ this.handingOff=false; new Notice(error instanceof Error ? error.message : String(error),10000); } });
    if (this.result.state === "committed" || this.result.state === "push_failed") {
      const push = actions.createEl("button", { text: this.result.state === "push_failed" ? "重试 Push" : "Push", cls: "mod-cta" });
      push.disabled = !this.result.remote || !this.result.branch || !this.result.commitHash;
      push.addEventListener("click", async () => { push.disabled = true; try { await this.onPush(); this.result.state = "pushed"; new Notice("远端已接收 commit；未检查部署状态"); this.render(); } catch (error) { this.result.state = "push_failed"; new Notice(error instanceof Error ? error.message : String(error), 8000); this.render(); } });
    }
  }
  private details(): string { return JSON.stringify({ state: this.result.state, commitHash: this.result.commitHash, branch: this.result.branch, remote: this.result.remote, repositoryPath: this.repositoryPath, articles: this.result.articles, diagnostics: this.result.diagnostics }, null, 2); }
  onClose(): void { this.contentEl.empty(); if(!this.handingOff)this.onDone(); }
}
