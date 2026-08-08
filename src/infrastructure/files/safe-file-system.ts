import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
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
    try {
      const targetStat = await fs.lstat(candidate);
      if (targetStat.isSymbolicLink()) throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", `目标路径是符号链接：${relativePath}`);
      const targetReal = await fs.realpath(candidate);
      const targetRelative = path.relative(repositoryReal, targetReal);
      if (targetRelative.startsWith("..") || path.isAbsolute(targetRelative)) throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", `目标路径指向仓库外：${relativePath}`);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    return candidate;
  }
  async read(relativePath: string): Promise<string> { return await fs.readFile(await this.absolute(relativePath), "utf8"); }
  async readBytes(relativePath: string): Promise<Uint8Array> { return await fs.readFile(await this.absolute(relativePath)); }
  async exists(relativePath: string): Promise<boolean> { return await fs.access(await this.absolute(relativePath)).then(() => true).catch(() => false); }
  async write(relativePath: string, content: string | Uint8Array): Promise<void> {
    const target = await this.absolute(relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.hexo-send-${randomUUID()}.tmp`);
    try {
      const handle = await fs.open(temporary, "wx");
      try { await handle.writeFile(content); } finally { await handle.close(); }
      await this.assertTemporaryParent(temporary);
      await this.absolute(relativePath);
      await fs.rename(temporary, target);
    } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  }
  async copy(sourceAbsolutePath: string, targetRelativePath: string): Promise<void> {
    const target = await this.absolute(targetRelativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.hexo-send-${randomUUID()}.tmp`);
    try {
      await fs.copyFile(sourceAbsolutePath, temporary, constants.COPYFILE_EXCL);
      const temporaryStat = await fs.lstat(temporary);
      if (!temporaryStat.isFile() || temporaryStat.isSymbolicLink()) throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", "临时文件类型无效");
      await this.assertTemporaryParent(temporary);
      await this.absolute(targetRelativePath);
      await fs.rename(temporary, target);
    } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  }
  async remove(relativePath: string): Promise<void> { await fs.rm(await this.absolute(relativePath), { force: true }); }
  async hash(relativePath: string): Promise<string | null> {
    try { return createHash("sha256").update(await fs.readFile(await this.absolute(relativePath))).digest("hex"); } catch { return null; }
  }
  private async assertTemporaryParent(temporary: string): Promise<void> {
    const repositoryReal = await fs.realpath(this.repositoryPath);
    const parentReal = await fs.realpath(path.dirname(temporary));
    const relative = path.relative(repositoryReal, parentReal);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", "临时文件目录已离开仓库");
  }
}

async function nearestExisting(start: string): Promise<string> {
  let cursor = start;
  while (true) {
    try { await fs.access(cursor); return cursor; } catch { const parent = path.dirname(cursor); if (parent === cursor) throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", `找不到安全父目录：${start}`); cursor = parent; }
  }
}
