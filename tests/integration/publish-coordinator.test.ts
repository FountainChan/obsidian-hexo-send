import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PublishCoordinator } from "../../src/application/publish-coordinator";
import { createPublishPlan } from "../../src/application/create-publish-plan";
import type { HexoEnvironment, ReviewedArticle } from "../../src/domain/publish-types";
import { GitService } from "../../src/infrastructure/git/git-service";
import { NodeProcessRunner } from "../../src/infrastructure/process/node-process-runner";
import { TempJobJournal } from "../../src/infrastructure/files/temp-job-journal";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../src/ports/process-runner";
import { DEFAULT_SETTINGS } from "../../src/settings";

describe("PublishCoordinator", () => {
  let repository = "";
  afterEach(async()=>{ if(repository) await fs.rm(repository,{recursive:true,force:true,maxRetries:3}); });
  it("runs two Hexo generations, creates one exact commit, and never pushes", async () => {
    repository = await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-publish-")); const nodeRunner = new NodeProcessRunner();
    const gitRun = (args:string[]) => nodeRunner.run({executable:"git",args:["-C",repository,...args],cwd:repository});
    await gitRun(["init","-b","main"]); await gitRun(["config","user.name","Test User"]); await gitRun(["config","user.email","test@example.com"]);
    await fs.writeFile(path.join(repository,"README.md"),"base\n"); await gitRun(["add","--","README.md"]); await gitRun(["commit","-m","base"]); await fs.mkdir(path.join(repository,"source","_posts"),{recursive:true}); await installFakeHexoCli(repository);
    const runner = new RoutingRunner(nodeRunner); const git = new GitService(runner); const baseline = await git.assertSafeForWrite(repository);
    const article: ReviewedArticle = {
      sourcePath:"Notes/post.md", body:"正文", sourceFrontmatter:{}, contentHash:"hash", images:[], unsupported:[], action:"create", targetRelativePath:"source/_posts/post.md", selected:true, warnings:[],
      metadata:{ title:"post",date:"2026-08-08 12:00:00",comments:true,categories:[["技术"]],tags:["Hexo","Git","Obsidian"],keywords:["Hexo"],abbrlink:"",topImg:false,cover:false,description:"这是一段完整的中文描述，用于验证预发布流程能够通过元数据检查并成功进入两阶段生成以及本地提交阶段。".repeat(2) }
    };
    const environment = env(repository); const plan = await createPublishPlan([article],environment,baseline.head);
    const result = await new PublishCoordinator(runner).execute(plan,environment,DEFAULT_SETTINGS,async()=>null,()=>undefined);
    expect(result.state).toBe("committed"); expect(result.commitHash).toMatch(/^[a-f0-9]{40}$/); expect(result.articles[0]?.expectedUrl).toBe("https://example.com/tech/12345.html"); expect(runner.generateCount).toBe(2); expect(runner.pushCount).toBe(0);
    const files = await nodeRunner.run({executable:"git",args:["-C",repository,"diff-tree","--no-commit-id","--name-only","-r",result.commitHash!],cwd:repository});
    expect(files.stdout.trim()).toBe("source/_posts/post.md"); expect(await fs.readFile(path.join(repository,"source","_posts","post.md"),"utf8")).toContain("abbrlink: \"12345\"");
  });
  it("does not commit when final Hexo generation fails",async()=>{
    repository = await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-publish-")); const nodeRunner=new NodeProcessRunner(); const run=(args:string[])=>nodeRunner.run({executable:"git",args:["-C",repository,...args],cwd:repository});
    await run(["init","-b","main"]); await run(["config","user.name","Test User"]); await run(["config","user.email","test@example.com"]); await fs.writeFile(path.join(repository,"README.md"),"base\n"); await run(["add","--","README.md"]); await run(["commit","-m","base"]); await fs.mkdir(path.join(repository,"source","_posts"),{recursive:true}); await installFakeHexoCli(repository);
    const runner=new RoutingRunner(nodeRunner,true); const baseline=await new GitService(runner).assertSafeForWrite(repository); const article=makeArticle(); const environment=env(repository); const plan=await createPublishPlan([article],environment,baseline.head);
    const result=await new PublishCoordinator(runner).execute(plan,environment,DEFAULT_SETTINGS,async()=>null,()=>undefined);
    expect(result.state).toBe("validation_failed"); expect((await run(["rev-list","--count","HEAD"])).stdout.trim()).toBe("1"); expect((await new GitService(runner).inspect(repository)).staged).toEqual([]);
    await TempJobJournal.restoreAt(TempJobJournal.pathFor(result.jobId)); await fs.rm(TempJobJournal.pathFor(result.jobId),{recursive:true,force:true});
  });
});

class RoutingRunner implements ProcessRunner {
  generateCount = 0; pushCount = 0;
  constructor(private readonly delegate: ProcessRunner, private readonly failSecondGenerate=false) {}
  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.args[0] === path.join(request.cwd,"node_modules","hexo","bin","hexo")) {
      if (request.args.includes("generate")) {
        this.generateCount += 1; if(this.failSecondGenerate&&this.generateCount===2) throw new Error("fake final generate failure"); const file = path.join(request.cwd,"source","_posts","post.md"); const content = await fs.readFile(file,"utf8");
        if (/abbrlink:\s*(?:null)?\s*$/m.test(content)) await fs.writeFile(file,content.replace(/abbrlink:\s*(?:null)?\s*$/m,'abbrlink: "12345"'));
      }
      return {executable:request.executable,args:request.args,cwd:request.cwd,exitCode:0,stdout:"",stderr:"",durationMs:1};
    }
    if (request.executable === "git" && request.args.includes("push")) this.pushCount += 1;
    return await this.delegate.run(request);
  }
}

async function installFakeHexoCli(repositoryPath:string):Promise<void>{
  const cli=path.join(repositoryPath,"node_modules","hexo","bin","hexo"); await fs.mkdir(path.dirname(cli),{recursive:true}); await fs.writeFile(cli,"// intercepted by RoutingRunner\n");
}

function makeArticle(): ReviewedArticle {
  return { sourcePath:"Notes/post.md",body:"正文",sourceFrontmatter:{},contentHash:"hash",images:[],unsupported:[],action:"create",targetRelativePath:"source/_posts/post.md",selected:true,warnings:[],metadata:{title:"post",date:"2026-08-08 12:00:00",comments:true,categories:[["技术"]],tags:["Hexo","Git","Obsidian"],keywords:["Hexo"],abbrlink:"",topImg:false,cover:false,description:"这是一段完整的中文描述，用于验证预发布流程能够通过元数据检查并成功进入两阶段生成以及本地提交阶段。".repeat(2)}};
}

function env(repositoryPath:string): HexoEnvironment {
  return { repositoryPath,siteTitle:"Demo",author:"Tester",url:"https://example.com",language:"zh-CN",timezone:"Asia/Shanghai",sourceDir:"source",postsDir:"source/_posts",seoPostsDir:"source/_posts/seo",imagesDir:"source/images",permalink:":category/:abbrlink.html",postAssetFolder:false,categories:[["技术"],["SEO教程"]],categoryMap:{"技术":"tech"},tags:["Hexo"],hexoVersion:"8.1.0",abbrlinkInstalled:true,abbrlinkConfig:{},branch:"main",remote:"",upstream:"",ahead:0,behind:0,dirty:false,staged:[],gitIdentity:"Test User <test@example.com>",hookPresent:false,items:[] };
}
