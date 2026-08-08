import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { HexoSendError } from "../../domain/errors";
import { assertSafeRelativePath } from "../../domain/target-path";
import { SafeFileSystem } from "./safe-file-system";

const BackupPathSchema = z.string().regex(/^backups\/[a-f0-9]{64}\.bin$/);
const JournalRecordSchema = z.object({
  id: z.uuid(),
  repositoryPath: z.string().min(1),
  createdAt: z.iso.datetime(),
  completed: z.boolean(),
  files: z.record(z.string(), z.object({ existed: z.boolean(), backup: BackupPathSchema.optional(), baselineHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(), writtenHash: z.string().regex(/^[a-f0-9]{64}$/).nullable() }).strict()),
}).strict();
type JournalRecord = z.infer<typeof JournalRecordSchema>;

export class TempJobJournal {
  readonly id: string;
  readonly directory: string;
  private record: JournalRecord;
  constructor(private readonly repositoryPath: string, id: string = randomUUID()) {
    this.id = id; this.directory = TempJobJournal.pathFor(id);
    this.record = { id: this.id, repositoryPath, createdAt: new Date().toISOString(), completed: false, files: {} };
  }
  async begin(relativePaths: readonly string[]): Promise<void> {
    const safeFs = new SafeFileSystem(this.repositoryPath);
    await fs.mkdir(path.join(this.directory, "backups"), { recursive: true });
    for (const input of relativePaths) {
      const relativePath = assertSafeRelativePath(input);
      if (this.record.files[relativePath]) continue;
      if (await safeFs.exists(relativePath)) {
        const bytes = await safeFs.readBytes(relativePath); const backup = path.posix.join("backups", `${createHash("sha256").update(relativePath).digest("hex")}.bin`);
        await fs.writeFile(path.join(this.directory, backup), bytes);
        this.record.files[relativePath] = { existed: true, backup, baselineHash: hash(bytes), writtenHash: null };
      } else this.record.files[relativePath] = { existed: false, baselineHash: null, writtenHash: null };
    }
    await this.save();
  }
  async markWritten(relativePath: string): Promise<void> {
    const safe = assertSafeRelativePath(relativePath);
    const entry = this.record.files[safe] ?? { existed: false, baselineHash: null, writtenHash: null };
    const bytes = await new SafeFileSystem(this.repositoryPath).readBytes(safe);
    entry.writtenHash = hash(bytes); this.record.files[safe] = entry; await this.save();
  }
  async restore(): Promise<void> {
    await validateRecord(this.directory, this.record);
    await restoreRecord(this.directory, this.record);
    this.record.completed = true; await this.save();
  }
  async complete(): Promise<void> { this.record.completed = true; await this.save(); }
  private async save(): Promise<void> { await fs.mkdir(this.directory, { recursive: true }); await fs.writeFile(path.join(this.directory, "journal.json"), JSON.stringify(this.record, null, 2), "utf8"); }
  static async findIncomplete(): Promise<string[]> {
    const root = path.join(os.tmpdir(), "obsidian-hexo-send");
    let dirs: string[]; try { dirs = await fs.readdir(root); } catch { return []; }
    const result: string[] = [];
    for (const dir of dirs) { try { const directory = path.join(root, dir); const record = await loadRecord(directory); if (!record.completed) result.push(directory); } catch { /* ignore corrupt journal */ } }
    return result;
  }
  static pathFor(id: string): string { return path.join(os.tmpdir(), "obsidian-hexo-send", id); }
  static async restoreAt(directory: string): Promise<void> {
    const safeDirectory = safeJournalDirectory(directory); const journalPath = path.join(safeDirectory, "journal.json"); const record = await loadRecord(safeDirectory);
    await restoreRecord(safeDirectory, record); record.completed = true; await fs.writeFile(journalPath,JSON.stringify(record,null,2),"utf8");
  }
  static async infoAt(directory: string): Promise<{ repositoryPath: string; paths: string[] }> {
    const record = await loadRecord(directory);
    return { repositoryPath: record.repositoryPath, paths: Object.keys(record.files) };
  }
  static async ignoreAt(directory: string): Promise<void> {
    const safeDirectory = safeJournalDirectory(directory); const journalPath = path.join(safeDirectory, "journal.json"); const record = await loadRecord(safeDirectory);
    record.completed = true; await fs.writeFile(journalPath,JSON.stringify(record,null,2),"utf8");
  }
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function restoreRecord(directory: string, record: JournalRecord): Promise<void> {
  const safeFs = new SafeFileSystem(record.repositoryPath);
  for (const [relativePath, entry] of Object.entries(record.files)) {
    let currentHash: string | null = null; try { currentHash = hash(await safeFs.readBytes(relativePath)); } catch { /* missing */ }
    if (entry.writtenHash && currentHash !== entry.writtenHash) throw new HexoSendError("RECOVERY_CONFLICT", `恢复被拒绝，文件已被外部修改：${relativePath}`);
    if (entry.existed && entry.backup) await safeFs.copy(path.join(directory, entry.backup), relativePath);
    else await safeFs.remove(relativePath);
  }
}

async function loadRecord(directory: string): Promise<JournalRecord> {
  const safeDirectory = safeJournalDirectory(directory);
  const directoryStat = await fs.lstat(safeDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new HexoSendError("RECOVERY_CONFLICT", "恢复目录类型无效");
  const record = JournalRecordSchema.parse(JSON.parse(await fs.readFile(path.join(safeDirectory, "journal.json"), "utf8")));
  await validateRecord(safeDirectory, record);
  return record;
}

async function validateRecord(directory: string, record: JournalRecord): Promise<void> {
  const safeDirectory = safeJournalDirectory(directory);
  if (record.id !== path.basename(safeDirectory) || !path.isAbsolute(record.repositoryPath)) throw new HexoSendError("RECOVERY_CONFLICT", "恢复记录身份无效");
  for (const [relativePath, entry] of Object.entries(record.files)) {
    if (assertSafeRelativePath(relativePath) !== relativePath) throw new HexoSendError("RECOVERY_CONFLICT", `恢复路径未规范化：${relativePath}`);
    if (entry.existed !== Boolean(entry.backup)) throw new HexoSendError("RECOVERY_CONFLICT", `恢复记录缺少匹配的备份：${relativePath}`);
    if (!entry.backup) continue;
    BackupPathSchema.parse(entry.backup);
    const backup = path.resolve(safeDirectory, ...entry.backup.split("/"));
    const relative = path.relative(safeDirectory, backup);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new HexoSendError("RECOVERY_CONFLICT", "备份路径超出恢复目录");
    const stat = await fs.lstat(backup);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new HexoSendError("RECOVERY_CONFLICT", "备份文件类型无效");
  }
}

function safeJournalDirectory(directory: string): string {
  const root = path.resolve(os.tmpdir(), "obsidian-hexo-send");
  const candidate = path.resolve(directory);
  const relative = path.relative(root, candidate);
  if (!/^[a-f0-9-]{36}$/i.test(relative) || relative.includes(path.sep)) throw new HexoSendError("RECOVERY_CONFLICT", "恢复目录无效");
  return candidate;
}
