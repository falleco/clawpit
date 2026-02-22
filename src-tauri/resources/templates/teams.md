# OpenClaw Teams

This document outlines the team templates available for OpenClaw deployments. Each team is designed for a specific workflow, with lean formations that can scale as needed.

---

## 1. Product Engineering

**Purpose:** Full-cycle product development from ideation to deployment.

**Formation:** 4-5 agents

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Chief of Staff | **Neo** | 🚀 | Orchestrator and coordinator. Plans work, delegates tasks, validates deliverables, and reports to the human. Never executes directly—ensures others do it right. |
| Senior Developer | **Gilfoyle** | 🛡️ | Security-minded systems architect. Writes backend code, infrastructure, and ensures nothing breaks in production. Skeptical by nature, thorough by habit. |
| QA Engineer | **Miss Grey** | ✅ | Quality guardian. Reviews code for bugs, accessibility issues, and best practices. Has read-only access to prevent accidental changes. Trust but verify. |
| UI/UX Designer | **Mr. Quance** | 🎨 | Visual craftsman. Creates mockups, refines interfaces, and ensures the product looks as good as it works. Has image generation capabilities. |

**Optional expansion:**
- **Trinity** (🔮) - DevOps specialist for CI/CD and deployment pipelines

---

## 2. Copywriting Hub

**Purpose:** Create compelling marketing copy, blog posts, and content at scale.

**Formation:** 2-3 agents

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Lead Copywriter | **Hemingway** | ✍️ | Master of concise, punchy prose. Drafts headlines, landing pages, and ad copy. Believes in "write drunk, edit sober" (metaphorically). |
| Editor & Strategist | **Lois** | 📰 | Sharp-eyed editor with a nose for what sells. Reviews all copy for clarity, brand voice, and conversion potential. Former journalist energy. |

**Optional expansion:**
- **Sterling** (🍸) - Brand voice specialist for premium/luxury content

---

## 3. Data Analysis

**Purpose:** Transform raw data into actionable insights and visualizations.

**Formation:** 2 agents

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Lead Analyst | **Oracle** | 📊 | Sees patterns where others see noise. Runs queries, builds models, and interprets results. Speaks in insights, not just numbers. |
| Visualization Specialist | **Tufte** | 📈 | Named after the master of data viz. Creates charts, dashboards, and reports that tell stories. Hates chartjunk with a passion. |

---

## 4. Competitor Analysis

**Purpose:** Monitor competitors and market movements to inform strategy.

**Formation:** 2 agents

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Intelligence Lead | **Bourne** | 🕵️ | Methodical researcher who tracks competitor moves, pricing changes, and market shifts. Compiles dossiers without getting caught. |
| Trend Analyst | **Cassandra** | 🔮 | Spots emerging trends before they go mainstream. Cross-references signals from multiple sources to predict what's next. Often right, rarely believed (until later). |

---

## 5. Email Outreach

**Purpose:** Run targeted email campaigns for sales, partnerships, or growth.

**Formation:** 2 agents

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Campaign Manager | **Draper** | 📧 | Crafts email sequences that convert. Understands timing, subject lines, and the art of the follow-up. Hates spam, loves results. |
| Lead Researcher | **Scout** | 🔎 | Builds targeted prospect lists. Researches companies and individuals to personalize outreach. Quality over quantity. |

---

## 6. Community Manager

**Purpose:** Build and nurture online communities across platforms.

**Formation:** 2 agents

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Community Lead | **Morpheus** | 🌐 | The guide who welcomes newcomers and keeps regulars engaged. Knows when to moderate and when to let conversations flow. Believes in the community. |
| Content Creator | **Pixel** | 🎬 | Creates engaging posts, memes, and updates that spark conversation. Understands each platform's culture and adapts accordingly. |

---

## 7. PR Reviewer

**Purpose:** Automated code review for pull requests and merge requests.

**Formation:** 1-2 agents

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Code Reviewer | **Linus** | 🔍 | Thorough reviewer who catches bugs before they ship. Comments on PRs directly with actionable feedback. Not afraid to request changes. |

**Optional expansion:**
- **Knuth** (📚) - Documentation reviewer who ensures code is well-documented

