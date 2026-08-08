import { describe, expect, it } from "vitest";
import { findImages, parseSource } from "../../src/infrastructure/markdown/source-parser";

describe("source parser", () => {
  it("finds markdown/wiki images and unsupported syntax with line numbers", () => {
    const source = parseSource("Notes/demo.md", "![图示](https://example.com/a.png)\n![[local.jpg|本地图]]\n[[普通链接]]\n```dataview\nTABLE\n```");
    expect(source.images).toMatchObject([{ alt:"图示", line:1, remote:true },{ alt:"本地图", line:2, remote:false }]);
    expect(source.unsupported).toEqual(expect.arrayContaining([expect.objectContaining({ type:"wikilink", line:3 }),expect.objectContaining({ type:"dataview", line:4 })]));
    expect(source.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not mistake an Obsidian image width for alt text",()=>{ expect(findImages("![[image.png|300]]")[0]?.alt).toBe(""); });
  it("suggests editable alt text from the nearest heading",()=>{expect(parseSource("a.md","## 流量分析\n\n![](image.png)").images[0]?.alt).toBe("流量分析示意图");});
});
