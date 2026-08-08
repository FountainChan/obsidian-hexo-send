import { promises as fs } from "node:fs";
import path from "node:path";
import { HexoSendError } from "../../domain/errors";
import { splitFrontmatter } from "../../domain/frontmatter";
import type { ProcessRunner } from "../../ports/process-runner";
import { SafeFileSystem } from "../files/safe-file-system";

export class HexoService {
  constructor(private readonly runner: ProcessRunner, private readonly nodeExecutable="node") {}
  async clean(repositoryPath: string, signal?: AbortSignal): Promise<void> {
    await this.runHexo(repositoryPath,["clean"],120_000,signal);
  }
  async generate(repositoryPath: string, signal?: AbortSignal): Promise<void> {
    try {
      await this.runHexo(repositoryPath,["generate","--bail"],300_000,signal);
    } catch (cause) {
      throw new HexoSendError("HEXO_VALIDATION_FAILED", "Hexo generate 验证失败", {}, { cause });
    }
  }
  private async runHexo(repositoryPath:string,args:readonly string[],timeoutMs:number,signal?:AbortSignal):Promise<void>{
    const localCli=path.join(repositoryPath,"node_modules","hexo","bin","hexo");
    const local=await fs.access(localCli).then(()=>true).catch(()=>false);
    if(!local)throw new HexoSendError("HEXO_VALIDATION_FAILED","未找到仓库本地 Hexo CLI，请先在 Hexo 仓库安装依赖");
    await this.runner.run({executable:this.nodeExecutable,args:[localCli,...args,"--cwd",repositoryPath],cwd:repositoryPath,timeoutMs,signal});
  }
  async readAbbrlink(repositoryPath: string, relativePath: string): Promise<string> {
    const content = await new SafeFileSystem(repositoryPath).read(relativePath);
    const value = splitFrontmatter(content).frontmatter.abbrlink;
    const abbrlink = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
    if (!abbrlink) throw new HexoSendError("HEXO_VALIDATION_FAILED", `${relativePath} 未回写 abbrlink`);
    return abbrlink;
  }
}
