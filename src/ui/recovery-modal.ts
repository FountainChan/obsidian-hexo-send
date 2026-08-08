import { Modal, Notice } from "obsidian";
import { TempJobJournal } from "../infrastructure/files/temp-job-journal";

export class RecoveryModal extends Modal {
  constructor(app: import("obsidian").App, private readonly directories: string[], private readonly openDirectory: (path:string)=>void, private readonly restore: (directory:string)=>Promise<void>) { super(app); }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: "发现未完成的 Hexo Send 任务" });
    this.contentEl.createEl("p", { text: "插件不会自动覆盖现场。可逐项恢复、打开日志目录或忽略。" });
    for (const directory of this.directories) {
      const card = this.contentEl.createDiv({ cls:"hexo-send-card" }); card.createEl("code", { text:directory }); const actions = card.createDiv({ cls:"hexo-send-actions" });
      actions.createEl("button", { text:"恢复本次改动", cls:"mod-warning" }).addEventListener("click", async()=>{ try { await this.restore(directory); card.remove(); new Notice("已恢复任务写入与暂存区"); } catch(error){ new Notice(error instanceof Error ? error.message : String(error),10000); } });
      actions.createEl("button", { text:"打开日志目录" }).addEventListener("click",()=>this.openDirectory(directory));
      actions.createEl("button", { text:"忽略" }).addEventListener("click",async()=>{ await TempJobJournal.ignoreAt(directory); card.remove(); });
    }
  }
  onClose(): void { this.contentEl.empty(); }
}
