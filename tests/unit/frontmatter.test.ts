import { describe, expect, it } from "vitest";
import { metadataFromFrontmatter, serializeArticle, splitFrontmatter, validateMetadata } from "../../src/domain/frontmatter";

describe("frontmatter", () => {
  it("splits source frontmatter without losing body", () => {
    const result = splitFrontmatter("---\ntitle: 测试\ntags: [Hexo, Git, Obsidian]\n---\n\n正文\n");
    expect(result.frontmatter.title).toBe("测试"); expect(result.body).toBe("正文\n");
  });
  it("serializes fields in the required order and keeps tags under tags", () => {
    const metadata = metadataFromFrontmatter({ title: "文章", date: "2026-08-08 12:00:00", categories: "技术", tags: ["Hexo","Git","Obsidian"], keywords: ["Hexo"], description: "这是一段用于验证输出顺序的文章描述。".repeat(5) }, "fallback");
    const output = serializeArticle(metadata, "正文");
    const keys = ["title:","date:","comments:","categories:","tags:","keywords:","abbrlink:","top_img:","cover:","description:"];
    expect(keys.map((key) => output.indexOf(key))).toEqual([...keys.map((key) => output.indexOf(key))].sort((a,b)=>a-b));
    expect(output).not.toMatch(/cover:[^\n]*\n\s+-/); expect(splitFrontmatter(output).body).toBe("正文\n");
  });
  it("requires category, tags, keywords and description", () => {
    const metadata = metadataFromFrontmatter({ title: "文章" }, "fallback");
    expect(validateMetadata(metadata)).toEqual(expect.arrayContaining(["必须确认分类","标签数量必须为 3–5 个","keywords 不能为空","description 不能为空"]));
  });
});
