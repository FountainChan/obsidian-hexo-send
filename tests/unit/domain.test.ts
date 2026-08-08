import { describe, expect, it } from "vitest";
import { PublishStateMachine } from "../../src/domain/publish-state-machine";
import { assertSafeRelativePath, sanitizeFilename, targetForCategory } from "../../src/domain/target-path";

describe("domain rules", () => {
  it("enforces state transitions", () => { const machine = new PublishStateMachine(); machine.transition("enriching"); machine.transition("awaiting_review"); expect(() => machine.transition("committed")).toThrow(/不能从/); });
  it("routes SEO and cleans Windows filenames", () => {
    expect(targetForCategory("source/_posts","source/_posts/seo",["SEO教程","入门教程"],"A:B?C")).toBe("source/_posts/seo/A_B_C.md");
    expect(sanitizeFilename("CON")).toBe("_CON.md");
  });
  it("rejects traversal and absolute paths", () => { expect(() => assertSafeRelativePath("../secret.md")).toThrow(); expect(() => assertSafeRelativePath("C:/secret.md")).toThrow(); });
});
