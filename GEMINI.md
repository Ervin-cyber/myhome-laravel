# Project Instructions (GEMINI.md)

This file contains team-shared architecture, conventions, workflows, and other repo guidance for the `myhome-laravel` project.

## Project Overview
- **Backend:** Laravel (PHP)
- **Frontend:** Next.js (TypeScript)
- **Infrastructure:** Docker Compose

## Standards & Conventions
- Adhere to Laravel's PSR-12 coding standards for the backend.
- Use TypeScript for the frontend (Next.js).
- **Language:** All code, comments, variable names, and UI strings in the source code must be in English.
- Follow the Research -> Strategy -> Execution lifecycle for all changes.

## Working Style
- **Root Cause Analysis:** Always aim to fix bugs at their root cause rather than applying surface-level patches.
- **Error Handling:** Ensure all implementation tasks explicitly handle error cases and edge conditions.
- **Attentiveness to Side Effects:** When proposing or implementing optimizations, caching, or complex logic, always analyze and communicate potential side effects (e.g., stale state, security trade-offs, or performance regressions). Implement robust mitigation strategies (like cache busting or cooldowns) as part of the primary solution.
- **Consistency:** Maintain stylistic and architectural consistency with the existing codebase.
- **Precaution:** When in doubt about destructive or hard-to-reverse actions, ask the user before proceeding.

## Workflows
- Always run tests before pushing changes.
- Use Docker Compose for local development.
