import { Modal } from "obsidian";
import type { ProgressUpdate } from "../application/publish-coordinator";

export class PublishProgressModal extends Modal {
  private message?: HTMLElement;
  private progress?: HTMLProgressElement;
  private cancelButton?: HTMLButtonElement;
  constructor(app: import("obsidian").App, private readonly onCancel: () => void) { super(app); }
  onOpen(): void {
    this.modalEl.addClass("hexo-send-modal");
    this.contentEl.createEl("h2", { text: "Hexo 预发布" });
    this.message = this.contentEl.createEl("p", { text: "正在开始…" });
    this.progress = this.contentEl.createEl("progress", { cls: "hexo-send-progress", attr: { max: "100", value: "0" } });
    const actions = this.contentEl.createDiv({ cls: "hexo-send-actions" });
    this.cancelButton = actions.createEl("button", { text: "取消" });
    this.cancelButton.addEventListener("click", () => this.onCancel());
  }
  update(update: ProgressUpdate): void {
    this.message?.setText(update.message);
    if (this.progress) this.progress.value = update.total ? Math.round(update.current / update.total * 100) : 0;
    if (this.cancelButton) this.cancelButton.disabled = update.state === "committing";
  }
  onClose(): void { this.contentEl.empty(); }
}
