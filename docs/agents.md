# Agents roster

Subagents live in `.claude/agents/`. Each one is a Markdown file with YAML frontmatter defining its name, description, and tool access. Claude Code picks them up on session start — if you add or edit a definition, restart the session to make it available.

Invoke via the **Agent** tool with `subagent_type: "<name>"`. The roster is deliberately small; add a new persona by dropping a new file into `.claude/agents/`.

## Review personas

These three are review-only (no write/edit access). Use them on client-facing artefacts — briefs, problem statements, positioning drafts, proposal language, decks.

| Name | Lens | Use when you need… | Output shape |
|---|---|---|---|
| [**stratty**](../.claude/agents/stratty.md) | Strategy / commercial | …to know whether the argument is commercially defensible and whether it lands on one sharp thing. | Short memo: recommendation → main tradeoff → weakest claim → what to kill. ≤400 words. |
| [**amy**](../.claude/agents/amy.md) | Account management | …a client-facing read: what the client actually wants, what we're quietly committing to, what might damage the relationship, what we should ask before we ship. | Structured read: what-client-wants-vs-said → scope-creep flags → relationship risk → uncomfortable question → ship/hold/rework. ≤500 words. |
| [**critty**](../.claude/agents/critty.md) | Adversarial critic | …an argument stress-tested before a competitor, reviewer or sceptical client does it for you. | Numbered holes with severity → steel-manned counter-case → what to defend vs. retreat from. ≤600 words. |

### When to run them together

Run all three in parallel against the same artefact when the stakes are high (pitch deck, problem statement going to a client lead, strategic positioning, commercial pivot). They're deliberately redundant at the edges — the overlap flags things nobody wanted to mention.

### Calling them

```
Agent(
  subagent_type: "stratty",
  description: "Stratty read of the Bbron draft",
  prompt: "Read /home/user/agency-review-portal/docs/bbron-market-analysis.md and apply your persona. Produce your four-section memo."
)
```

## Built-in agents (always available)

| Name | Purpose |
|---|---|
| `general-purpose` | General research, multi-step tasks, code search. Use when you need a subagent but none of the named personas fit. |
| `Explore` | Fast codebase exploration (find files, search code, answer structural questions). Specify thoroughness: quick / medium / very thorough. |
| `Plan` | Implementation architect. Returns step-by-step plans and identifies critical files. Read-only. |
| `claude-code-guide` | Q&A about Claude Code (the CLI), Claude Agent SDK, and Claude API. |
| `statusline-setup` | Configures the Claude Code statusline. |

## Adding a new persona

1. Create `.claude/agents/<name>.md` with YAML frontmatter:
   ```yaml
   ---
   name: <name>
   description: One-sentence "use this when…" brief. This is what the router reads to decide when to invoke it.
   tools: Read, Grep, Glob, WebSearch, WebFetch  # tighten as needed
   ---
   ```
2. Body = the system prompt. Define persona, reading process, output shape, and guardrails.
3. Add a row to this table.
4. Restart the session so the definition is picked up.

Conventions worth keeping:
- **Reviewers are read-only.** Don't give a review persona write/edit tools unless you mean it.
- **Define the output shape.** An agent without a defined output produces generic consulting-speak.
- **Put the word-count cap in the guardrails.** Keeps them focused.
- **Use the description field to route.** The planner reads it to decide which agent to call — make it a clean "use this when X" sentence, not a mission statement.
