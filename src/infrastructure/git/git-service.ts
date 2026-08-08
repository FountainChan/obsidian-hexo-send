import { promises as fs } from "node:fs";
import path from "node:path";
import { HexoSendError } from "../../domain/errors";
import type { ProcessRunner } from "../../ports/process-runner";

export interface GitSnapshot {
  head: string;
  branch: string;
  remote: string;
  upstream: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  staged: string[];
  identity: string;
  operation: string;
}

export class GitService {
  constructor(private readonly runner: ProcessRunner, private readonly executable = "git") {}
  private async git(repositoryPath: string, args: readonly string[], signal?: AbortSignal) {
    return await this.runner.run({ executable: this.executable, args: ["-C", repositoryPath, ...args], cwd: repositoryPath, timeoutMs: 60_000, signal });
  }
  async inspect(repositoryPath: string): Promise<GitSnapshot> {
    await this.git(repositoryPath, ["rev-parse", "--is-inside-work-tree"]);
    const [head, branch, status, staged, name, email, gitDir] = await Promise.all([
      this.git(repositoryPath, ["rev-parse", "HEAD"]),
      this.git(repositoryPath, ["branch", "--show-current"]),
      this.git(repositoryPath, ["status", "--porcelain=v1", "-z"]),
      this.git(repositoryPath, ["diff", "--cached", "--name-only", "-z"]),
      this.git(repositoryPath, ["config", "user.name"]).catch(() => ({ stdout: "" })),
      this.git(repositoryPath, ["config", "user.email"]).catch(() => ({ stdout: "" })),
      this.git(repositoryPath, ["rev-parse", "--git-dir"]),
    ]);
    const upstreamResult = await this.git(repositoryPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).catch(() => ({ stdout: "" }));
    const upstream = upstreamResult.stdout.trim();
    let ahead = 0, behind = 0;
    if (upstream) {
      const count = await this.git(repositoryPath, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`]);
      [ahead, behind] = count.stdout.trim().split(/\s+/).map(Number) as [number, number];
    }
    const remote = upstream.includes("/") ? upstream.slice(0, upstream.indexOf("/")) : "";
    const resolvedGitDir = path.resolve(repositoryPath, gitDir.stdout.trim());
    return {
      head: head.stdout.trim(), branch: branch.stdout.trim(), remote, upstream, ahead, behind,
      dirty: Boolean(status.stdout), staged: staged.stdout.split("\0").filter(Boolean),
      identity: [name.stdout.trim(), email.stdout.trim()].filter(Boolean).join(" <") + (email.stdout.trim() ? ">" : ""),
      operation: await detectOperation(resolvedGitDir),
    };
  }
  async assertSafeForWrite(repositoryPath: string): Promise<GitSnapshot> {
    const snapshot = await this.inspect(repositoryPath);
    if (snapshot.staged.length) throw new HexoSendError("GIT_UNSAFE", "仓库已有 staged changes，请先处理后再预发布", { staged: snapshot.staged });
    if (snapshot.operation) throw new HexoSendError("GIT_UNSAFE", `Git 正处于 ${snapshot.operation} 状态`);
    if (!snapshot.branch) throw new HexoSendError("GIT_UNSAFE", "当前为 detached HEAD");
    if (!snapshot.identity.includes("<")) throw new HexoSendError("GIT_UNSAFE", "Git user.name 或 user.email 未配置");
    return snapshot;
  }
  async changedPaths(repositoryPath: string): Promise<string[]> {
    const result = await this.git(repositoryPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    return parsePorcelainPaths(result.stdout);
  }
  async stageExact(repositoryPath: string, paths: readonly string[], signal?: AbortSignal): Promise<void> {
    if (!paths.length) throw new HexoSendError("GIT_UNSAFE", "没有可暂存路径");
    await this.git(repositoryPath, ["add", "--", ...paths], signal);
  }
  async verifyIndex(repositoryPath: string, allowedPaths: readonly string[]): Promise<void> {
    const result = await this.git(repositoryPath, ["diff", "--cached", "--name-only", "-z"]);
    assertEqualPathSet(result.stdout.split("\0").filter(Boolean), allowedPaths, "Git index 包含计划外路径");
  }
  async unstageExact(repositoryPath: string, allowedPaths: readonly string[]): Promise<void> {
    const result = await this.git(repositoryPath,["diff","--cached","--name-only","-z"]); const staged = result.stdout.split("\0").filter(Boolean);
    const allowed = new Set(allowedPaths);
    const unexpected = staged.filter((item)=>!allowed.has(item));
    if (unexpected.length) throw new HexoSendError("RECOVERY_CONFLICT","暂存区出现任务外文件，拒绝自动恢复",{unexpected});
    if (staged.length) await this.git(repositoryPath,["restore","--staged","--",...staged]);
  }
  async commit(repositoryPath: string, message: string): Promise<string> {
    await this.git(repositoryPath, ["commit", "-m", message]);
    return (await this.git(repositoryPath, ["rev-parse", "HEAD"])).stdout.trim();
  }
  async verifyCommit(repositoryPath: string, hash: string, allowedPaths: readonly string[]): Promise<void> {
    const result = await this.git(repositoryPath, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", hash]);
    assertEqualPathSet(result.stdout.split("\0").filter(Boolean), allowedPaths, "commit 包含计划外路径");
  }
  async pushConfirmed(repositoryPath: string, expectedHash: string, remote: string, branch: string): Promise<void> {
    const current = await this.inspect(repositoryPath);
    if (current.head !== expectedHash || current.branch !== branch) {
      throw new HexoSendError("PUSH_CONTEXT_CHANGED", "HEAD、分支或 remote 已变化，请重新确认", { expectedHash, current });
    }
    await this.git(repositoryPath, ["remote", "get-url", remote]).catch((cause) => { throw new HexoSendError("PUSH_CONTEXT_CHANGED", `remote 不存在：${remote}`, {}, { cause }); });
    await this.git(repositoryPath, ["push", remote, `HEAD:${branch}`]);
  }
}

async function detectOperation(gitDir: string): Promise<string> {
  const markers: Array<[string,string]> = [["index.lock","index lock"],["MERGE_HEAD","merge"],["CHERRY_PICK_HEAD","cherry-pick"],["REVERT_HEAD","revert"],["rebase-merge","rebase"],["rebase-apply","rebase"],["BISECT_LOG","bisect"]];
  for (const [marker, name] of markers) { try { await fs.access(path.join(gitDir, marker)); return name; } catch { /* continue */ } }
  return "";
}
function parsePorcelainPaths(output: string): string[] {
  const records = output.split("\0").filter(Boolean); const paths: string[] = [];
  for (let index=0; index<records.length; index++) {
    const record = records[index] ?? ""; const status = record.slice(0,2); const first = record.slice(3);
    if (first) paths.push(first);
    if ((status.includes("R") || status.includes("C")) && records[index+1]) paths.push(records[++index] as string);
  }
  return [...new Set(paths.map((item) => item.replaceAll("\\", "/")))];
}
function assertEqualPathSet(actual: readonly string[], expected: readonly string[], message: string): void {
  const a = [...new Set(actual)].sort(); const e = [...new Set(expected)].sort();
  if (a.length !== e.length || a.some((value,index) => value !== e[index])) throw new HexoSendError("GIT_UNSAFE", message, { actual: a, expected: e });
}
