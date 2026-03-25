<!-- GENERATED_BY_WORKSPACE_STANDARD_V1 -->
# Repository: clockrr

# Agent Workspace Contract

## Instruction Order
1. `C:\Users\kepne\.claude\CLAUDE.md` (global baseline)
2. `./CLAUDE.md` (project-specific rules)
3. `./.claude/settings.local.json` (repo-local permissions)

## Commands And Skills
- Global command packs: `/ccc:*`, `/cu:*`, `/cs:*`, `/sc:*` from `C:\Users\kepne\.claude\commands`.
- Repo-local command overrides: `./.claude/commands/**` (if present).
- Skill trackers and memory: `./.claude/skill-memory/**`.

## Repo Knowledge Layout
- Sessions: `./.claude/sessions/`
- Features: `./.claude/features/`
- Incidents/postmortems: `./.claude/incidents/` or `./.claude/postmortems/`
- References/research: `./.claude/references/`, `./.claude/research/`

## Cross-Workspace Defaults
- If the work touches hosting, deploys, DNS, public URLs, or live environments, check `C:\Users\kepne\OneDrive\Documents\@Projects\contabo-infra` and its `BRAIN.md` before assuming the current production setup.
- When finishing meaningful work in this repo, default to `git status` -> selective `git add <paths>` -> `git commit -m "<why>"` -> `git push origin <current-branch>`, unless the user explicitly says not to commit or not to push yet.
- If the user's prompt is short, vague, blunt, or underspecified, use `C:\Users\kepne\.claude\PROMPT_LIBRARY.md` to upgrade it internally before acting instead of asking them to restate it.

## Working Rule
- Apply global defaults first, then project-specific constraints from `./CLAUDE.md`.
- Keep project details in `./CLAUDE.md`; keep this file as the stable routing contract.

