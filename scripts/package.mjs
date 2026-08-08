import { promises as fs } from "node:fs";
import path from "node:path";

const target = path.resolve("dist","hexo-send");
await fs.rm(target,{recursive:true,force:true});
await fs.mkdir(target,{recursive:true});
for (const file of ["main.js","manifest.json","styles.css"]) await fs.copyFile(path.resolve(file),path.join(target,file));
const files = await fs.readdir(target);
if (files.sort().join(",") !== "main.js,manifest.json,styles.css") throw new Error(`Unexpected package files: ${files.join(", ")}`);
