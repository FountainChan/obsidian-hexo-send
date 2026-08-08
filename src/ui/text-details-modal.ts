import { Modal } from "obsidian";

export class TextDetailsModal extends Modal {
  constructor(app: import("obsidian").App, private readonly title: string, private readonly value: string) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: "插件不会直接访问系统剪贴板。如需复制，请在下方选择文本后按 Ctrl+C。" });
    const text = this.contentEl.createEl("textarea", { cls: "hexo-send-details-text" });
    text.value = this.value;
    text.readOnly = true;
    for (const eventName of ["keydown", "keyup", "copy", "cut", "paste"]) {
      text.addEventListener(eventName, (event) => event.stopPropagation());
    }
    const actions = this.contentEl.createDiv({ cls: "hexo-send-actions" });
    actions.createEl("button", { text: "关闭" }).addEventListener("click", () => this.close());
    window.setTimeout(() => {
      text.focus();
      text.select();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
