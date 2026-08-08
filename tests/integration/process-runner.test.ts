import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeProcessRunner } from "../../src/infrastructure/process/node-process-runner";

describe("NodeProcessRunner", () => {
  it("passes argv without a shell", async () => {
    const value = "literal;&$()"; const result = await new NodeProcessRunner().run({ executable: process.execPath, args: ["-e","process.stdout.write(process.argv[1])",value], cwd: process.cwd() });
    expect(result.stdout).toBe(value); expect(result.args.at(-1)).toBe(value);
  });
  it("redacts secrets", async () => {
    const result = await new NodeProcessRunner().run({ executable: process.execPath, args: ["-e","process.stdout.write(process.argv[1])","top-secret"], cwd: process.cwd(), secrets:["top-secret"] });
    expect(result.stdout).toBe("[REDACTED]"); expect(result.args).not.toContain("top-secret");
  });
  it("supports timeout", async () => {
    await expect(new NodeProcessRunner().run({ executable: process.execPath, args: ["-e","setTimeout(()=>{},5000)"], cwd: process.cwd(), timeoutMs:50 })).rejects.toMatchObject({ code:"PROCESS_TIMEOUT" });
  });
  it("resolves executable names from PATH without searching the repository cwd",async()=>{
    const cwd=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-executable-"));
    try {
      const decoy=path.join(cwd,process.platform==="win32"?"node.exe":"node");await fs.writeFile(decoy,"not an executable");
      const result=await new NodeProcessRunner().run({executable:"node",args:["-e","process.stdout.write('trusted-path')"],cwd,timeoutMs:5_000});expect(result.stdout).toBe("trusted-path");
    } finally { await fs.rm(cwd,{recursive:true,force:true}); }
  });
});
