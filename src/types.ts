export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  DEEP_RESEARCH_WORKFLOW: Workflow;
  ARTICLE_GEN_WORKFLOW: Workflow;
  PUBLISH_WORKFLOW: Workflow;
  GEMINI_API_KEY: string;
  GEMINI_AGENT: string;
  RATE_LIMIT_SECONDS: string;
  VERTEX_PROJECT: string;
  VERTEX_LOCATION: string;
}

export type TargetSite = "altimitech.com" | "altimi-dev.com";

export type StreamStatus = "pending" | "submitted" | "completed" | "failed";
export type StageStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Article {
  id: number;
  slug: string;
  title: string;
  target_site: TargetSite;
  primary_keyword: string | null;
  sequence_position: number | null;
  stream_1_status: StreamStatus;
  stream_1_interaction_id: string | null;
  stream_2_status: StreamStatus;
  stream_2_interaction_id: string | null;
  stream_3_status: StreamStatus;
  stream_3_interaction_id: string | null;
  research_status: StageStatus;
  synthesis_status: StageStatus;
  article_status: StageStatus;
  images_status: StageStatus;
  assembly_status: StageStatus;
  publish_status: StageStatus;
  github_issue: string | null;
}

export interface ResearchStream {
  streamNumber: 1 | 2 | 3;
  title: string;
  questions: string[];
}

export interface ArticleConfig {
  slug: string;
  title: string;
  target_site: TargetSite;
  primary_keyword: string;
  sequence_position: number;
  github_issue: string;
  streams: ResearchStream[];
}

/** R2 key helpers */
export function r2Key(slug: string, ...parts: string[]): string {
  return `articles/${slug}/${parts.join("/")}`;
}
