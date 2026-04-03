/**
 * PublishWorkflow — Placeholder for Stage 3.
 * Will handle: push assembled article to target Next.js site via Cloudflare API.
 */

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env } from "../types";

interface PublishParams {
  slug: string;
}

export class PublishWorkflow extends WorkflowEntrypoint<Env, PublishParams> {
  async run(event: WorkflowEvent<PublishParams>, step: WorkflowStep) {
    await step.do("placeholder", async () => {
      return { message: "PublishWorkflow not yet implemented", slug: event.payload.slug };
    });
  }
}
