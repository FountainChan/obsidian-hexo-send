import { createHash } from "node:crypto";
import { z } from "zod";
import { HexoSendError } from "../../domain/errors";

const ResponseSchema = z.object({
  title: z.string().min(1), category: z.string().min(1), tags: z.array(z.string()).min(3).max(5),
  keywords: z.array(z.string()).min(1), description: z.string().min(1), confidence: z.enum(["high","low"]),
});
export type AiMetadata = z.infer<typeof ResponseSchema>;

export class OpenAiCompatibleProvider {
  async enrich(options: { endpoint: string; model: string; apiKey: string; body: string; categories: readonly string[][]; tags: readonly string[]; signal?: AbortSignal }): Promise<AiMetadata> {
    const endpoint = `${options.endpoint.replace(/\/$/,"")}/chat/completions`;
    const prompt = `根据文章生成 Hexo 元数据。只输出 JSON：title, category, tags(3-5), keywords, description(80-160字), confidence(high/low)。可选分类：${options.categories.map((c)=>c.join("/")).join("、")}。优先复用标签：${options.tags.join("、")}。\n\n文章：\n${options.body}`;
    const response = await fetch(endpoint, { method: "POST", signal: options.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` }, body: JSON.stringify({ model: options.model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }) });
    if (!response.ok) throw new HexoSendError("METADATA_INVALID", `AI 请求失败：HTTP ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content; if (!content) throw new HexoSendError("METADATA_INVALID", "AI 未返回内容");
    let json: unknown; try { json = JSON.parse(content); } catch (cause) { throw new HexoSendError("METADATA_INVALID", "AI 返回了无效 JSON", {}, { cause }); }
    return ResponseSchema.parse(json);
  }
  static cacheKey(body: string, categories: readonly string[][], model: string): string { return createHash("sha256").update(`${body}\0${JSON.stringify(categories)}\0${model}\0v1`).digest("hex"); }
}
