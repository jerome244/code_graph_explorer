# Stage 1 Report — Team Formation & Idea Development

> This report consolidates the outputs of Stage 1 (Team Formation, Research & Brainstorming, Idea Evaluation, Decision & Refinement, and Documentation) based on the uploaded diagram **MVP.drawio** and structured to meet the assignment requirements.

---

## 0) Team Formation Overview

**Team members & initial roles**
- **Jerome Tran** — *Temporary Project Manager (PM)*  
  Coordinates meetings, timeline, and task assignment.
- **Ryota** — *Design Lead (UX/UI)*  
  Drafts user journeys, sketches wireframes, and aligns usability.
- **Pierre** — *Research Lead*  
  Gathers references, benchmarks tools, and prepares technical notes.

**Collaboration strategy & norms**
- **Tools**: Discord & Slack (communication), diagrams.net/draw.io (visual ideation), VS Code (dev), hybrid/remote workflow.
- **Cadence**: Stand‑up 10–15 min at the start of sessions; weekly 30–45 min review.
- **Decisions**: Lightweight RFC in a shared doc, consensus when possible, PM as tie‑breaker.
- **Documentation**: Meeting notes and decisions recorded immediately; versioned in a shared repo/folder.

---

## 1) Ideas Explored

### A. *Code Graph* — Collaborative code visualization/workbench (⚑ **Selected MVP**)
- **Problem insight**: “The coding world cruelly misses diagrams.” Teams and learners struggle to see project **architecture**, **file relationships**, and **module interactions**; this slows debugging, onboarding, and education.
- **Concept**: A web app that mixes the strengths of **VS Code** and **draw.io** to visualize code structure as an interactive graph (files, modules, layers), with basic collaboration.
- **Who benefits**: Students, new joiners, teaching assistants, teams doing code reviews or onboarding.
- **Why now**: Fits the team’s interests (cybersecurity, architecture) and addresses concrete pain points encountered during Holberton studies (soft skills, team workflows).

### B. OSINT exploration add‑ons (considered as separate module, **deferred**)
- **Idea**: Integrate OSINT helpers (e.g., reference lookups or knowledge links) inside the workbench.
- **Reason for deferral**: Non‑core to “code graph” learning value; adds external data/privacy complexity; better as a **post‑MVP** plugin.

### C. “Minecraft‑style” visualization (considered as separate path, **rejected for Stage 1**)
- **Idea**: Render code structure in a 3D/game metaphor to boost engagement.
- **Reason for rejection**: High implementation cost; distracts from achieving a usable **minimum** product; risk of scope creep.

> Other notes from the diagram: *“autre applications”* were mentioned as possibilities but not specified; these are deferred until after a solid MVP.

---

## 2) Evaluation Criteria & Rubric

**Criteria (from the brief + team context)**
- **Feasibility** (F): Can we build a minimal version within the time and skills available?
- **Potential Impact** (I): Will it significantly improve learning/collaboration?
- **Technical Alignment** (T): Fit with preferred stack and learning goals.
- **Scalability** (S): Can the approach grow to more users/projects later?
- **Risk/Complexity** (R): Lower is better (we invert in scoring).

**Rubric (0–5 per criterion) and results**

| Idea | F | I | T | S | R* | **Total/25** | **Rank** | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| **Code Graph (workbench)** | 4 | 5 | 5 | 4 | 3 | **21** | **1** | Strong core value; clear minimal slice; manageable risks. |
| OSINT add‑ons | 3 | 3 | 3 | 3 | 2 | **14** | 2 | Useful later; increases privacy/UX complexity; not core MVP. |
| Minecraft‑style viz | 2 | 3 | 2 | 3 | 1 | **11** | 3 | High effort for low MVP value; risk of scope creep. |

*R is scored as **risk tolerance** (higher = safer).

---

## 3) Decision & Refinement

### Selected MVP: **Code Graph — Minimal Collaborative Code Visualization**

**Problem it solves**
- Codebases are hard to **see** and **explain**: architecture, file/module relationships, and inter‑layer links are invisible in most editors.
- Students/teams spend extra time aligning mental models, slowing reviews and onboarding.

**Target users**
- Coding students, new team members, mentors/TAs, and small teams needing shared architectural understanding.

**Scope & Key features (MVP)**
1. **Auth & persistence**: Registration, login/logout, and storing user projects.
2. **Graph basics**: Create/import simple graphs representing files/modules; edit node/edge labels; minimal save/load; share a project (read‑only link).
3. **Tech choice (from diagram)**:  
   - **Frontend**: **Next.js + React** (popular, strong community, easy component structure).  
   - **Graph engine**: **Cytoscape.js** (chosen; alternatives were considered).  
   - **Backend**: **Django** (clean ORM, batteries‑included for DB/auth; keeps clear **backend/frontend** separation).

**Expected outcomes**
- Faster onboarding and code reviews thanks to shared visual mental models.
- Better learning outcomes through interactive diagrams of real codebases.

**Out‑of‑scope (Post‑MVP)**
- **Realtime sync** (websockets) for multi‑cursor graph editing.  
- **OSINT helpers**, “Minecraft‑style” visualization, and advanced analytics.

**Risks & constraints**
- **Scalability**: Graph rendering and multi‑user sessions could become heavy as projects grow.  
- **Mitigation**: Start with single‑user + sharable view; optimize graph size; design API/DB for future pagination and lazy loading.

---

## 4) Process Summary (How we decided)

- **Brainstorming methods used**:  
  - **Mind Mapping** in draw.io to fan out needs (architecture, onboarding, education).  
  - **SCAMPER** to enhance the base idea (Combine VS Code’s editing metaphor with draw.io’s visual maps; Eliminate non‑essentials like 3D early).  
  - **“How Might We”** prompts, e.g., *“How might we make code architecture instantly visible to newcomers?”*, *“How might we keep MVP minimal yet extensible?”*

- **Shortlist → Rubric scoring**: We scored candidate ideas with Feasibility/Impact/Technical/Scalability/Risk, then selected **Code Graph** (21/25).

- **Refinement**: We narrowed MVP to **auth + minimal graph + persistence + share link**, deferring realtime and non‑core features.

---

## 5) Appendix — Technical Notes (from the diagram)

- Frontend: **Next.js + React**
- Graph: **Cytoscape.js**
- Backend: **Django** (clean DB communication, built‑in auth); explicit separation between frontend and backend.
- Near‑term roadmap after MVP:  
  1) **Realtime sync** (websocket) for shared editing.  
  2) Optional modules (e.g., OSINT helpers, alternative visualizations).

---

## Checklist (Assignment Compliance)

- [x] **Team Formation Overview** (members, roles, collaboration norms)  
- [x] **Ideas Explored** (strengths/weaknesses + reasons for rejection/deferral)  
- [x] **Selected MVP Summary** (rationale & potential impact)  
- [x] **Decision‑making process documented** (methods, rubric, results)  
- [x] Risks & constraints identified; scope clearly defined (MVP vs Post‑MVP)

