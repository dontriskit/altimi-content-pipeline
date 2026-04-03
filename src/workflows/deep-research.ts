/**
 * DeepResearchWorkflow — Durable workflow: 3 research streams per article.
 *
 * Each stream: submit → poll (up to 45min) → save to R2 → cooldown 65s → next.
 * Steps are cached by the Workflow runtime — restarts skip completed steps.
 */

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { GoogleGenAI } from "@google/genai";
import type { Env } from "../types";
import { r2Key } from "../types";
import { ARTICLES } from "../pipeline/articles";
import { SITE_CONFIGS, buildResearchContext } from "../pipeline/site-configs";

interface DeepResearchParams {
  slug: string;
}

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 2_700_000; // 45 min
const RATE_LIMIT_MS = 65_000;

export class DeepResearchWorkflow extends WorkflowEntrypoint<Env, DeepResearchParams> {
  async run(event: WorkflowEvent<DeepResearchParams>, step: WorkflowStep) {
    const { slug } = event.payload;

    // Step 1: Load config and build prompts
    const config = await step.do("load-config", async () => {
      const article = ARTICLES.find((a) => a.slug === slug);
      if (!article) throw new Error(`Article not found: ${slug}`);

      const siteConfig = SITE_CONFIGS[article.target_site];
      const prompts = article.streams.map((stream) => {
        const context = buildResearchContext(
          siteConfig,
          article.title,
          article.streams,
          stream.streamNumber,
        );
        const questions = stream.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

        return {
          streamNumber: stream.streamNumber,
          title: stream.title,
          prompt: `${context}\n\n## Your Research Assignment: ${stream.title}\n\n### Questions to investigate\n\n${questions}\n\n### Output format\nProvide a structured research report with:\n- Named sources with publication dates for every claim\n- Confidence rating (HIGH/MEDIUM/LOW) for each finding\n- Direct quotes where available\n- Conflicting evidence presented honestly\n- A summary of the strongest and weakest evidence found`,
        };
      });

      return { slug: article.slug, title: article.title, target_site: article.target_site, prompts };
    });

    // Process each stream sequentially
    for (const streamPrompt of config.prompts) {
      const n = streamPrompt.streamNumber;
      const sk = `stream_${n}`;

      // Check if already done
      const exists = await step.do(`check-${sk}`, async () => {
        const obj = await this.env.BUCKET.get(r2Key(slug, "research", `${sk}_report.md`));
        return obj !== null;
      });

      if (exists) continue;

      // Save prompt for audit trail
      await step.do(`save-prompt-${sk}`, async () => {
        await this.env.BUCKET.put(
          r2Key(slug, "research", `${sk}_prompt.md`),
          streamPrompt.prompt,
        );
      });

      // Submit to Deep Research API
      const interactionId = await step.do(`submit-${sk}`, {
        retries: { limit: 3, delay: 45, backoff: "linear" },
      }, async () => {
        const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });
        const interaction = await client.interactions.create({
          input: streamPrompt.prompt,
          agent: this.env.GEMINI_AGENT,
          background: true,
        });

        if (!interaction.id) throw new Error("No interaction ID returned");

        // Update D1
        await this.env.DB.prepare(
          `UPDATE articles SET ${sk}_status = 'submitted', ${sk}_interaction_id = ?, updated_at = datetime('now') WHERE slug = ?`
        ).bind(interaction.id, slug).run();

        return interaction.id;
      });

      // Poll until complete (up to 45 min)
      const report = await step.do(`poll-${sk}`, async () => {
        const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });
        const start = Date.now();

        while (Date.now() - start < POLL_TIMEOUT_MS) {
          const result = await client.interactions.get(interactionId);

          if (result.status === "completed") {
            const outputs = result.outputs || [];
            const lastOutput = outputs.length > 0 ? outputs[outputs.length - 1] : null;
            const text = lastOutput ? (lastOutput as any).text || "" : "";
            return {
              text,
              response: JSON.stringify(result),
            };
          }

          if (result.status === "failed") {
            throw new Error(`Research stream ${n} failed`);
          }

          // Still running — wait
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }

        throw new Error(`Research stream ${n} timed out after 45 minutes`);
      });

      // Save results to R2
      await step.do(`save-${sk}`, async () => {
        await this.env.BUCKET.put(
          r2Key(slug, "research", `${sk}_report.md`),
          report.text,
        );
        await this.env.BUCKET.put(
          r2Key(slug, "research", `${sk}_response.json`),
          report.response,
        );

        await this.env.DB.prepare(
          `UPDATE articles SET ${sk}_status = 'completed', updated_at = datetime('now') WHERE slug = ?`
        ).bind(slug).run();
      });

      // Rate limit cooldown between streams
      if (n < 3) {
        await step.sleep(`cooldown-${sk}`, RATE_LIMIT_MS);
      }
    }

    // Finalize
    await step.do("finalize", async () => {
      await this.env.DB.prepare(
        `UPDATE articles SET research_status = 'completed', updated_at = datetime('now') WHERE slug = ?`
      ).bind(slug).run();

      await this.env.BUCKET.put(
        r2Key(slug, "research", "_complete.json"),
        JSON.stringify({ slug, completed_at: new Date().toISOString(), streams: [1, 2, 3] }),
      );
    });
  }
}
