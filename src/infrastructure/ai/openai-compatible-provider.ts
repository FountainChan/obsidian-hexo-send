import { createHash } from "node:crypto";
import { requestUrl } from "obsidian";
import type { RequestUrlResponse } from "obsidian";
import { z } from "zod";
import { HexoSendError } from "../../domain/errors";

export const AiMetadataSchema = z.object({
  title: z.string().min(1).max(200), category: z.string().min(1).max(100), tags: z.array(z.string().min(1).max(100)).min(3).max(5),
  keywords: z.array(z.string().min(1).max(100)).min(1).max(10), description: z.string().min(1).max(500), confidence: z.enum(["high","low"]),
});
const ApiResponseSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().min(1).max(1_000_000) }) })).min(1) });
export type AiMetadata = z.infer<typeof AiMetadataSchema>;

export class OpenAiCompatibleProvider {
  async enrich(options: { endpoint: string; model: string; apiKey: string; body: string; categories: readonly string[][]; tags: readonly string[]; signal?: AbortSignal }): Promise<AiMetadata> {
    const endpoint = aiEndpoint(options.endpoint);
    const prompt = `根据文章生成 Hexo 元数据。只输出 JSON：title, category, tags(3-5), keywords, description(80-160字), confidence(high/low)。可选分类：${options.categories.map((c)=>c.join("/")).join("、")}。优先复用标签：${options.tags.join("、")}。\n\n文章：\n${options.body}`;
    if (options.signal?.aborted) throw new HexoSendError("CANCELLED", "元数据分析已取消");
    const response = await requestWithDeadline(requestUrl({ url:endpoint, method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${options.apiKey}` }, body:JSON.stringify({ model:options.model, temperature:0.2, response_format:{type:"json_object"}, messages:[{role:"user",content:prompt}] }), throw:false }), options.signal);
    if (response.status < 200 || response.status >= 300) throw new HexoSendError("METADATA_INVALID", `AI 请求失败：HTTP ${response.status}`);
    if (response.text.length > 1_000_000) throw new HexoSendError("METADATA_INVALID", "AI 响应超过 1MB");
    let envelope: unknown; try { envelope = JSON.parse(response.text); } catch (cause) { throw new HexoSendError("METADATA_INVALID", "AI 返回了无效响应", {}, { cause }); }
    const content = ApiResponseSchema.parse(envelope).choices[0]?.message.content; if (!content) throw new HexoSendError("METADATA_INVALID", "AI 未返回内容");
    let json: unknown; try { json = JSON.parse(content); } catch (cause) { throw new HexoSendError("METADATA_INVALID", "AI 返回了无效 JSON", {}, { cause }); }
    return AiMetadataSchema.parse(json);
  }
  static cacheKey(body: string, categories: readonly string[][], model: string): string { return createHash("sha256").update(`${body}\0${JSON.stringify(categories)}\0${model}\0v1`).digest("hex"); }
}

function aiEndpoint(value:string):string {
  let url:URL; try { url=new URL(`${value.replace(/\/$/,"")}/chat/completions`); } catch { throw new HexoSendError("METADATA_INVALID","AI endpoint 无效"); }
  const loopback=url.hostname==="localhost"||url.hostname==="127.0.0.1"||url.hostname==="[::1]"||url.hostname==="::1";
  if(url.username||url.password||!(url.protocol==="https:"||(url.protocol==="http:"&&loopback)))throw new HexoSendError("METADATA_INVALID","AI endpoint 必须使用 HTTPS；本机 loopback 可使用 HTTP");
  return url.toString();
}

function requestWithDeadline(request:Promise<RequestUrlResponse>,signal?:AbortSignal):Promise<RequestUrlResponse>{
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{window.clearTimeout(timer);signal?.removeEventListener("abort",onAbort);};
    const succeed=(value:RequestUrlResponse)=>{if(settled)return;settled=true;cleanup();resolve(value);};
    const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();reject(error instanceof Error?error:new Error(String(error)));};
    const onAbort=()=>fail(new HexoSendError("CANCELLED","元数据分析已取消"));
    const timer=window.setTimeout(()=>fail(new HexoSendError("PROCESS_TIMEOUT","AI 请求超时")),60_000);
    signal?.addEventListener("abort",onAbort,{once:true}); request.then(succeed,fail);
  });
}
