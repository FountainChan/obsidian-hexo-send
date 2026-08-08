import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { HexoSendError } from "../../domain/errors";
import { assertSafeRelativePath } from "../../domain/target-path";

export class SafeFileSystem {
  constructor(private readonly repositoryPath: string) {}
  async absolute(relativePath: string): Promise<string> {
    const safe = assertSafeRelativePath(relativePath);
    const repositoryReal = await fs.realpath(this.repositoryPath);
    const candidate = path.resolve(repositoryReal, ...safe.split("/"));
    const relative = path.relative(repositoryReal, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", `路径超出仓库：${relativePath}`);
    const existingAncestor = await nearestExisting(path.dirname(candidate));
    const ancestorReal = await fs.realpath(existingAncestor);
    const ancestorRelative = path.relative(repositoryReal, ancestorReal);
    if (ancestorRelative.startsWith("..") || path.isAbsolute(ancestorRelative)) throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", `路径经过仓库外符号链接：${relativePath}`);
    return candidate;
  }
  async read(relativePath: string): Promise<string> { return await fs.readFile(await this.absolute(relativePath), "utf8"); }
  async exists(relativePath: string): Promise<boolean> { return await fs.access(await this.absolute(relativePath)).then(() => true).catch(() => false); }
  async write(relativePath: string, content: string | Uint8Array): Promise<void> {
    const target = await this.absolute(relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.hexo-send-${process.pid}-${Date.now()}.tmp`;
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, target);
  }
  async copy(sourceAbsolutePath: string, targetRelativePath: string): Promise<void> {
    const target = await this.absolute(targetRelativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(sourceAbsolutePath, target);
  }
  async hash(relativePath: string): Promise<string | null> {
    try { return createHash("sha256").update(await fs.readFile(await this.absolute(relativePath))).digest("hex"); } catch { return null; }
  }
}

async function nearestExisting(start: string): Promise<string> {
  let cursor = start;
  while (true) {
    try { await fs.access(cursor); return cursor; } catch { const parent = path.dirname(cursor); if (parent === cursor) throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", `找不到安全父目录：${start}`); cursor = parent; }
  }
}
