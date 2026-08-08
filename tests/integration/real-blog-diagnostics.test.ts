import { describe, expect, it } from "vitest";
import { EnvironmentDetector } from "../../src/infrastructure/hexo/environment-detector";
import { NodeProcessRunner } from "../../src/infrastructure/process/node-process-runner";
import { DEFAULT_SETTINGS } from "../../src/settings";

const realBlog = process.env.HEXO_SEND_REAL_BLOG;

describe("real blog read-only diagnostics",()=>{
  (realBlog ? it : it.skip)("reads the configured Hexo repository without writes",async()=>{
    const environment = await new EnvironmentDetector(new NodeProcessRunner()).detect({...DEFAULT_SETTINGS,repositoryPath:realBlog!});
    expect(environment.url).toBe("https://blog.vastnext.com"); expect(environment.postsDir).toBe("source/_posts"); expect(environment.seoPostsDir).toBe("source/_posts/seo");
    expect(environment.abbrlinkInstalled).toBe(true); expect(environment.categories.flat()).toContain("SEO教程"); expect(environment.items.map((item)=>item.key)).toEqual(expect.arrayContaining(["hexo-config","git","node","hexo-cli","pre-commit"]));
  },30_000);
});
