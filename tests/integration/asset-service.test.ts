import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AssetService, isPrivateAddress } from "../../src/infrastructure/assets/asset-service";

describe("AssetService",()=>{
  let root=""; afterEach(async()=>{if(root)await fs.rm(root,{recursive:true,force:true});});
  it("copies local images, rewrites links and chooses the cover",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-assets-")); const source=path.join(root,"source.jpg"); await fs.writeFile(source,new Uint8Array(128));
    const image={raw:"![示意图](source.jpg)",target:"source.jpg",alt:"示意图",line:1,kind:"markdown" as const,remote:false};
    const result=await new AssetService().process({repositoryPath:root,imagesDir:"source/images",abbrlink:"123",body:image.raw,images:[image],resolveLocal:async()=>source});
    expect(result.body).toBe("![示意图](/images/123/01.jpg)"); expect(result.firstImage).toBe("/images/123/01.jpg"); await expect(fs.stat(path.join(root,"source","images","123","01.jpg"))).resolves.toMatchObject({size:128});
  });
  it("rejects private remote URLs and empty alt",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-assets-")); const service=new AssetService();
    await expect(service.process({repositoryPath:root,imagesDir:"source/images",abbrlink:"1",body:"![x](http://127.0.0.1/a.jpg)",images:[{raw:"![x](http://127.0.0.1/a.jpg)",target:"http://127.0.0.1/a.jpg",alt:"x",line:1,kind:"markdown",remote:true}],resolveLocal:async()=>null})).rejects.toMatchObject({code:"ASSET_FAILED"});
    await expect(service.process({repositoryPath:root,imagesDir:"source/images",abbrlink:"1",body:"![](a.jpg)",images:[{raw:"![](a.jpg)",target:"a.jpg",alt:"",line:1,kind:"markdown",remote:false}],resolveLocal:async()=>null})).rejects.toMatchObject({code:"ASSET_FAILED"});
  });
  it("preflights all local images before copying any file",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-assets-"));const source=path.join(root,"source.jpg");await fs.writeFile(source,new Uint8Array(128));const service=new AssetService();
    const images=[{raw:"![one](one.jpg)",target:"one.jpg",alt:"one",line:1,kind:"markdown" as const,remote:false},{raw:"![two](missing.jpg)",target:"missing.jpg",alt:"two",line:2,kind:"markdown" as const,remote:false}];
    await expect(service.process({repositoryPath:root,imagesDir:"source/images",abbrlink:"1",body:images.map(item=>item.raw).join("\n"),images,resolveLocal:async(image)=>image.target==="one.jpg"?source:null})).rejects.toMatchObject({code:"ASSET_FAILED"});
    await expect(fs.access(path.join(root,"source","images","1","01.jpg"))).rejects.toThrow();
  });
  it("classifies private, reserved, and public network addresses",()=>{
    for(const address of ["127.0.0.1","10.0.0.1","100.64.0.1","169.254.1.1","172.16.0.1","192.168.1.1","198.18.0.1","203.0.113.1","::1","fc00::1","fe80::1","2001:db8::1"])expect(isPrivateAddress(address)).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
  it("rejects remote SVG active content before downloading",async()=>{
    root=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-assets-"));const target="https://example.com/active.svg";
    await expect(new AssetService().process({repositoryPath:root,imagesDir:"source/images",abbrlink:"1",body:`![x](${target})`,images:[{raw:`![x](${target})`,target,alt:"x",line:1,kind:"markdown",remote:true}],resolveLocal:async()=>null})).rejects.toMatchObject({code:"ASSET_FAILED"});
  });
});
