# AI Contributor Onboarding Protocol

Instructions for **Claude Code**, **Codex**, and any compatible coding agent onboarding a Kuro contributor.

## Copy-Paste Starter Prompt for Team Members

> Audit https://github.com/jendrickcon/kuro. Before changing anything, read the repository’s README, SPEC, AGENTS, CONTRIBUTING, and AI onboarding instructions. Give me a brief beginner-friendly setup guide for my device, then ask whether I am Team Member Lucky or Team Member JR. After I answer, load my member guide, summarize my current lane and package boundaries, and ask whether I want a brief overview of the project roadmap. Do not implement anything until my role and assigned work package are confirmed.

## Onboarding Execution Sequence

1. Audit live repository state before advising or editing.
2. Read `README.md`, `SPEC.md`, `AGENTS.md`, `CONTRIBUTING.md`, and this guide.
3. Ask the contributor to identify themselves and **wait** for their answer.
4. Load the matching lane document (`TEAM_LUCKY.md` or `TEAM_JR.md`, or `SPEC.md` + `AGENTS.md` for Project Owner).
5. Identify the current baseline cleanly without inventing an active package.
6. Summarize the member’s lane and boundaries in plain language.
7. Provide AI-assisted or manual Windows setup steps (`SETUP_WINDOWS.md`).
8. Ask if they want a brief overview of the roadmap (`ROADMAP_BRIEF.md`).
9. Ask what work package or task the Project Owner assigned; **stop** if none exists.
10. Respect Project Owner merge authority: open titled, described PRs and leave them **OPEN**.

## Required 6-Step Contributor Interaction Contract

### Step 1: Repository Audit
Report briefly from observed files/commands:
- Current branch and latest `main` commit
- Tech stack (`Next.js`, `React`, `TypeScript`, `Tailwind CSS`, `Zod`, `Node.js 24.x` + `npm`)
- Available npm scripts (`dev`, `build`, `start`, `lint`, `typecheck`, `test:schema`)
- Major directories (`src/`, `contracts/`, `fixtures/`, `prototype/`, `docs/`, `scripts/`)
- Current project status (`Verified` mock player on `main`; live Gemini/TTS/Vercel `Pending` or `Blocked`)
- Current exclusions (`SPEC.md` Section 4)
- Missing local prerequisites (e.g., `node`, `npm`, `git`, `node_modules`)

### Step 2: Contributor Identification
Ask **exactly**:

> Which Kuro contributor are you?
> 1. Team Member Lucky
> 2. Team Member JR
> 3. Project Owner

Wait for the answer before proceeding.

### Step 3: Member-Specific Brief
- **If Lucky** (load [TEAM_LUCKY.md](./TEAM_LUCKY.md)):
  > Your lane is Kuro’s UI/UX, visual composition, accessibility, responsive design, mascot direction, and frontend presentation. Research useful products and public repositories before implementation, then produce an original Kuro solution within the assigned package.
- **If JR** (load [TEAM_JR.md](./TEAM_JR.md)):
  > Your lane is Kuro’s backend, AI contracts, Gemini/TTS integration, reliability, error handling, and testing. Implementation is not complete until the relevant validation, API, failure, and build checks pass or blocked tests are explicitly documented.
- **If Project Owner:** Summarize repository status using [SPEC.md](../../SPEC.md) and [AGENTS.md](../../AGENTS.md).

### Step 4: Setup
Offer both paths from [SETUP_WINDOWS.md](./SETUP_WINDOWS.md) cleanly:
- Option A: AI-assisted clone and verification (ask for parent folder first if omitted)
- Option B: Concise PowerShell commands (`npm ci` from `package-lock.json`, no `requirements.txt`)

### Step 5: Roadmap Question
Ask **exactly**:

> Would you like a brief overview of Kuro’s roadmap and which completed or upcoming work packages relate to your role?

If yes, summarize [ROADMAP_BRIEF.md](./ROADMAP_BRIEF.md).

### Step 6: Package Confirmation
Before editing any file or creating a branch, ask **exactly**:

> What work package or task has the project owner assigned to you?

If no work package is assigned, stop cleanly after audit and setup. Never fabricate an assignment.
