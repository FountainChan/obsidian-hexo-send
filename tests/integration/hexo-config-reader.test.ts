import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readHexoConfig } from "../../src/infrastructure/hexo/hexo-config-reader";

describe("readHexoConfig", () => {
  let root = ""; afterEach(async()=>{ if(root) await fs.rm(root,{recursive:true,force:true,maxRetries:3}); });
  it("discovers Hexo settings and taxonomy", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-config-")); await fs.mkdir(path.join(root,"source","_posts","seo"),{recursive:true});
    await fs.writeFile(path.join(root,"_config.yml"),"title: Demo\nauthor: Tester\nurl: https://example.com\nsource_dir: source\ncategory_map:\n  技术: tech\nabbrlink:\n  alg: crc32\n");
    await fs.writeFile(path.join(root,"package.json"),JSON.stringify({dependencies:{hexo:"^8.1.0","hexo-abbrlink":"^2.2.1"}}));
    await fs.writeFile(path.join(root,"source","_posts","seo","one.md"),"---\ncategories:\n  - [SEO教程, 入门教程]\ntags: [Hexo, Git]\n---\nbody\n");
    await fs.writeFile(path.join(root,"source","_posts","flat.md"),"---\ncategories: [技术, 生活]\ntags: [Obsidian]\n---\nbody\n");
    const result = await readHexoConfig(root); expect(result.hexoVersion).toBe("^8.1.0"); expect(result.abbrlinkInstalled).toBe(true); expect(result.categories).toEqual(expect.arrayContaining([["技术"],["生活"],["SEO教程","入门教程"]])); expect(result.tags).toEqual(["Git","Hexo","Obsidian"]);
  });
  it("rejects source directories outside the repository", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-config-"));
    await fs.writeFile(path.join(root,"_config.yml"),"source_dir: ../outside\n");
    await fs.writeFile(path.join(root,"package.json"),"{}");
    await expect(readHexoConfig(root)).rejects.toMatchObject({code:"PATH_OUTSIDE_REPOSITORY"});
  });
});
