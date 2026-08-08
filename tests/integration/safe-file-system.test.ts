import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SafeFileSystem } from "../../src/infrastructure/files/safe-file-system";

describe("SafeFileSystem", () => {
  const roots: string[] = [];
  afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

  it("rejects a directory link that leaves the repository", async () => {
    const repository = await temporary("hexo-send-safe-repo-");
    const outside = await temporary("hexo-send-safe-outside-");
    await fs.symlink(outside, path.join(repository, "source"), process.platform === "win32" ? "junction" : "dir");
    await expect(new SafeFileSystem(repository).write("source/escaped.md", "blocked")).rejects.toMatchObject({ code: "PATH_OUTSIDE_REPOSITORY" });
    await expect(fs.access(path.join(outside, "escaped.md"))).rejects.toThrow();
  });

  it("rejects an existing file symlink as the final target", async () => {
    const repository = await temporary("hexo-send-safe-repo-");
    const outside = await temporary("hexo-send-safe-outside-");
    await fs.mkdir(path.join(repository, "source"));
    const outsideFile = path.join(outside, "outside.md");
    await fs.writeFile(outsideFile, "original");
    try { await fs.symlink(outsideFile, path.join(repository, "source", "post.md"), "file"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") return; throw error; }
    await expect(new SafeFileSystem(repository).write("source/post.md", "blocked")).rejects.toMatchObject({ code: "PATH_OUTSIDE_REPOSITORY" });
    expect(await fs.readFile(outsideFile, "utf8")).toBe("original");
  });

  async function temporary(prefix: string): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix)); roots.push(root); return root;
  }
});
