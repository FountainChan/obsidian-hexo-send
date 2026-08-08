import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TempJobJournal } from "../../src/infrastructure/files/temp-job-journal";

describe("TempJobJournal",()=>{
  let repository=""; let directory="";
  afterEach(async()=>{ if(repository) await fs.rm(repository,{recursive:true,force:true}); if(directory) await fs.rm(directory,{recursive:true,force:true}); });
  it("restores updated and newly created files",async()=>{
    repository=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-journal-repo-")); await fs.writeFile(path.join(repository,"old.md"),"old");
    const journal=new TempJobJournal(repository); directory=journal.directory; await journal.begin(["old.md","new.md"]);
    await fs.writeFile(path.join(repository,"old.md"),"changed"); await fs.writeFile(path.join(repository,"new.md"),"new"); await journal.markWritten("old.md"); await journal.markWritten("new.md");
    await TempJobJournal.restoreAt(directory); expect(await fs.readFile(path.join(repository,"old.md"),"utf8")).toBe("old"); await expect(fs.access(path.join(repository,"new.md"))).rejects.toThrow();
  });
  it("refuses to overwrite an external edit",async()=>{
    repository=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-journal-repo-")); await fs.writeFile(path.join(repository,"old.md"),"old");
    const journal=new TempJobJournal(repository); directory=journal.directory; await journal.begin(["old.md"]); await fs.writeFile(path.join(repository,"old.md"),"plugin"); await journal.markWritten("old.md"); await fs.writeFile(path.join(repository,"old.md"),"user edit");
    await expect(TempJobJournal.restoreAt(directory)).rejects.toMatchObject({code:"RECOVERY_CONFLICT"});
  });
});