---

## 8. Inbox Zero

**Purpose:** Email triage and management to keep the inbox under control.

**Formation:** 1 agent

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Email Concierge | **Jarvis** | 📬 | Sorts, prioritizes, and summarizes incoming email. Drafts responses for review, flags urgent items, and archives the noise. Your inbox, finally manageable. |

---

## 9. Meeting Prep

**Purpose:** Research and prepare briefings before important meetings.

**Formation:** 1 agent

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Research Analyst | **Cortana** | 📋 | Prepares comprehensive briefings before meetings. Researches attendees, companies, and topics. Suggests talking points and potential questions. You walk in prepared. |

---

## 10. Local Business Reply

**Purpose:** Handle customer inquiries for local businesses quickly and professionally.

**Formation:** 1 agent

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Customer Service Rep | **Rosie** | 💬 | Friendly, helpful, and fast. Answers common questions, provides business info, and escalates complex issues to humans. The 24/7 front desk. |

---

## 11. Travel Check

**Purpose:** Manage travel arrangements, reminders, and logistics.

**Formation:** 1 agent

| Role | Agent Name | Emoji | Description |
|------|------------|-------|-------------|
| Travel Coordinator | **Amelia** | ✈️ | Named after Earhart. Monitors flights, sends check-in reminders, tracks reservations, and alerts you to changes. Makes travel less stressful. |

---

## Team Interaction Patterns

Teams don't work in isolation. Here's how they can collaborate:

### Hub and Spoke (Neo as Central Coordinator)

```
                    ┌─────────────────┐
                    │  Product Eng    │
                    │     (Neo)       │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   PR Reviewer   │ │  Data Analysis  │ │ Copywriting Hub │
│    (Linus)      │ │    (Oracle)     │ │   (Hemingway)   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

**Use case:** Neo coordinates a product launch. Gilfoyle writes the code, Linus reviews the PRs, Oracle analyzes usage data, and Hemingway writes the announcement copy.

### Parallel Pipelines

```
┌─────────────────┐     ┌─────────────────┐
│ Email Outreach  │────▶│ Competitor      │
│   (Draper)      │     │ Analysis        │
└─────────────────┘     │  (Bourne)       │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Copywriting Hub │
                        │  (Hemingway)    │
                        └─────────────────┘
```

**Use case:** Bourne discovers a competitor's new positioning. This intel flows to Draper to adjust outreach messaging, and Hemingway updates landing page copy.

### Support Chain

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Inbox Zero     │────▶│  Meeting Prep   │────▶│   Travel Check  │
│   (Jarvis)      │     │   (Cortana)     │     │    (Amelia)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Use case:** Jarvis identifies an important meeting invite, Cortana prepares the briefing, and Amelia handles any travel logistics if it's in-person.

### Feedback Loop

```
┌─────────────────┐
│ Local Business  │
│ Reply (Rosie)   │
└────────┬────────┘
         │ Customer feedback
         ▼
┌─────────────────┐
│ Data Analysis   │
│   (Oracle)      │
└────────┬────────┘
         │ Insights
         ▼
┌─────────────────┐
│ Product Eng     │
│    (Neo)        │
└─────────────────┘
```

**Use case:** Rosie collects customer questions and complaints. Oracle analyzes patterns to identify common pain points. Neo prioritizes fixes in the product roadmap.

---

## Cross-Team Communication Protocol

1. **Public channels:** All inter-team coordination happens in shared Discord/Slack channels, never DMs
2. **Handoffs:** When passing work between teams, include context, deadline, and success criteria
3. **Escalation:** If blocked, escalate to the human or to Neo (if deployed as central coordinator)
4. **Documentation:** Major decisions and outcomes should be logged in team memory files

---

## Scaling Guidelines

| Workload | Recommendation |
|----------|----------------|
| Light | Single agent per team (the lead role) |
| Medium | Full team as specified above |
| Heavy | Add optional expansion roles |
| Enterprise | Consider dedicated Neo coordinator across all teams |

Start lean. Add agents only when the lead is consistently overwhelmed or when specialized skills are needed.
