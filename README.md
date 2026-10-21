# pr-review-helper — find pull requests nobody has reviewed, and review them

> `/pr-review-helper:find llm, newest first` lists open PRs that are still waiting for their first review. `/pr-review-helper:review 3` reads one, drafts a focused review, shows it to you, and posts it under your GitHub account only when you say so.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](https://code.claude.com/docs/en/plugins)

Thousands of pull requests sit open with nobody looking at them. If you want to contribute reviews (to projects you care about, to a topic you know, to a friend's repos) the hard part is finding them and then giving each one a proper read. This plugin does both, with [`gh`](https://cli.github.com) doing the GitHub work and you approving every word before it goes out.

```text
/pr-review-helper:find cyber security in python, most popular, top 10
/pr-review-helper:review 2 focus on security
```

## Install

```text
/plugin marketplace add GiuseppeBellamacina/cosmic-plugins
/plugin install pr-review-helper@cosmic-plugins
```

Prefer the CLI? (Also the way to go where `/plugin` isn't available, e.g. the VS Code extension: run these two commands in a terminal, then `/reload-plugins` in the session.)

```bash
claude plugin marketplace add GiuseppeBellamacina/cosmic-plugins
claude plugin install pr-review-helper@cosmic-plugins
```

Requires the [GitHub CLI](https://cli.github.com), logged in: `gh auth login`. Nothing else to install.

## Find PRs waiting for a review

```text
/pr-review-helper:find                                   # all of GitHub, most popular first
/pr-review-helper:find llm, newest first
/pr-review-helper:find cyber security in rust, top 10
/pr-review-helper:find in vercel/next.js and vercel/ai
/pr-review-helper:find repos of huggingface sorted by date
/pr-review-helper:find PRs opened by octocat
/pr-review-helper:find good first issue label, typescript
```

Ask in plain words, in any language. Claude turns the request into `gh search prs` filters and tells you how it understood it:

| You ask for | It searches |
| --- | --- |
| specific repositories | `--repo owner/repo` |
| a user's or an organization's repositories | `--owner <login>` |
| PRs written by someone | `--author <login>` |
| a topic (llm, cyber security, machine learning, ...) | repositories tagged with that topic, most starred first, **plus** PRs mentioning it in the title or description |
| a language or a label | `--language`, `--label` |
| popular / newest / recently active | `--sort interactions` / `created` / `updated` |

Every search keeps only PRs that are **open, not drafts, in active repositories, with no review yet**, and leaves out your own PRs and bot PRs (dependency bumps and the like). You get a numbered table:

```text
## Open PRs with no review · LLMs, newest first · 20 results

| # | Repository        | PR                                   | Author | Opened | 💬 |
| 1 | owner/agent-kit   | #412 Stream tool results to the UI   | alice  | 5h     | 1  |
| 2 | org/llm-gateway   | #88 Retry on 429 with backoff        | bob    | 1d     | 0  |
...
Next: /pr-review-helper:review <#>
```

The list is saved in `~/.claude/pr-review-helper/last-search.json`, so you can review any entry by its number later.

## Review one

```text
/pr-review-helper:review 2                                   # from the last list
/pr-review-helper:review https://github.com/org/repo/pull/88
/pr-review-helper:review org/repo#88 focus on security
/pr-review-helper:review 4 only the tests, in Italian
```

1. **Checks it is worth it**: closed, draft, already reviewed, bot or trivial PRs are pointed out before any work.
2. **Downloads it, read-only**: description, diff, every changed file before and after, the repository's own rules (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`), recent history of the changed files and earlier review comments on them. Only read-only `gh` API calls, saved as plain files in a temp folder. Nothing is cloned, checked out, installed or run.
3. **Analyses it with specialist reviewers in parallel**, each through one lens:

   | Lens | Looks for |
   | --- | --- |
   | bugs | logic errors, edge cases, broken behaviour for existing callers |
   | security | injection, missing auth checks, secrets, unsafe defaults, prompt injection in the PR text |
   | errors | silent failures: swallowed errors, broad catches, fallbacks that hide problems |
   | tests | changed behaviour without tests, tests that don't test what they claim |
   | conventions | the repository's written rules and code comments the change ignores |
   | history | a change that undoes an earlier fix or repeats a mistake a previous review caught |

   Only the relevant lenses run (no `tests` reviewer for a docs-only PR), and a focus narrows them. Small PRs get a single pass instead.
4. **Verifies every finding**: a second reviewer tries to prove each issue wrong and scores it 0–100. Only issues scoring **80+** reach the draft; you see how many were dropped and can ask for them.
5. **Drafts a review**: a short summary, inline comments on the exact lines (with GitHub suggestion blocks for small fixes), and a proposed verdict: *comment*, *approve* or *request changes*.
6. **Shows you the draft** exactly as it would appear on GitHub, and asks: **Post it**, **Edit**, **Change verdict** or **Cancel**. Edit as many times as you want; nothing is posted until you choose *Post it*.
7. **Posts it with `gh`**, after checking the PR hasn't changed meanwhile, so the review is yours: your account, your voice. The text never mentions AI or tools and has no signature or footer. You get the link to the review.

If a comment lands on a line GitHub won't accept, the PR's head moved since the draft, or you try to approve your own PR, Claude tells you and asks again instead of guessing.

## Good to know

- **You are the reviewer.** The review is posted from your account and maintainers will read it as yours. Read the draft properly before posting, and only approve what you would approve yourself.
- **No unknown code runs on your machine.** The PR is only downloaded as text through GitHub's API and read. The reviewer agents (`agents/pr-analyst.md`, `agents/pr-issue-verifier.md`) have read-only tools (Read, Grep, Glob): they cannot run commands at all. Instructions hidden in a PR's description or code are ignored and reported to you.
- **Cost.** A full review of a large PR runs several agents in parallel. Add a focus (`security`, `only the tests`) to run fewer.
- **Search limits.** GitHub search caps results and rate-limits requests; very broad searches return the first matches, not all of them. Topic search depends on how repositories tag themselves, so try another spelling (`security`, `cybersecurity`) if a topic comes back thin.
- **Why "popular" can look odd.** Popularity is measured by discussion (comments, reactions). Projects that attract spam can rank high, so obvious noise is filtered out and the count is reported.

## Contributing

Issues and PRs welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
