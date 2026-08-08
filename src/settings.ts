import { z } from "zod";

export const SettingsSchema = z.object({
  version: z.literal(1).default(1),
  repositoryPath: z.string().default(""),
  aiEnabled: z.boolean().default(false),
  aiEndpoint: z.string().default("https://api.openai.com/v1"),
  aiModel: z.string().default("gpt-4.1-mini"),
  excludePatterns: z.array(z.string()).default([]),
  remoteOverride: z.string().default(""),
  branchOverride: z.string().default(""),
  postsDirOverride: z.string().default(""),
  seoPostsDirOverride: z.string().default(""),
  imagesDirOverride: z.string().default(""),
  aiCache: z.record(z.string(), z.object({ value: z.unknown(), createdAt: z.string() })).default({}),
});

export type HexoSendSettings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: HexoSendSettings = SettingsSchema.parse({});
export const AI_SECRET_ID = "hexo-send-openai-key";

export function parseSettings(value: unknown): HexoSendSettings {
  const parsed = SettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
