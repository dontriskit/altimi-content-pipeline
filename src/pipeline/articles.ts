/**
 * Article definitions — the 12 articles to produce.
 * Each article has 3 research streams with open-ended questions.
 */

import type { ArticleConfig } from "../types";

export const ARTICLES: ArticleConfig[] = [
  // ─── PE/DD Track (altimitech.com) ───

  {
    slug: "tech-dd-real-roi",
    title: "Under the Hood: The Real ROI of Technical Due Diligence in Software Deals",
    target_site: "altimitech.com",
    primary_keyword: "technical due diligence ROI",
    sequence_position: 1,
    github_issue: "dontriskit/altimi-pe#20",
    streams: [
      {
        streamNumber: 1,
        title: "What goes wrong without tech DD",
        questions: [
          "Find documented cases (2020-2026) where PE/VC deals resulted in post-close technology surprises. What happened? What was the financial impact?",
          "Search for surveys or reports from PE firms on frequency of post-acquisition technology problems",
          "What do deal professionals say about the gap between seller-reported tech health and independent findings?",
          "Are there any studies quantifying information asymmetry in technology acquisitions?",
        ],
      },
      {
        streamNumber: 2,
        title: "What modern tech DD actually measures and how",
        questions: [
          "How has the scope of technology due diligence evolved in the last 5 years? What do the leading DD firms assess today vs 2020?",
          "What role do automated tools (static analysis, AI-assisted code review, infrastructure scanning) play in current DD practice?",
          "How are findings typically scored and reported? Is there a standard framework?",
          "What is the typical cost, timeline, and team composition for a technology DD engagement?",
        ],
      },
      {
        streamNumber: 3,
        title: "Does DD change deal economics?",
        questions: [
          "Find any evidence (academic, industry, or anecdotal) on how DD findings influence deal pricing, terms, or structure",
          "Do buyers who conduct tech DD achieve better returns? Any data from PE portfolio performance studies?",
          "How do DD findings translate to post-deal planning and value creation?",
          "What is the cost of DD relative to typical deal sizes? How does this compare to the value of issues discovered?",
        ],
      },
    ],
  },

  {
    slug: "ai-readiness-signal-vs-noise",
    title: "AI Readiness in Portfolio Companies: Signal, Noise, and What Actually Matters",
    target_site: "altimitech.com",
    primary_keyword: "AI readiness assessment PE",
    sequence_position: 2,
    github_issue: "dontriskit/altimi-pe#21",
    streams: [
      { streamNumber: 1, title: "The state of enterprise AI adoption in 2025-2026", questions: [
        "What percentage of companies have deployed AI beyond POC/pilot? Find the latest Gartner, McKinsey, Forrester data",
        "What is the failure rate of enterprise AI initiatives? Has this changed year-over-year?",
        "What distinguishes companies that successfully deploy AI from those that don't?",
        "How do AI claims in pitch decks/CIMs compare to what DD actually finds?",
      ]},
      { streamNumber: 2, title: "What makes a platform AI-ready from a technical standpoint", questions: [
        "What architectural prerequisites enable effective AI deployment? (APIs, data pipelines, modern frontend, observability)",
        "Is there correlation between general platform maturity and AI readiness?",
        "What infrastructure patterns support vs block AI adoption?",
        "How do leading DD firms assess AI readiness today?",
      ]},
      { streamNumber: 3, title: "Does AI readiness affect valuations and deal outcomes?", questions: [
        "Find evidence from 2024-2026 transactions where AI capability influenced deal pricing",
        "Are there sectors where AI readiness carries more valuation weight?",
        "What happens when AI claims collapse under due diligence?",
        "How should investors weigh AI readiness vs other technology factors?",
      ]},
    ],
  },

  {
    slug: "tech-debt-investment-risk",
    title: "Technical Debt as Investment Risk: What the Numbers Actually Say",
    target_site: "altimitech.com",
    primary_keyword: "technical debt investment risk",
    sequence_position: 3,
    github_issue: "dontriskit/altimi-pe#22",
    streams: [
      { streamNumber: 1, title: "Quantifying technical debt", questions: [
        "What is the best available data on how much time developers spend on maintenance vs new features?",
        "Is there evidence that maintenance costs compound over time? What does the growth curve look like?",
        "How do researchers and practitioners define and measure technical debt?",
        "What percentage of IT budgets goes to maintaining existing systems vs building new capabilities?",
      ]},
      { streamNumber: 2, title: "Business impact — what breaks when debt accumulates", questions: [
        "Find evidence linking technical debt to: deployment frequency, incident rates, security vulnerabilities, developer attrition",
        "Are there documented cases where accumulated tech debt caused business failures or missed opportunities?",
        "What do developers actually say about working in high-debt codebases?",
        "Is there data on how tech debt affects the ability to respond to market opportunities?",
      ]},
      { streamNumber: 3, title: "Tech debt in the context of PE investment", questions: [
        "Does technical debt show up in valuations? How do deal teams account for it?",
        "Find research on how tech debt levels correlate with exit outcomes in PE portfolio companies",
        "What are the typical remediation costs for different levels of technical debt?",
        "How do operating partners approach tech debt in portfolio companies?",
      ]},
    ],
  },

  {
    slug: "dd-findings-deal-pricing",
    title: "From Findings to Price: How Technical DD Changes Deal Negotiations",
    target_site: "altimitech.com",
    primary_keyword: "technical due diligence deal pricing",
    sequence_position: 4,
    github_issue: "dontriskit/altimi-pe#23",
    streams: [
      { streamNumber: 1, title: "How deal teams use DD findings in negotiations", questions: [
        "What do PE professionals and tech DD practitioners say about how findings influence deals?",
        "How frequently do DD findings lead to price adjustments, earnout restructuring, or deal cancellation?",
        "What types of technical findings carry the most negotiation weight?",
        "Are there standardized frameworks for translating technical risk into financial terms?",
      ]},
      { streamNumber: 2, title: "Remediation cost benchmarks", questions: [
        "What does it actually cost to fix common DD findings? Research published benchmarks",
        "How do remediation costs vary by system complexity, team size, and technology stack?",
        "How accurate are pre-deal remediation estimates vs actual post-deal costs?",
        "What is the typical timeline for addressing critical DD findings?",
      ]},
      { streamNumber: 3, title: "The information advantage", questions: [
        "Research on information asymmetry in technology transactions",
        "How do representation & warranty insurance policies handle technology risks?",
        "Find evidence on whether informed buyers achieve different deal outcomes than uninformed ones",
        "What is the game theory of DD: when does a buyer benefit from sharing findings?",
      ]},
    ],
  },

  {
    slug: "first-90-days-value-creation",
    title: "The First 90 Days: Turning DD Into a Post-Deal Value Creation Engine",
    target_site: "altimitech.com",
    primary_keyword: "post-deal value creation technology",
    sequence_position: 5,
    github_issue: "dontriskit/altimi-pe#24",
    streams: [
      { streamNumber: 1, title: "What top PE firms do post-close with technology", questions: [
        "How do firms like Vista Equity, Thoma Bravo, or Hg Capital approach technology in portfolio companies?",
        "What does the first 90-day technical playbook look like at leading firms?",
        "How do operating partners prioritize technology interventions?",
        "Find published case studies of PE-driven technology transformations",
      ]},
      { streamNumber: 2, title: "Measurable outcomes from structured technical intervention", questions: [
        "Is there evidence that post-deal technology improvements lead to measurable business gains?",
        "What is the typical timeline to see results from tech improvements?",
        "How do DORA metrics change in portfolio companies that receive focused technical attention?",
        "Find before/after data from portfolio company tech transformations",
      ]},
      { streamNumber: 3, title: "How DD findings seed the post-deal roadmap", questions: [
        "How can DD findings be structured to directly inform a 90-day improvement plan?",
        "What is the relationship between DD severity scoring and remediation prioritization?",
        "How do AI-augmented development tools change the speed of post-deal remediation?",
        "What role does the DD team play in the post-deal period?",
      ]},
    ],
  },

  {
    slug: "ai-augmented-deal-assessment",
    title: "The AI-Augmented Deal: How Code-Writing AI Changes Technology Assessment for Investors",
    target_site: "altimitech.com",
    primary_keyword: "AI code generation PE investment",
    sequence_position: 6,
    github_issue: "dontriskit/altimi-pe#25",
    streams: [
      { streamNumber: 1, title: "The current state of AI-assisted development (2025-2026)", questions: [
        "What are the actual adoption rates of AI coding tools in enterprise?",
        "What do the best available studies say about productivity impact? Trace claims to original research",
        "How are AI coding tools being used specifically? (Code gen, debugging, testing, docs, review)",
        "What is the current market landscape? Key players, sizes, growth rates",
      ]},
      { streamNumber: 2, title: "Implications for technology assessment", questions: [
        "How does AI-assisted development change what 'good' looks like in a technology platform?",
        "Does a team's AI tool adoption correlate with other maturity indicators?",
        "How should DD practitioners assess AI readiness and AI tool usage in targets?",
        "What new risks emerge from AI-generated code? (License, security, model dependency)",
      ]},
      { streamNumber: 3, title: "The widening gap between modern and legacy platforms", questions: [
        "Is there evidence that the productivity gap between AI-augmented and legacy teams is growing?",
        "What does this mean for competitive dynamics in PE portfolio sectors?",
        "How does the rise of AI coding tools change the modernization calculus?",
        "What should PE investors look for in 2026 that they didn't need to in 2023?",
      ]},
    ],
  },

  // ─── Modernization Track (altimi-dev.com) ───

  {
    slug: "modernization-playbook-2026",
    title: "The Legacy Modernization Playbook: What the Research Says About Phased Migration in 2026",
    target_site: "altimi-dev.com",
    primary_keyword: "AI legacy modernization",
    sequence_position: 1,
    github_issue: "dontriskit/altimi-dev#7",
    streams: [
      { streamNumber: 1, title: "The scale of the legacy problem in 2026", questions: [
        "How large is the global legacy system installed base? What frameworks are aging out?",
        "What do enterprises spend on maintaining legacy systems vs building new capabilities?",
        "Is there evidence that maintenance costs compound? What is the growth rate?",
        "What industries are most affected? Find sector-specific data on legacy burden",
      ]},
      { streamNumber: 2, title: "AI-assisted development for modernization — what the evidence actually shows", questions: [
        "Find every rigorous study on AI coding tool productivity (GitHub, Google, McKinsey, academic)",
        "Separate results for migration/refactoring tasks specifically from greenfield coding",
        "What AI tools are being used for modernization specifically?",
        "What are the documented limitations and failure modes of AI in modernization?",
      ]},
      { streamNumber: 3, title: "Phased migration vs full rewrite — what does the evidence say?", questions: [
        "Trace the commonly cited rewrite failure rate claims to their original sources",
        "Find documented case studies of both successful phased migrations and successful full rewrites (2020-2026)",
        "What conditions predict success for each approach?",
        "How does the Strangler Fig pattern perform in practice? Find real timelines and outcomes",
      ]},
    ],
  },

  {
    slug: "strangling-the-monolith",
    title: "Strangling the Monolith: Patterns, Tools, and Real Timelines for Incremental Migration",
    target_site: "altimi-dev.com",
    primary_keyword: "strangler fig pattern modernization",
    sequence_position: 2,
    github_issue: "dontriskit/altimi-dev#8",
    streams: [
      { streamNumber: 1, title: "The Strangler Fig pattern — theory, variants, and evolution", questions: [
        "Trace Martin Fowler's original concept and how it's evolved",
        "What variants exist? (Branch by Abstraction, Parallel Run, Anti-Corruption Layer, Facade)",
        "How do practitioners choose between variants?",
        "What has changed about the pattern's practicality with modern tooling (2024-2026)?",
      ]},
      { streamNumber: 2, title: "Tooling for incremental migration in 2026", questions: [
        "What tools are teams using for code understanding across large legacy codebases?",
        "What codemod and automated migration tools exist? Find adoption data and effectiveness evidence",
        "How are AI tools being used for test generation against untested legacy code?",
        "What CI/CD patterns support running old and new systems in parallel?",
      ]},
      { streamNumber: 3, title: "Real project timelines and outcomes", questions: [
        "Find documented incremental migration case studies with actual timelines",
        "What is the typical duration for strangling a medium-complexity monolith?",
        "Where do incremental migrations stall or fail? Common failure modes?",
        "Find evidence on team size, cost, and prerequisites for successful incremental migration",
      ]},
    ],
  },

  {
    slug: "ai-modernization-honest-assessment",
    title: "AI in Modernization: An Honest Assessment of What Works, What Doesn't, and What's Hype",
    target_site: "altimi-dev.com",
    primary_keyword: "AI accelerated modernization",
    sequence_position: 3,
    github_issue: "dontriskit/altimi-dev#9",
    streams: [
      { streamNumber: 1, title: "AI for code comprehension and legacy discovery", questions: [
        "What evidence exists that AI tools help developers understand unfamiliar codebases faster?",
        "How effective are AI tools at mapping dependencies in large legacy systems?",
        "Can AI reliably extract business rules from spaghetti code? Accuracy rates?",
        "Find practitioner reports on using AI for legacy code understanding",
      ]},
      { streamNumber: 2, title: "AI for code transformation and migration", questions: [
        "What evidence exists for AI-assisted framework migration? (AngularJS→React, Java 8→21, etc.)",
        "How effective are AI-generated codemods vs hand-written ones?",
        "What is the quality of AI-generated migration code? Error rates, rework rates?",
        "What types of transformation does AI handle well vs poorly?",
      ]},
      { streamNumber: 3, title: "AI for testing and quality assurance during modernization", questions: [
        "How effective are AI-generated test suites for legacy code?",
        "Can AI tools detect behavioral differences between old and new implementations?",
        "What is the state of AI-assisted E2E testing for migration validation?",
        "What governance practices are teams using for AI-generated code in modernization?",
      ]},
    ],
  },

  {
    slug: "legacy-talent-equation",
    title: "The Talent Equation: How Legacy Stacks Affect Hiring, Retention, and Team Velocity",
    target_site: "altimi-dev.com",
    primary_keyword: "developer hiring legacy systems",
    sequence_position: 4,
    github_issue: "dontriskit/altimi-dev#10",
    streams: [
      { streamNumber: 1, title: "Developer preferences and stack sentiment", questions: [
        "What do major developer surveys say about willingness to work on specific technologies?",
        "Which technologies are developers most/least interested in for 2025-2026?",
        "Is there data on how stack choice affects job application and acceptance rates?",
        "What do developers say about reasons for leaving? How often is technology stack a factor?",
      ]},
      { streamNumber: 2, title: "The economics of hiring on legacy stacks", questions: [
        "Is there salary premium data for legacy technology specialists?",
        "What is the time-to-hire difference between legacy and modern stack positions?",
        "How is the supply of legacy specialists changing? Retirement rates, training pipeline?",
        "Find data on contractor rates for legacy vs modern technologies",
      ]},
      { streamNumber: 3, title: "Does stack modernization measurably improve talent outcomes?", questions: [
        "Find case studies where companies modernized and measured impact on hiring/retention",
        "Is there evidence that developer productivity differs between legacy and modern stacks?",
        "How does stack choice affect developer satisfaction and team morale?",
        "What is the relationship between technology investment and employer brand in engineering?",
      ]},
    ],
  },

  {
    slug: "compliance-driven-modernization",
    title: "Compliance Under Pressure: How Regulatory Deadlines Force — and Fund — Modernization",
    target_site: "altimi-dev.com",
    primary_keyword: "regulatory compliance modernization",
    sequence_position: 5,
    github_issue: "dontriskit/altimi-dev#11",
    streams: [
      { streamNumber: 1, title: "The 2025-2027 regulatory landscape", questions: [
        "Map major regulations: DORA, NIS2, EU AI Act, PSD3, eIDAS2, smart metering mandates",
        "What are the technology implications of each?",
        "Which industries and company sizes are most affected?",
        "Find data on compliance spending trajectory",
      ]},
      { streamNumber: 2, title: "Why legacy systems fail compliance", questions: [
        "What specific technical gaps do legacy platforms have vs modern regulatory requirements?",
        "Find cases where legacy architecture blocked or complicated compliance",
        "What is the cost difference: patching legacy for compliance vs modernizing?",
        "Cases where compliance failure was directly caused by technology limitations?",
      ]},
      { streamNumber: 3, title: "Regulatory deadlines as modernization catalysts", questions: [
        "Find case studies where regulatory deadlines triggered broader modernization",
        "How do organizations fund compliance-driven modernization?",
        "What patterns emerge? (Phase 1: compliance, Phase 2: broader platform?)",
        "Risks of rushing modernization under regulatory pressure? Find failure cases",
      ]},
    ],
  },

  {
    slug: "monolith-to-enterprise-ready",
    title: "From Monolith to Enterprise-Ready: What Buyers Actually Require and How to Get There",
    target_site: "altimi-dev.com",
    primary_keyword: "monolith to modular SaaS",
    sequence_position: 6,
    github_issue: "dontriskit/altimi-dev#12",
    streams: [
      { streamNumber: 1, title: "What enterprise procurement evaluates in 2025-2026", questions: [
        "What technical requirements appear in enterprise RFPs and security questionnaires?",
        "How has the enterprise buying checklist evolved? What's new in 2025-2026?",
        "How often is technology architecture a blocker for enterprise deals?",
        "What do enterprise IT teams say about integration requirements?",
      ]},
      { streamNumber: 2, title: "Where monolithic architecture blocks enterprise readiness", questions: [
        "What specific enterprise requirements are hard with monolithic architecture?",
        "Find cases where SaaS companies lost enterprise deals due to architecture",
        "Cost of retrofitting enterprise features into a monolith vs extracting as services?",
        "How do PE firms evaluate platform architecture in acquisition targets?",
      ]},
      { streamNumber: 3, title: "The extraction playbook — what works in practice", questions: [
        "Find documented cases of monolith → enterprise-ready transformation",
        "What capabilities are typically extracted first? Common sequence?",
        "Realistic timelines for extracting core enterprise capabilities?",
        "How do AI tools change the speed and cost of service extraction?",
      ]},
    ],
  },
];
