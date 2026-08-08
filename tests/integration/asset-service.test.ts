import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AssetService } from "../../src/infrastructure/assets/asset-service";
import { NodeProcessRunner } from "../../src/infrastructure/process/node-process-runner";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../src/ports/process-runner";

describe("AssetService",()=>{
  let root=""; afterEach(async()=>{if(root)await fs.rm(root,{recursive:true,force:true});});
  it("copies local images, rewrites links and chooses the cover",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-assets-")); const source=path.join(root,"source.jpg"); await fs.writeFile(source,new Uint8Array(128));
    const image={raw:"![示意图](source.jpg)",target:"source.jpg",alt:"示意图",line:1,kind:"markdown" as const,remote:false};
    const result=await new AssetService(new NodeProcessRunner()).process({repositoryPath:root,imagesDir:"source/images",abbrlink:"123",body:image.raw,images:[image],resolveLocal:async()=>source});
    expect(result.body).toBe("![示意图](/images/123/01.jpg)"); expect(result.firstImage).toBe("/images/123/01.jpg"); await expect(fs.stat(path.join(root,"source","images","123","01.jpg"))).resolves.toMatchObject({size:128});
  });
  it("rejects private remote URLs and empty alt",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-assets-")); const service=new AssetService(new NodeProcessRunner());
    await expect(service.process({repositoryPath:root,imagesDir:"source/images",abbrlink:"1",body:"![x](http://127.0.0.1/a.jpg)",images:[{raw:"![x](http://127.0.0.1/a.jpg)",target:"http://127.0.0.1/a.jpg",alt:"x",line:1,kind:"markdown",remote:true}],resolveLocal:async()=>null})).rejects.toMatchObject({code:"ASSET_FAILED"});
    await expect(service.process({repositoryPath:root,imagesDir:"source/images",abbrlink:"1",body:"![](a.jpg)",images:[{raw:"![](a.jpg)",target:"a.jpg",alt:"",line:1,kind:"markdown",remote:false}],resolveLocal:async()=>null})).rejects.toMatchObject({code:"ASSET_FAILED"});
  });
  it("preflights all local images before copying any file",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-assets-"));const source=path.join(root,"source.jpg");await fs.writeFile(source,new Uint8Array(128));const service=new AssetService(new NodeProcessRunner());
    const images=[{raw:"![one](one.jpg)",target:"one.jpg",alt:"one",line:1,kind:"markdown" as const,remote:false},{raw:"![two](missing.jpg)",target:"missing.jpg",alt:"two",line:2,kind:"markdown" as const,remote:false}];
    await expect(service.process({repositoryPath:root,imagesDir:"source/images",abbrlink:"1",body:images.map(item=>item.raw).join("\n"),images,resolveLocal:async(image)=>image.target==="one.jpg"?source:null})).rejects.toMatchObject({code:"ASSET_FAILED"});
    await expect(fs.access(path.join(root,"source","images","1","01.jpg"))).rejects.toThrow();
  });
  it("revalidates every proxy redirect and blocks private destinations",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-assets-")); const runner=new RedirectRunner(); const target="https://93.184.216.34/a.jpg";
    await expect(new AssetService(runner).process({repositoryPath:root,imagesDir:"source/images",abbrlink:"1",body:`![x](${target})`,images:[{raw:`![x](${target})`,target,alt:"x",line:1,kind:"markdown",remote:true}],resolveLocal:async()=>null,proxy:"http://127.0.0.1:7890"})).rejects.toMatchObject({code:"ASSET_FAILED"});
    expect(runner.requests).toHaveLength(1);
  });
});

class RedirectRunner implements ProcessRunner {
  requests: ProcessRequest[] = [];
  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    return { executable:request.executable,args:request.args,cwd:request.cwd,exitCode:0,stdout:"302\thttp://127.0.0.1/private.jpg\ttext/html",stderr:"",durationMs:1 };
  }
}
