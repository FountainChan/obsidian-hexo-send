import { Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type HexoSendPlugin from "../main";

export class HexoSendSettingTab extends PluginSettingTab {
  constructor(app: import("obsidian").App, private readonly plugin: HexoSendPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this; containerEl.empty();
    containerEl.createEl("h2", { text: "Hexo Send" });
    containerEl.createEl("p", { text: "常规使用只需要设置 Hexo 仓库路径。检测操作只读，不会生成文章或提交。" });
    new Setting(containerEl).setName("Hexo 仓库路径").setDesc("包含 _config.yml、package.json 和 .git 的目录")
      .addText((text) => text.setPlaceholder("D:\\path\\to\\hexo").setValue(this.plugin.settings.repositoryPath).onChange(async (value) => { this.plugin.settings.repositoryPath = value.trim(); await this.plugin.saveSettings(); }))
      .addButton((button) => button.setButtonText("选择…").onClick(async () => { const selected = await chooseFolder(); if (selected) { this.plugin.settings.repositoryPath = selected; await this.plugin.saveSettings(); this.display(); } }));
    new Setting(containerEl).setName("环境检测").setDesc("读取 Hexo、Node 与 Git 配置")
      .addButton((button) => button.setCta().setButtonText("重新检测").onClick(async () => { button.setDisabled(true); await this.plugin.detectEnvironment(true); this.display(); }))
      .addButton((button) => button.setButtonText("复制诊断结果").setDisabled(!this.plugin.detectionItems.length).onClick(async () => { const value=this.plugin.detectionItems.map((item)=>`[${item.status.toUpperCase()}] ${item.label}: ${item.value}${item.advice?` — ${item.advice}`:""}`).join("\n"); await navigator.clipboard.writeText(value); new Notice("诊断结果已复制"); }));
    if (this.plugin.detectionError) containerEl.createEl("p", { text: this.plugin.detectionError, cls: "hexo-send-status-failure" });
    const detectionItems = this.plugin.environment?.items ?? this.plugin.detectionItems;
    if (detectionItems.length) {
      const table = containerEl.createEl("table");
      for (const item of detectionItems) { const row = table.createEl("tr"); const statusCell=row.createEl("td", { cls: `hexo-send-status-cell hexo-send-status-${item.status}` }); const statusLabel=item.status === "pass" ? "通过" : item.status === "warning" ? "警告" : "失败"; statusCell.setAttribute("aria-label",statusLabel); statusCell.title=statusLabel; setIcon(statusCell,item.status === "pass" ? "circle-check" : item.status === "warning" ? "triangle-alert" : "circle-x"); row.createEl("td", { text: item.label }); row.createEl("td", { text: item.value }); if (item.advice) row.createEl("td", { text: item.advice }); }
    }
    containerEl.createEl("h3", { text: "可选设置" });
    new Setting(containerEl).setName("AI 辅助元数据").setDesc("关闭时使用可编辑人工表单")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.aiEnabled).onChange(async (value) => { this.plugin.settings.aiEnabled = value; await this.plugin.saveSettings(); this.display(); }));
    if (this.plugin.settings.aiEnabled) {
      new Setting(containerEl).setName("AI Endpoint").addText((text) => text.setValue(this.plugin.settings.aiEndpoint).onChange(async (value) => { this.plugin.settings.aiEndpoint = value.trim(); await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("AI Model").addText((text) => text.setValue(this.plugin.settings.aiModel).onChange(async (value) => { this.plugin.settings.aiModel = value.trim(); await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("API Key").setDesc("仅保存到 Obsidian SecretStorage")
        .addText((text) => { text.inputEl.type = "password"; text.setPlaceholder(this.app.secretStorage.getSecret(this.plugin.settings.aiSecretId) ? "已保存；输入新值可替换" : "sk-…").onChange((value) => { if (value.trim()) this.app.secretStorage.setSecret(this.plugin.settings.aiSecretId, value.trim()); }); });
    }
    new Setting(containerEl).setName("目录排除规则").setDesc("每行一个 glob，例如 Private/**")
      .addTextArea((text) => text.setValue(this.plugin.settings.excludePatterns.join("\n")).onChange(async (value) => { this.plugin.settings.excludePatterns = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("图片下载代理").setDesc("可选，例如 http://127.0.0.1:7890")
      .addText((text) => text.setValue(this.plugin.settings.imageProxy).onChange(async (value) => { this.plugin.settings.imageProxy = value.trim(); await this.plugin.saveSettings(); }));
    const details = containerEl.createEl("details"); details.createEl("summary", { text: "高级覆盖（仅在自动检测失败时使用）" });
    this.advancedText(details, "Git 可执行文件", "gitExecutable"); this.advancedText(details, "Node 可执行文件", "nodeExecutable"); this.advancedText(details, "npx 可执行文件", "npxExecutable");
    this.advancedText(details, "Git remote", "remoteOverride"); this.advancedText(details, "Git branch", "branchOverride");
    this.advancedText(details, "文章目录", "postsDirOverride"); this.advancedText(details, "SEO 文章目录", "seoPostsDirOverride"); this.advancedText(details, "图片目录", "imagesDirOverride");
  }
  private advancedText(parent: HTMLElement, label: string, key: keyof Pick<import("../settings").HexoSendSettings,"gitExecutable"|"nodeExecutable"|"npxExecutable"|"remoteOverride"|"branchOverride"|"postsDirOverride"|"seoPostsDirOverride"|"imagesDirOverride">): void {
    new Setting(parent).setName(label).addText((text) => text.setValue(this.plugin.settings[key]).onChange(async (value) => { this.plugin.settings[key] = value.trim(); await this.plugin.saveSettings(); }));
  }
}

async function chooseFolder(): Promise<string | null> {
  try {
    const electron = (window as typeof window & { require?: (id: string) => { remote?: { dialog?: { showOpenDialog(options: unknown): Promise<{ canceled: boolean; filePaths: string[] }> } } } }).require?.("electron");
    const dialog = electron?.remote?.dialog; if (!dialog) { new Notice("当前 Obsidian 未提供系统目录选择器，请直接粘贴路径"); return null; }
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] }); return result.canceled ? null : result.filePaths[0] ?? null;
  } catch { new Notice("无法打开目录选择器，请直接粘贴路径"); return null; }
}
