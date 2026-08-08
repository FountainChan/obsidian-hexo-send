import { createHash } from "node:crypto";
import { metadataFromFrontmatter, splitFrontmatter } from "../../domain/frontmatter";
import type { ImageReference, SourceArticle, UnsupportedSyntax } from "../../domain/publish-types";

export function parseSource(sourcePath: string, content: string): SourceArticle {
  const { frontmatter, body } = splitFrontmatter(content);
  const fallbackTitle = sourcePath.split(/[\\/]/).pop()?.replace(/\.md$/i, "") || "未命名文章";
  const metadata=metadataFromFrontmatter(frontmatter, fallbackTitle);
  const images=findImages(body);
  fillMissingImageAlts(body,images,metadata.title);
  return {
    sourcePath,
    body,
    sourceFrontmatter: frontmatter,
    metadata,
    images,
    unsupported: findUnsupported(body),
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}

function fillMissingImageAlts(body:string,images:ImageReference[],title:string):void{
  const lines=body.split(/\r?\n/);
  images.forEach((image,index)=>{
    if(image.alt.trim())return;
    let heading="";
    for(let lineIndex=Math.max(0,image.line-2);lineIndex>=0;lineIndex--){const match=lines[lineIndex]?.match(/^#{1,6}\s+(.+?)\s*#*$/);if(match?.[1]){heading=match[1].replace(/[*_`[\]]/g,"").trim();break;}}
    image.alt=heading?`${heading}示意图`:`${title}配图 ${index+1}`;
  });
}

export function findImages(body: string): ImageReference[] {
  const results: ImageReference[] = [];
  const lines = body.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
      const target = match[2] ?? "";
      results.push({ raw: match[0], alt: match[1] ?? "", target, line: index + 1, kind: "markdown", remote: /^https?:\/\//i.test(target) });
    }
    for (const match of line.matchAll(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)) {
      const target = match[1] ?? "";
      const candidateAlt=match[2]?.trim() ?? ""; const alt=/^\d+(?:x\d+)?$/.test(candidateAlt)?"":candidateAlt;
      results.push({ raw: match[0], alt, target, line: index + 1, kind: "wiki", remote: false });
    }
  });
  return results;
}

export function findUnsupported(body: string): UnsupportedSyntax[] {
  const results: UnsupportedSyntax[] = [];
  body.split(/\r?\n/).forEach((line, index) => {
    const add = (type: UnsupportedSyntax["type"], raw: string) => results.push({ type, line: index + 1, raw });
    if (/```dataview(?:js)?/i.test(line)) add("dataview", line.trim());
    if (/!\[\[[^\]]+\.md(?:\||\]\])/i.test(line)) add("note-embed", line.trim());
    if (/!\[\[[^\]]+\.excalidraw(?:\||\]\])/i.test(line)) add("excalidraw", line.trim());
    if (/!\[\[[^\]]+\.canvas(?:\||\]\])/i.test(line)) add("canvas", line.trim());
    if (/(?<!!)\[\[[^\]]+\]\]/.test(line)) add("wikilink", line.trim());
  });
  return results;
}
