import { z } from "zod";

export const SettingsSchema = z.object({
  version: z.literal(1).default(1),
  repositoryPath: z.string().default(""),
  aiEnabled: z.boolean().default(false),
  aiEndpoint: z.string().default("https://api.openai.com/v1"),
  aiModel: z.string().default("gpt-4.1-mini"),
  aiSecretId: z.string().regex(/^[a-z0-9-]+$/).default("hexo-send-openai-key"),
  excludePatterns: z.array(z.string()).default([]),
  imageProxy: z.string().default(""),
  gitExecutable: z.string().default("git"),
  nodeExecutable: z.string().default("node"),
  remoteOverride: z.string().default(""),
  branchOverride: z.string().default(""),
  postsDirOverride: z.string().default(""),
  seoPostsDirOverride: z.string().default(""),
  imagesDirOverride: z.string().default(""),
  aiCache: z.record(z.string(), z.object({ value: z.unknown(), createdAt: z.string() })).default({}),
});

export type HexoSendSettings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: HexoSendSettings = SettingsSchema.parse({});

export function parseSettings(value: unknown): HexoSendSettings {
  const parsed = SettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
