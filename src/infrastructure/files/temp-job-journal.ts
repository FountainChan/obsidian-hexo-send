import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HexoSendError } from "../../domain/errors";

interface JournalRecord {
  id: string;
  repositoryPath: string;
  createdAt: string;
  completed: boolean;
  files: Record<string, { existed: boolean; backup?: string; baselineHash: string | null; writtenHash: string | null }>;
}

export class TempJobJournal {
  readonly id: string;
  readonly directory: string;
  private record: JournalRecord;
  constructor(private readonly repositoryPath: string, id: string = randomUUID()) {
    this.id = id; this.directory = TempJobJournal.pathFor(id);
    this.record = { id: this.id, repositoryPath, createdAt: new Date().toISOString(), completed: false, files: {} };
  }
  async begin(relativePaths: readonly string[]): Promise<void> {
    await fs.mkdir(path.join(this.directory, "backups"), { recursive: true });
    for (const relativePath of relativePaths) {
      if (this.record.files[relativePath]) continue;
      const absolute = path.join(this.repositoryPath, ...relativePath.split("/"));
      try {
        const bytes = await fs.readFile(absolute); const backup = path.join("backups", `${createHash("sha256").update(relativePath).digest("hex")}.bin`);
        await fs.writeFile(path.join(this.directory, backup), bytes);
        this.record.files[relativePath] = { existed: true, backup, baselineHash: hash(bytes), writtenHash: null };
      } catch { this.record.files[relativePath] = { existed: false, baselineHash: null, writtenHash: null }; }
    }
    await this.save();
  }
  async markWritten(relativePath: string): Promise<void> {
    const entry = this.record.files[relativePath] ?? { existed: false, baselineHash: null, writtenHash: null };
    const bytes = await fs.readFile(path.join(this.repositoryPath, ...relativePath.split("/")));
    entry.writtenHash = hash(bytes); this.record.files[relativePath] = entry; await this.save();
  }
  async restore(): Promise<void> {
    await restoreRecord(this.directory, this.record);
    this.record.completed = true; await this.save();
  }
  async complete(): Promise<void> { this.record.completed = true; await this.save(); }
  private async save(): Promise<void> { await fs.writeFile(path.join(this.directory, "journal.json"), JSON.stringify(this.record, null, 2), "utf8"); }
  static async findIncomplete(): Promise<string[]> {
    const root = path.join(os.tmpdir(), "obsidian-hexo-send");
    let dirs: string[]; try { dirs = await fs.readdir(root); } catch { return []; }
    const result: string[] = [];
    for (const dir of dirs) { try { const record = JSON.parse(await fs.readFile(path.join(root, dir, "journal.json"), "utf8")) as JournalRecord; if (!record.completed) result.push(path.join(root, dir)); } catch { /* ignore corrupt journal */ } }
    return result;
  }
  static pathFor(id: string): string { return path.join(os.tmpdir(), "obsidian-hexo-send", id); }
  static async restoreAt(directory: string): Promise<void> {
    const journalPath = path.join(directory, "journal.json"); const record = JSON.parse(await fs.readFile(journalPath,"utf8")) as JournalRecord;
    await restoreRecord(directory, record); record.completed = true; await fs.writeFile(journalPath,JSON.stringify(record,null,2),"utf8");
  }
  static async infoAt(directory: string): Promise<{ repositoryPath: string; paths: string[] }> {
    const record = JSON.parse(await fs.readFile(path.join(directory,"journal.json"),"utf8")) as JournalRecord;
    return { repositoryPath: record.repositoryPath, paths: Object.keys(record.files) };
  }
  static async ignoreAt(directory: string): Promise<void> {
    const journalPath = path.join(directory, "journal.json"); const record = JSON.parse(await fs.readFile(journalPath,"utf8")) as JournalRecord;
    record.completed = true; await fs.writeFile(journalPath,JSON.stringify(record,null,2),"utf8");
  }
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function restoreRecord(directory: string, record: JournalRecord): Promise<void> {
  for (const [relativePath, entry] of Object.entries(record.files)) {
    const absolute = path.join(record.repositoryPath, ...relativePath.split("/"));
    let currentHash: string | null = null; try { currentHash = hash(await fs.readFile(absolute)); } catch { /* missing */ }
    if (entry.writtenHash && currentHash !== entry.writtenHash) throw new HexoSendError("RECOVERY_CONFLICT", `恢复被拒绝，文件已被外部修改：${relativePath}`);
    if (entry.existed && entry.backup) { await fs.mkdir(path.dirname(absolute), { recursive: true }); await fs.copyFile(path.join(directory, entry.backup), absolute); }
    else await fs.rm(absolute, { force: true });
  }
}
