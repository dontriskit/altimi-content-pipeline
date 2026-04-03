/**
 * Site-specific configurations for article generation.
 * Each target site has a different ICP, product, and messaging voice.
 */

import type { TargetSite } from "../types";

export interface SiteConfig {
  site: TargetSite;
  product: string;
  icp: string;
  voice: string;
  cta: string;
  brandContext: string;
}

export const SITE_CONFIGS: Record<TargetSite, SiteConfig> = {
  "altimitech.com": {
    site: "altimitech.com",
    product: "Rapid Tech DD — independent technology due diligence for PE, VC, and growth investors",
    icp: `Private equity partners, VPs on deal teams, operating partners, and venture capital investors.
These are financial professionals making investment decisions on software companies.
They need to understand technology risk in business/financial terms, not engineering jargon.
They are time-pressured (deal timelines), skeptical (seen too many pitch decks), and data-driven (want numbers, not opinions).
They read McKinsey, Bain, and deal-focused publications — not Hacker News.`,
    voice: `Authoritative but accessible. Write for a smart generalist who understands business but not code.
Translate technical concepts into financial impact (cost, risk, velocity, talent, exit multiples).
Use data and named sources — never make unsourced claims.
Tone: confident, direct, slightly contrarian. Like a senior advisor, not a salesperson.
Never use engineering jargon without explaining the business implication.
Avoid: "cutting-edge", "revolutionary", "game-changing". Prefer: "measurable", "evidence-based", "risk-adjusted".`,
    cta: `Altimi's Rapid Tech DD provides a clear investment recommendation in 2-3 weeks — combining code sampling, AI assessment, and risk scoring. Starting from €8,500.
Book a 20-minute call: https://meetings.hubspot.com/jacek-podoba`,
    brandContext: `Altimi is a technology consultancy with 20+ years experience, 300+ projects, ISO 27001 certified.
Clients include Siemens, SoftBank, Opera, Greenbone, BenQ, Etteplan, BD.
The Rapid Tech DD product delivers a 20-50 page report with RAG scoring, risk matrix, and investment recommendation.
Target: PE/VC investors evaluating software companies for acquisition or investment.`,
  },
  "altimi-dev.com": {
    site: "altimi-dev.com",
    product: "Modernization Discovery Sprint — AI-powered legacy system modernization assessment and execution planning",
    icp: `CTOs, CIOs, Heads of Engineering, Directors of Digital Transformation, VP Engineering.
These are technical leaders at mid-to-large European companies (DACH, Nordics, UK) running legacy systems.
They understand technology deeply but need business justification for modernization investment.
They are frustrated (legacy is blocking them), pragmatic (want phased approaches, not big-bang rewrites), and budget-constrained (need to prove ROI).
They read InfoQ, ThoughtWorks Radar, and engineering leadership blogs.
Industries: Finance/banking, Utilities/IoT, Logistics, SaaS B2B, Industrial software.`,
    voice: `Technical peer, not consultant. Write for someone who has debugged production at 2am.
Use specific technology names, patterns, and tools — this audience knows them.
Be honest about tradeoffs — they've been burned by vendor promises before.
Tone: pragmatic, evidence-based, slightly battle-scarred. Like a senior architect who has done this migration before.
Acknowledge complexity — never oversimplify.
Avoid: "seamless", "effortless", "simple". Prefer: "phased", "risk-managed", "evidence-based", "incremental".`,
    cta: `Altimi's Modernization Discovery Sprint delivers a concrete execution plan in 2-4 weeks — architecture assessment, 90-day roadmap, and business case with CAPEX/OPEX projections. €8,500.
Book a Modernization Assessment: https://meetings.hubspot.com/jacek-podoba`,
    brandContext: `Altimi is a technology modernization partner with 20+ years experience, 300+ projects, ISO 27001 certified.
Proven modernization cases: Cuculus GmbH (IoT, 300% capacity, regulatory deadline met), RB Bank Iceland (banking), JetShop (e-commerce, 3000+ firms), Apport Systems (logistics).
AI-augmented approach: Cursor, Sourcegraph Cody, Semgrep/CodeQL for code understanding; Grit.io for codemods; CodiumAI for testing.
Team: Head of Engineering & AI Delivery Lead (20yr), Solution Architect, Frontend Migration Specialist, Backend/Infra Engineer.
Target: Engineering leaders modernizing legacy systems in regulated European industries.`,
  },
};

/**
 * Build the shared research context that each Deep Research stream receives.
 * This ensures all 3 streams know about the other 2 and stay in their lane.
 */
export function buildResearchContext(
  config: SiteConfig,
  articleTitle: string,
  streams: { streamNumber: number; title: string }[],
  currentStream: number,
): string {
  const streamTable = streams
    .map((s) => {
      const marker = s.streamNumber === currentStream ? "**THIS AGENT**" : "Another team";
      return `| ${s.streamNumber} | ${s.title} | ${marker} |`;
    })
    .join("\n");

  return `You are research stream ${currentStream} of ${streams.length} contributing to a single ~4,000-word article.

## Article
Title: "${articleTitle}"
Target audience: ${config.icp.split("\n")[0]}
Product context: ${config.product}

## Parallel research streams
| Stream | Topic | Owner |
|--------|-------|-------|
${streamTable}

**Stay strictly within your stream.** The other teams handle the other topics.

## Research standards
- All claims must trace to named, dated sources
- Rate each finding: HIGH (rigorous study), MEDIUM (industry survey/credible report), LOW (anecdotal/blog)
- If a commonly cited figure can't be properly sourced, flag it as unverified
- Present conflicting evidence — do not resolve conflicts in favor of any thesis
- Prioritize 2024-2026 sources, but include foundational older sources where relevant
- Search academic databases (IEEE, ACM), analyst firms (Gartner, McKinsey, Forrester), developer surveys (StackOverflow, JetBrains, GitHub), and engineering blogs`;
}
