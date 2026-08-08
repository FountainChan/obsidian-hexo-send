import { promises as fs } from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { promises as dns } from "node:dns";
import { HexoSendError } from "../../domain/errors";
import type { ImageReference } from "../../domain/publish-types";
import { SafeFileSystem } from "../files/safe-file-system";

export interface AssetProcessResult { body: string; paths: string[]; warnings: string[]; firstImage: string | false; }
export type LocalAssetResolver = (reference: ImageReference) => Promise<string | null>;

export class AssetService {
  async process(options: { repositoryPath: string; imagesDir: string; abbrlink: string; body: string; images: readonly ImageReference[]; resolveLocal: LocalAssetResolver; signal?: AbortSignal; beforeWrite?: (relativePath: string) => Promise<void>; allowRemoteFallback?: boolean }): Promise<AssetProcessResult> {
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
          const ext = extensionFor(image.target,image.remote); const relative = path.posix.join(options.imagesDir, options.abbrlink, `${String(number).padStart(2,"0")}${ext}`);
          await options.beforeWrite?.(relative);
          if (image.remote) await this.download(image.target, safeFs, relative, options.signal);
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
  private async download(url: string, safeFs: SafeFileSystem, targetRelativePath: string, signal?: AbortSignal): Promise<void> {
    const bytes = await downloadPublicImage(url, signal);
    await safeFs.write(targetRelativePath, bytes);
  }
}
function extensionFor(target: string,remote=false): string { const ext = path.extname(new URL(target, "file:///").pathname).toLowerCase();if(remote&&ext===".svg")throw new Error("远程 SVG 属于主动内容，拒绝自动下载");return /^\.(jpe?g|png|gif|webp|svg|avif)$/.test(ext) ? (ext === ".jpeg" ? ".jpg" : ext) : ".jpg"; }
async function resolvePublicHttpUrl(value: string, signal:AbortSignal|undefined, deadline:number): Promise<{ url: URL; address: string }> {
  const url = new URL(value); if (!/^https?:$/.test(url.protocol)) throw new Error("仅支持 HTTP(S) 图片");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || isPrivateAddress(host)) throw new Error("拒绝访问本机或私网图片地址");
  const addresses=await withinDeadline(dns.lookup(host,{all:true}),signal,deadline,"图片域名解析超时"); if(addresses.some((item)=>isPrivateAddress(item.address))) throw new Error("图片域名解析到了本机或私网地址");
  const address=addresses[0]?.address;if(!address)throw new Error("图片域名无法解析");
  return {url,address};
}

async function downloadPublicImage(value:string,signal?:AbortSignal,redirects=0,deadline=Date.now()+30_000):Promise<Uint8Array>{
  if(redirects>5)throw new Error("图片重定向次数超过 5 次");
  const {url,address}=await resolvePublicHttpUrl(value,signal,deadline);if(signal?.aborted)throw new HexoSendError("CANCELLED","图片处理已取消");
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error("图片下载超时");
  return await new Promise<Uint8Array>((resolve,reject)=>{
    let settled=false;const finish=(error?:unknown,bytes?:Uint8Array)=>{if(settled)return;settled=true;window.clearTimeout(timeout);signal?.removeEventListener("abort",onAbort);if(error)reject(error instanceof Error?error:new Error(typeof error==="string"?error:"图片下载失败"));else if(bytes)resolve(bytes);else reject(new Error("图片响应为空"));};
    const options={protocol:url.protocol,hostname:address,port:url.port||undefined,path:`${url.pathname}${url.search}`,method:"GET",headers:{Host:url.host,"User-Agent":"Mozilla/5.0 Obsidian-Hexo-Send/0.1"},...(url.protocol==="https:"?{servername:url.hostname}:{})};
    const request=(url.protocol==="https:"?https:http).request(options,(response)=>{
      const status=response.statusCode??0;
      if(status>=300&&status<400){const location=response.headers.location;response.resume();if(!location){finish(new Error("图片重定向缺少 Location"));return;}void downloadPublicImage(new URL(location,url).toString(),signal,redirects+1,deadline).then((bytes)=>finish(undefined,bytes),finish);return;}
      if(status<200||status>=300){response.resume();finish(new Error(`HTTP ${status}`));return;}
      const contentType=response.headers["content-type"]??"";if(!contentType.toLowerCase().startsWith("image/")||contentType.toLowerCase().includes("svg")){response.resume();finish(new Error(`响应不是受支持的安全图片：${contentType||"未知类型"}`));return;}
      const declared=Number(response.headers["content-length"]??0);if(declared>20*1024*1024){response.resume();finish(new Error("图片超过 20MB"));return;}
      const chunks:Buffer[]=[];let total=0;
      response.on("data",(chunk:Buffer)=>{total+=chunk.length;if(total>20*1024*1024){response.destroy(new Error("图片超过 20MB"));return;}chunks.push(chunk);});
      response.once("error",finish);response.once("end",()=>{if(total<32){finish(new Error("图片大小无效"));return;}finish(undefined,new Uint8Array(Buffer.concat(chunks,total)));});
    });
    const onAbort=()=>request.destroy(new HexoSendError("CANCELLED","图片处理已取消"));
    const timeout=window.setTimeout(()=>request.destroy(new Error("图片下载超时")),remaining);
    signal?.addEventListener("abort",onAbort,{once:true});request.once("error",finish);request.end();
  });
}

function withinDeadline<T>(promise:Promise<T>,signal:AbortSignal|undefined,deadline:number,message:string):Promise<T>{
  return new Promise((resolve,reject)=>{
    let settled=false;const finish=(error:unknown,value?:T)=>{if(settled)return;settled=true;window.clearTimeout(timer);signal?.removeEventListener("abort",onAbort);if(error)reject(error instanceof Error?error:new Error(typeof error==="string"?error:"图片请求失败"));else resolve(value as T);};
    const onAbort=()=>finish(new HexoSendError("CANCELLED","图片处理已取消"));const remaining=deadline-Date.now();if(remaining<=0){reject(new Error(message));return;}
    const timer=window.setTimeout(()=>finish(new Error(message)),remaining);signal?.addEventListener("abort",onAbort,{once:true});promise.then((value)=>finish(null,value),finish);
  });
}

export function isPrivateAddress(host:string):boolean {
  const value=host.toLowerCase().replace(/^\[|\]$/g,"");const version=isIP(value);
  if(version===4){const [a=0,b=0,c=0]=value.split(".").map(Number);return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113);}
  if(version===6){if(value==="::"||value==="::1"||/^(?:fc|fd|fe8|fe9|fea|feb|ff)/.test(value)||/^2001:db8(?::|$)/.test(value))return true;const mapped=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);return mapped?.[1]?isPrivateAddress(mapped[1]):false;}
  return false;
}
