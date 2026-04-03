/**
 * ArticleGenWorkflow — Placeholder for Stage 2.
 * Will handle: research synthesis → article generation → chart configs → image generation → HTML assembly.
 */

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env } from "../types";

interface ArticleGenParams {
  slug: string;
}

export class ArticleGenWorkflow extends WorkflowEntrypoint<Env, ArticleGenParams> {
  async run(event: WorkflowEvent<ArticleGenParams>, step: WorkflowStep) {
    await step.do("placeholder", async () => {
      return { message: "ArticleGenWorkflow not yet implemented", slug: event.payload.slug };
    });
  }
}
