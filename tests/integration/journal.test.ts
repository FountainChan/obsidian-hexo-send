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
  it("rejects a tampered recovery path",async()=>{
    repository=await fs.mkdtemp(path.join(os.tmpdir(),"hexo-send-journal-repo-"));
    const journal=new TempJobJournal(repository); directory=journal.directory; await journal.begin(["new.md"]);
    const journalPath=path.join(directory,"journal.json"); const record:unknown=JSON.parse(await fs.readFile(journalPath,"utf8"));
    if(!isRecord(record)||!isRecord(record.files))throw new Error("Invalid journal fixture");
    record.files["../outside.md"]=record.files["new.md"]; delete record.files["new.md"];
    await fs.writeFile(journalPath,JSON.stringify(record));
    await expect(TempJobJournal.infoAt(directory)).rejects.toThrow();
  });
});

const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null;
