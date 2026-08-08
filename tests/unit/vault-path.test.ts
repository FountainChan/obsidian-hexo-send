import { describe,expect,it } from "vitest";
import { resolveVaultAssetPath } from "../../src/infrastructure/markdown/vault-path";

describe("resolveVaultAssetPath",()=>{
  const source="raw/articles/gefei-seo/01.进阶教程/article.md";
  it("resolves deeply relative Markdown image paths from the source note directory",()=>{
    expect(resolveVaultAssetPath(source,"../../../../assets/images/d2de4f650d386c14.jpg")).toBe("assets/images/d2de4f650d386c14.jpg");
  });
  it("supports root-relative, encoded and Windows-style targets",()=>{
    expect(resolveVaultAssetPath(source,"/assets/images/a%20b.png")).toBe("assets/images/a b.png");
    expect(resolveVaultAssetPath(source,"..\\image.jpg")).toBe("raw/articles/gefei-seo/image.jpg");
  });
  it("rejects paths that escape the Vault",()=>{
    expect(resolveVaultAssetPath("note.md","../../outside.jpg")).toBeNull();
  });
});
