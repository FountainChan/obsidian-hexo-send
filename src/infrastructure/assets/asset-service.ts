import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { promises as dns } from "node:dns";
import { HexoSendError } from "../../domain/errors";
import type { ImageReference } from "../../domain/publish-types";
import type { ProcessRunner } from "../../ports/process-runner";
import { SafeFileSystem } from "../files/safe-file-system";

export interface AssetProcessResult { body: string; paths: string[]; warnings: string[]; firstImage: string | false; }
export type LocalAssetResolver = (reference: ImageReference) => Promise<string | null>;

export class AssetService {
  constructor(private readonly runner: ProcessRunner) {}
  async process(options: { repositoryPath: string; imagesDir: string; abbrlink: string; body: string; images: readonly ImageReference[]; resolveLocal: LocalAssetResolver; proxy?: string; signal?: AbortSignal; beforeWrite?: (relativePath: string) => Promise<void>; allowRemoteFallback?: boolean }): Promise<AssetProcessResult> {
    const safeFs = new SafeFileSystem(options.repositoryPath);
    let body = options.body; const paths: string[] = []; const warnings: string[] = []; let firstImage: string | false = false;
    const localSources=new Map<string,string>();
    for(const image of options.images){
      if(!image.alt.trim())throw new HexoSendError("ASSET_FAILED",`${image.line} 行图片 alt 为空，请在预览中补齐`);
      if(!image.remote&&!localSources.has(image.target)){const source=await options.resolveLocal(image);if(!source)throw new HexoSendError("ASSET_FAILED",`${image.line} 行找不到本地附件：${image.target}`);await fs.access(source).catch(()=>{throw new HexoSendError("ASSET_FAILED",`${image.line} 行本地附件不存在：${image.target}`);});localSources.set(image.target,source);}
    }
    const seen = new Map<string,string>(); let number = 0;
    for (const image of options.images) {
      if (options.signal?.aborted) throw new HexoSendError("CANCELLED", "图片处理已取消");
      let publicPath = seen.get(image.target);
      if (!publicPath) {
        number += 1;
        try {
          const ext = extensionFor(image.target); const relative = path.posix.join(options.imagesDir, options.abbrlink, `${String(number).padStart(2,"0")}${ext}`);
          await options.beforeWrite?.(relative);
          if (image.remote) await this.download(image.target, safeFs, relative, options.repositoryPath, options.proxy, options.signal);
          else { const source = localSources.get(image.target); if (!source) throw new Error("找不到本地附件"); await safeFs.copy(source, relative); }
          publicPath = `/${relative.replace(/^source\//, "")}`; seen.set(image.target, publicPath); paths.push(relative); if (!firstImage) firstImage = publicPath;
        } catch (error) {
          if (image.remote && options.allowRemoteFallback) { warnings.push(`${image.line} 行远程图片下载失败，已按用户确认保留原 URL：${image.target}`); continue; }
          throw new HexoSendError("ASSET_FAILED", `${image.line} 行图片处理失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const replacement = `![${image.alt}](${publicPath})`; body = body.replace(image.raw, replacement);
    }
    return { body, paths, warnings, firstImage };
  }
  private async download(url: string, safeFs: SafeFileSystem, targetRelativePath: string, cwd: string, proxy?: string, signal?: AbortSignal): Promise<void> {
    await assertPublicHttpUrl(url);
    if (proxy) {
      const temporary = path.join(os.tmpdir(), `hexo-send-download-${randomUUID()}.tmp`);
      try {
        let current = url;
        for (let redirects = 0; redirects <= 5; redirects += 1) {
          await assertPublicHttpUrl(current);
          const result = await this.runner.run({ executable: "curl.exe", args: ["--fail","--silent","--show-error","--max-time","30","--max-redirs","0","--max-filesize","20971520","--proxy",proxy,"--output",temporary,"--write-out","%{http_code}\t%{redirect_url}\t%{content_type}",current], cwd, timeoutMs: 45_000, signal });
          const [statusText = "0", redirectUrl = "", contentType = ""] = result.stdout.trim().split("\t");
          const status = Number(statusText);
          if (status >= 300 && status < 400) {
            if (!redirectUrl || redirects === 5) throw new Error("图片重定向无效或次数超过 5 次");
            current = new URL(redirectUrl, current).toString();
            continue;
          }
          if (status < 200 || status >= 300) throw new Error(`HTTP ${status || "未知"}`);
          if (!contentType.toLowerCase().startsWith("image/")) throw new Error(`响应不是图片：${contentType || "未知类型"}`);
          const stat = await fs.stat(temporary); if (stat.size < 32 || stat.size > 20*1024*1024) throw new Error("图片大小无效");
          await safeFs.copy(temporary, targetRelativePath);
          return;
        }
      } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
      throw new Error("图片重定向次数超过 5 次");
    }
    const timeout = AbortSignal.timeout(30_000); const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let current=url; let response:Response|undefined;
    for(let redirects=0;redirects<=5;redirects++){
      await assertPublicHttpUrl(current); response=await fetch(current,{redirect:"manual",signal:combined,headers:{"User-Agent":"Mozilla/5.0 Obsidian-Hexo-Send/0.1"}});
      if(response.status>=300&&response.status<400){ const location=response.headers.get("location"); if(!location)throw new Error("图片重定向缺少 Location"); current=new URL(location,current).toString(); continue; }
      break;
    }
    if(!response||response.status>=300&&response.status<400)throw new Error("图片重定向次数超过 5 次");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") || 0); if (length > 20*1024*1024) throw new Error("图片超过 20MB");
    const type = response.headers.get("content-type") || ""; if (!type.startsWith("image/")) throw new Error(`响应不是图片：${type || "未知类型"}`);
    const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length < 32 || bytes.length > 20*1024*1024) throw new Error("图片大小无效");
    await safeFs.write(targetRelativePath, bytes);
  }
}
function extensionFor(target: string): string { const ext = path.extname(new URL(target, "file:///").pathname).toLowerCase(); return /^\.(jpe?g|png|gif|webp|svg|avif)$/.test(ext) ? (ext === ".jpeg" ? ".jpg" : ext) : ".jpg"; }
async function assertPublicHttpUrl(value: string): Promise<void> {
  const url = new URL(value); if (!/^https?:$/.test(url.protocol)) throw new Error("仅支持 HTTP(S) 图片");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || isPrivateAddress(host)) throw new Error("拒绝访问本机或私网图片地址");
  const addresses=await dns.lookup(host,{all:true}); if(addresses.some((item)=>isPrivateAddress(item.address))) throw new Error("图片域名解析到了本机或私网地址");
}
function isPrivateAddress(host:string):boolean { const value=host.toLowerCase().replace(/^\[|\]$/g,""); return value==="::1"||value==="0.0.0.0"||/^127\./.test(value)||/^10\./.test(value)||/^192\.168\./.test(value)||/^169\.254\./.test(value)||/^172\.(1[6-9]|2\d|3[01])\./.test(value)||/^(?:fc|fd|fe8|fe9|fea|feb)/.test(value)||/^::ffff:(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(value); }
