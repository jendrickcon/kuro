# Kuro Windows Setup Guide

Kuro runs on **Node.js `24.x`** and **npm** (`package.json` + `package-lock.json`). You do **not** need Python, `requirements.txt`, or a `GEMINI_API_KEY` for the current mock milestone.

---

## Option A: Let Your Coding AI Perform Setup

Paste this prompt into Claude Code or Codex (replace `<PARENT_FOLDER>` or let the AI ask you where to place the project):

> Clone https://github.com/jendrickcon/kuro into a new local project folder, install the locked npm dependencies, run the verification commands, and stop before making code changes. Show every command and report any failure honestly.

*Rule for your AI:* If no target parent folder was provided, ask which folder on Windows to clone into (for example, `C:\Users\<USER>\projects`) before running commands.

---

## Option B: Manual PowerShell Terminal Setup

1. Install **Git for Windows** and **Node.js 24 LTS** (which bundles `npm`).
2. Open **PowerShell**.
3. Choose or create a clean parent workspace folder:
   ```powershell
   mkdir C:\Users\<USER>\projects
   cd C:\Users\<USER>\projects
   ```
4. Clone the repository:
   ```powershell
   git clone https://github.com/jendrickcon/kuro.git
   ```
5. Enter the repository folder and verify Node/npm:
   ```powershell
   cd kuro
   node --version
   npm --version
   ```
6. Install the exact locked dependencies from `package-lock.json`:
   ```powershell
   npm ci
   ```
7. Run all local verification checks:
   ```powershell
   npm run typecheck
   npm run lint
   npm run test:schema
   npm run build
   ```
8. Start the local development server:
   ```powershell
   npm run dev
   ```
9. Open the `http://localhost:...` URL printed in PowerShell (usually `http://localhost:3000`).

## Important Setup Rules

- **Use `npm ci`:** Installs exact versions from `package-lock.json` without editing lockfiles. Only run `npm install <pkg>` when adding an approved dependency.
- **No `requirements.txt`:** Kuro uses Next.js/TypeScript, not Python.
- **No `.env` commits:** Mock mode needs zero credentials; never commit `.env` or `.env.local` files.
- **Wait for assignment:** Do not create feature branches or edit files until the Project Owner assigns your work package.

## Common Troubleshooting

| Symptom | Likely Cause & Fix |
| --- | --- |
| `git` is not recognized | Install Git for Windows, then open a **new** PowerShell window so `PATH` updates. |
| `node` or `npm` is not recognized | Install Node.js 24 LTS cleanly, then restart PowerShell and re-check `node --version`. |
| Missing `package.json` error | Wrong working directory; `cd` into your cloned `kuro` folder first. |
| `npm ci` lockfile mismatch | Ensure `git status` shows an unmodified `package-lock.json`, pull latest `main`, and close running Node processes. |
| Port `3000` already occupied | Stop any other `next dev` / `npm run start` terminal, or use the alternate port Next.js reports (e.g., `3001`). |
| `npm run build` fails cleanly | Verify `node --version` is `v20.9+` (`24.x` expected) and report the exact error output before editing. |
