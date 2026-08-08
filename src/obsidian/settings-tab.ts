import { Notice, PluginSettingTab, setIcon } from "obsidian";
import type { SettingDefinition, SettingDefinitionItem } from "obsidian";
import type HexoSendPlugin from "../main";
import type { HexoSendSettings } from "../settings";
import { AI_SECRET_ID } from "../settings";
import { chooseSystemDirectory } from "../infrastructure/electron/electron-bridge";
import { TextDetailsModal } from "../ui/text-details-modal";

type AdvancedKey = keyof Pick<HexoSendSettings, "remoteOverride" | "branchOverride" | "postsDirOverride" | "seoPostsDirOverride" | "imagesDirOverride">;

export class HexoSendSettingTab extends PluginSettingTab {
  constructor(app: import("obsidian").App, private readonly plugin: HexoSendPlugin) { super(app, plugin); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        items: [
          {
            name: "Hexo 仓库路径",
            desc: "包含 _config.yml、package.json 和 .git 的本地目录",
            render: (setting) => {
              setting.setName("Hexo 仓库路径").setDesc("包含 _config.yml、package.json 和 .git 的本地目录")
                .addText((text) => text.setPlaceholder("D:\\path\\to\\Hexo").setValue(this.plugin.settings.repositoryPath).onChange((value) => { this.plugin.settings.repositoryPath = value.trim(); void this.plugin.saveSettings(); }))
                .addButton((button) => button.setButtonText("选择…").onClick(() => { void this.selectRepository(); }));
            },
          },
          {
            name: "环境检测",
            desc: "只读检查 Hexo、Node.js 与 Git 配置，不生成文章或提交",
            render: (setting) => {
              setting.setName("环境检测").setDesc("只读检查 Hexo、Node.js 与 Git 配置，不生成文章或提交")
                .addButton((button) => button.setCta().setButtonText("重新检测").onClick(() => { button.setDisabled(true); void this.detectAndRefresh(); }))
                .addButton((button) => button.setButtonText("查看诊断结果").setDisabled(!this.plugin.detectionItems.length).onClick(() => { new TextDetailsModal(this.app, "环境诊断结果", this.diagnosticText()).open(); }));
            },
          },
          {
            name: "环境检测结果",
            searchable: false,
            visible: () => Boolean(this.plugin.detectionError || this.currentDetectionItems().length),
            render: (setting) => {
              setting.setName("环境检测结果");
              if (this.plugin.detectionError) setting.descEl.createDiv({ text: this.plugin.detectionError, cls: "hexo-send-status-failure" });
              const items = this.currentDetectionItems();
              if (!items.length) return;
              const table = setting.descEl.createEl("table");
              for (const item of items) {
                const row = table.createEl("tr");
                const statusCell = row.createEl("td", { cls: `hexo-send-status-cell hexo-send-status-${item.status}` });
                const statusLabel = item.status === "pass" ? "通过" : item.status === "warning" ? "警告" : "失败";
                statusCell.setAttribute("aria-label", statusLabel); statusCell.title = statusLabel;
                setIcon(statusCell, item.status === "pass" ? "circle-check" : item.status === "warning" ? "triangle-alert" : "circle-x");
                row.createEl("td", { text: item.label }); row.createEl("td", { text: item.value }); if (item.advice) row.createEl("td", { text: item.advice });
              }
            },
          },
        ],
      },
      {
        type: "group",
        heading: "可选功能",
        items: [
          {
            name: "AI 辅助元数据",
            desc: "关闭时使用可编辑人工表单；启用后会把完整正文发送到所配置的 endpoint",
            render: (setting) => {
              setting.setName("AI 辅助元数据").setDesc("关闭时使用可编辑人工表单；启用后会把完整正文发送到所配置的 endpoint")
                .addToggle((toggle) => toggle.setValue(this.plugin.settings.aiEnabled).onChange((value) => { this.plugin.settings.aiEnabled = value; void this.saveAndRefresh(); }));
            },
          },
          this.textDefinition("AI endpoint", "aiEndpoint", () => this.plugin.settings.aiEnabled),
          this.textDefinition("AI model", "aiModel", () => this.plugin.settings.aiEnabled),
          {
            name: "API key",
            desc: "仅保存到 Obsidian SecretStorage",
            visible: () => this.plugin.settings.aiEnabled,
            render: (setting) => {
              setting.setName("API key").setDesc("仅保存到 Obsidian SecretStorage").addText((text) => {
                text.inputEl.type = "password";
                text.setPlaceholder(this.app.secretStorage.getSecret(AI_SECRET_ID) ? "已保存；输入新值可替换" : "sk-…")
                  .onChange((value) => { if (value.trim()) this.app.secretStorage.setSecret(AI_SECRET_ID, value.trim()); });
              });
            },
          },
          {
            name: "目录排除规则",
            desc: "每行一个 glob，例如 private/**",
            render: (setting) => {
              setting.setName("目录排除规则").setDesc("每行一个 glob，例如 private/**").addTextArea((text) => text.setValue(this.plugin.settings.excludePatterns.join("\n")).onChange((value) => {
                this.plugin.settings.excludePatterns = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); void this.plugin.saveSettings();
              }));
            },
          },
        ],
      },
      {
        type: "group",
        heading: "高级覆盖",
        items: ([
          ["Git remote", "remoteOverride"], ["Git branch", "branchOverride"],
          ["文章目录", "postsDirOverride"], ["SEO 文章目录", "seoPostsDirOverride"], ["图片目录", "imagesDirOverride"],
        ] as const).map(([name, key]) => this.advancedTextDefinition(name, key)),
      },
    ];
  }

  private textDefinition(name: string, key: "aiEndpoint" | "aiModel", visible?: () => boolean, desc?: string): SettingDefinition {
    return { name, ...(desc ? { desc } : {}), ...(visible ? { visible } : {}), render: (setting) => {
      setting.setName(name); if (desc) setting.setDesc(desc);
      setting.addText((text) => text.setValue(this.plugin.settings[key]).onChange((value) => { this.plugin.settings[key] = value.trim(); void this.plugin.saveSettings(); }));
    } };
  }

  private advancedTextDefinition(name: string, key: AdvancedKey): SettingDefinition {
    return { name, render: (setting) => { setting.setName(name).addText((text) => text.setValue(this.plugin.settings[key]).onChange((value) => { this.plugin.settings[key] = value.trim(); void this.plugin.saveSettings(); })); } };
  }

  private currentDetectionItems() { return this.plugin.environment?.items ?? this.plugin.detectionItems; }
  private diagnosticText(): string { return this.plugin.detectionItems.map((item) => `[${item.status.toUpperCase()}] ${item.label}: ${item.value}${item.advice ? ` — ${item.advice}` : ""}`).join("\n"); }
  private async saveAndRefresh(): Promise<void> { await this.plugin.saveSettings(); this.update(); }
  private async detectAndRefresh(): Promise<void> { await this.plugin.detectEnvironment(true); this.update(); }
  private async selectRepository(): Promise<void> {
    try {
      const selected = await chooseSystemDirectory(); if (!selected) return;
      this.plugin.settings.repositoryPath = selected; await this.plugin.saveSettings(); this.update();
    } catch { new Notice("无法打开目录选择器，请直接粘贴路径"); }
  }
}
