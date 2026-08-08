import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitService } from "../../src/infrastructure/git/git-service";
import { NodeProcessRunner } from "../../src/infrastructure/process/node-process-runner";

describe("GitService", () => {
  let repository = ""; const runner = new NodeProcessRunner(); const git = new GitService(runner);
  beforeEach(async () => {
    repository = await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-git-"));
    const run = (args:string[]) => runner.run({ executable:"git",args:["-C",repository,...args],cwd:repository });
    await run(["init","-b","main"]); await run(["config","user.name","Test User"]); await run(["config","user.email","test@example.com"]);
    await fs.writeFile(path.join(repository,"README.md"),"base\n"); await run(["add","--","README.md"]); await run(["commit","-m","base"]);
  });
  afterEach(async () => { await fs.rm(repository,{recursive:true,force:true,maxRetries:3}); });
  it("stages and commits only the exact allowlist", async () => {
    await fs.mkdir(path.join(repository,"source","_posts"),{recursive:true}); await fs.writeFile(path.join(repository,"source","_posts","post.md"),"post\n"); await fs.writeFile(path.join(repository,"unrelated.txt"),"leave me\n");
    const snapshot = await git.assertSafeForWrite(repository); expect(snapshot.branch).toBe("main");
    const allowed = ["source/_posts/post.md"]; await git.stageExact(repository,allowed); await git.verifyIndex(repository,allowed); const hash = await git.commit(repository,"post: test"); await git.verifyCommit(repository,hash,allowed);
    expect(await git.changedPaths(repository)).toContain("unrelated.txt");
  });
  it("blocks an existing staged change", async () => {
    await fs.writeFile(path.join(repository,"staged.txt"),"staged\n"); await runner.run({executable:"git",args:["-C",repository,"add","--","staged.txt"],cwd:repository});
    await expect(git.assertSafeForWrite(repository)).rejects.toMatchObject({code:"GIT_UNSAFE"});
  });
  it("unstages only journal-owned paths during recovery", async () => {
    await fs.writeFile(path.join(repository,"owned.txt"),"owned\n"); await git.stageExact(repository,["owned.txt"]); await git.unstageExact(repository,["owned.txt"]);
    expect((await git.inspect(repository)).staged).toEqual([]);
  });
  it("blocks an index lock",async()=>{
    await fs.writeFile(path.join(repository,".git","index.lock"),"");
    await expect(git.assertSafeForWrite(repository)).rejects.toMatchObject({code:"GIT_UNSAFE"});
  });
});
