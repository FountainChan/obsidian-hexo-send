import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach,describe,expect,it } from "vitest";
import { HexoService } from "../../src/infrastructure/hexo/hexo-service";
import type { ProcessRequest,ProcessResult,ProcessRunner } from "../../src/ports/process-runner";

describe("HexoService",()=>{
  let root="";afterEach(async()=>{if(root)await fs.rm(root,{recursive:true,force:true});});
  it("prefers the repository-local Hexo CLI through Node",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-cli-"));const cli=path.join(root,"node_modules","hexo","bin","hexo");await fs.mkdir(path.dirname(cli),{recursive:true});await fs.writeFile(cli,"module.exports={}");
    const runner=new RecordingRunner();const service=new HexoService(runner,"npx","custom-node");await service.clean(root);await service.generate(root);
    expect(runner.requests).toHaveLength(2);expect(runner.requests.every((request)=>request.executable==="custom-node")).toBe(true);expect(runner.requests[0]?.args[0]).toBe(cli);expect(runner.requests[1]?.args).toContain("--bail");
  });
});
class RecordingRunner implements ProcessRunner{requests:ProcessRequest[]=[];async run(request:ProcessRequest):Promise<ProcessResult>{this.requests.push(request);return{executable:request.executable,args:request.args,cwd:request.cwd,exitCode:0,stdout:"",stderr:"",durationMs:1};}}
