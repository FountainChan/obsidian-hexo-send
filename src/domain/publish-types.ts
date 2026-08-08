export type JobState =
  | "scanning"
  | "enriching"
  | "awaiting_review"
  | "generating"
  | "validating"
  | "committing"
  | "committed"
  | "pushing"
  | "pushed"
  | "cancelled"
  | "validation_failed"
  | "commit_failed"
  | "push_failed";

export type DiagnosticLevel = "info" | "warning" | "failure";
export interface DiagnosticEvent {
  at: string;
  level: DiagnosticLevel;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SourceSelection {
  vaultPath: string;
  kind: "file" | "folder";
}

export interface ImageReference {
  raw: string;
  target: string;
  alt: string;
  line: number;
  kind: "markdown" | "wiki";
  remote: boolean;
}

export interface UnsupportedSyntax {
  type: "wikilink" | "note-embed" | "dataview" | "excalidraw" | "canvas";
  line: number;
  raw: string;
}

export interface ArticleMetadata {
  title: string;
  date: string;
  comments: boolean;
  categories: string[][];
  tags: string[];
  keywords: string[];
  abbrlink: string;
  topImg: string | false;
  cover: string | false;
  description: string;
  confidence?: "high" | "low";
  descriptionExceptionConfirmed?: boolean;
}

export interface SourceArticle {
  sourcePath: string;
  body: string;
  sourceFrontmatter: Record<string, unknown>;
  metadata: ArticleMetadata;
  images: ImageReference[];
  unsupported: UnsupportedSyntax[];
  contentHash: string;
}

export type ConflictAction = "create" | "update" | "save-as-new" | "skip";
export interface ReviewedArticle extends SourceArticle {
  action: ConflictAction;
  targetRelativePath: string;
  selected: boolean;
  warnings: string[];
  allowRemoteImageFallback?: boolean;
}

export interface PublishPlan {
  id: string;
  repositoryPath: string;
  createdAt: string;
  articles: readonly ReviewedArticle[];
  allowedPaths: readonly string[];
  commitMessage: string;
  baselineHead: string;
}

export interface ArticleResult {
  sourcePath: string;
  targetRelativePath: string;
  action: ConflictAction;
  abbrlink?: string;
  imageDirectory?: string;
  imageCount: number;
  expectedUrl?: string;
  warnings: string[];
  error?: string;
}

export interface PublishResult {
  jobId: string;
  state: JobState;
  commitHash?: string;
  branch?: string;
  remote?: string;
  articles: ArticleResult[];
  diagnostics: DiagnosticEvent[];
}

export interface DetectionItem {
  key: string;
  label: string;
  status: "pass" | "warning" | "failure";
  value: string;
  advice?: string;
  blocking: boolean;
}

export interface HexoEnvironment {
  repositoryPath: string;
  siteTitle: string;
  author: string;
  url: string;
  language: string;
  timezone: string;
  sourceDir: string;
  postsDir: string;
  seoPostsDir: string;
  imagesDir: string;
  permalink: string;
  postAssetFolder: boolean;
  categories: string[][];
  categoryMap: Record<string, string>;
  tags: string[];
  hexoVersion: string;
  abbrlinkInstalled: boolean;
  abbrlinkConfig: Record<string, unknown>;
  branch: string;
  remote: string;
  upstream: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  staged: string[];
  gitIdentity: string;
  hookPresent: boolean;
  items: DetectionItem[];
}
