import { spawn } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { HexoSendError, redact } from "../../domain/errors";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../ports/process-runner";

const MAX_CAPTURE = 1_000_000;

export class NodeProcessRunner implements ProcessRunner {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.signal?.aborted) throw new HexoSendError("CANCELLED", "操作已取消");
    const executable = await resolveExecutable(request.executable);
    const taskkillExecutable = process.platform === "win32" ? await resolveExecutable("taskkill.exe") : "";
    const started = Date.now();
    return await new Promise<ProcessResult>((resolve, reject) => {
      const child = spawn(executable, [...request.args], {
        cwd: request.cwd,
        shell: false,
        windowsHide: true,
        env: { ...process.env, ...request.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const append = (current: string, data: Buffer) => (current + data.toString("utf8")).slice(-MAX_CAPTURE);
      child.stdout.on("data", (data: Buffer) => { stdout = append(stdout, data); });
      child.stderr.on("data", (data: Buffer) => { stderr = append(stderr, data); });

      const finishError = (error: HexoSendError) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const terminate = () => {
        if (child.pid && process.platform === "win32") {
          const killer = spawn(taskkillExecutable, ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          killer.unref();
        } else child.kill("SIGTERM");
      };
      const onAbort = () => { terminate(); finishError(new HexoSendError("CANCELLED", "操作已取消")); };
      request.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = request.timeoutMs ? window.setTimeout(() => {
        terminate();
        finishError(new HexoSendError("PROCESS_TIMEOUT", `${request.executable} 执行超时`, { timeoutMs: request.timeoutMs }));
      }, request.timeoutMs) : undefined;
      const cleanup = () => {
        if (timer) window.clearTimeout(timer);
        request.signal?.removeEventListener("abort", onAbort);
      };
      child.once("error", (cause) => finishError(new HexoSendError("PROCESS_FAILED", `无法启动 ${request.executable}`, {}, { cause })));
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        const secrets = request.secrets ?? [];
        const result: ProcessResult = {
          executable,
          args: request.args.map((arg) => redact(arg, secrets)),
          cwd: request.cwd,
          exitCode: code ?? -1,
          stdout: redact(stdout, secrets),
          stderr: redact(stderr, secrets),
          durationMs: Date.now() - started,
        };
        if (result.exitCode !== 0) {
          reject(new HexoSendError("PROCESS_FAILED", `${request.executable} 执行失败（${result.exitCode}）`, { result }));
        } else resolve(result);
      });
    });
  }
}

async function resolveExecutable(value:string):Promise<string>{
  if(!value.trim())throw new HexoSendError("PROCESS_FAILED","可执行文件不能为空");
  const candidates:string[]=[];
  if(path.isAbsolute(value))candidates.push(value);
  else {
    if(value.includes("/")||value.includes("\\"))throw new HexoSendError("PROCESS_FAILED",`可执行文件必须是绝对路径或系统 PATH 中的名称：${value}`);
    const extensions=process.platform==="win32"?(path.extname(value)?[""]:(process.env.PATHEXT??".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)):[""];
    for(const directory of (process.env.PATH??"").split(path.delimiter).map((item)=>item.trim().replace(/^"|"$/g,"")).filter((item)=>path.isAbsolute(item)))for(const extension of extensions)candidates.push(path.join(directory,`${value}${extension}`));
  }
  for(const candidate of candidates){
    try { const real=await fs.realpath(candidate);const stat=await fs.stat(real);if(!stat.isFile())continue;if(process.platform!=="win32")await fs.access(real,constants.X_OK);return real; } catch { /* Continue through PATH candidates. */ }
  }
  throw new HexoSendError("PROCESS_FAILED",`找不到可执行文件：${value}`);
}
