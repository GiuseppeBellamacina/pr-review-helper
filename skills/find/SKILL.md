---
name: find
description: Search GitHub with gh for open pull requests that have no review yet, filtered by repository, user/organization, topic (llm, cyber security, ...), language or label, sorted by popularity or by date, and save the numbered list so /pr-review-helper:review can pick one. Use when the user runs /pr-review-helper:find.
disable-model-invocation: true
argument-hint: "[what to look for, in plain words: repos, users, topics, language] [sorted by popularity | date] [how many]"
---

# Find PRs waiting for a review

## 0. Understand what the user asked

`$ARGUMENTS` is a request in plain words, in any language: *"llm, newest first"*, *"cyber security in python, top 10"*, *"repos of huggingface"*, *"PRs by octocat"*, *"in vercel/next.js and vercel/ai"*. Turn it into filters:

| The user says | Filter |
| --- | --- |
| a repository (`owner/repo`) | `--repo owner/repo` (repeatable) |
| a user or organization whose **repos** to search | `--owner <login>` (repeatable) |
| PRs **written by** someone | `--author <login>` |
| a topic or subject (llm, cyber security, rust, web3, ...) | see step 2 |
| a programming language | `--language <lang>` |
| a label (`good first issue`, `documentation`, ...) | `--label <label>` |
| popular / most discussed | `--sort interactions` (default) |
| newest / recently opened | `--sort created` |
| recently active | `--sort updated` |
| oldest first | add `--order asc` |
| how many | `--limit <n>` (default 20, at most 50) |

"PRs of <user>" is ambiguous (their repos, or PRs they wrote?): ask with AskUserQuestion only in that case. Say your interpretation in one line before searching (*"Open PRs with no review about LLMs, newest first, 20 results."*). With no request, search all of GitHub sorted by popularity.

## 1. Base search

Every search uses these flags, which keep only open, non-draft PRs with **no review at all** in active repositories:

```
gh search prs --state open --review none --draft=false --archived=false \
  --limit <n> --sort <sort> [--order asc] [filters] \
  --json number,title,url,repository,author,createdAt,updatedAt,commentsCount,labels \
  -- [keywords] -author:@me
```

`-author:@me` leaves out the user's own PRs (they cannot review them). Put keywords and qualifiers after `--`.

## 2. Topics

A topic like *"llm"* or *"cyber security"* is not a GitHub search filter for PRs. Run both of these and merge the results:

1. **Repositories tagged with the topic**, most starred first (these give the "popular project" angle):
   ```
   gh search repos --topic <topic> --sort stars --limit 15 --archived=false --json fullName,stargazersCount
   ```
   Topics are lowercase with dashes: `cyber security` → `cybersecurity` and `security`, `llm` → `llm`, `machine learning` → `machine-learning`. Try the one or two likeliest spellings. Then run the base search with those repos as `--repo` flags.
2. **PRs that mention it**: the base search with the topic words as keywords and `--match title,body`.

Repository filters given by the user (`--repo`, `--owner`) narrow the topic search instead of being merged with it.

## 3. Clean up

- Merge and deduplicate by `url`.
- Drop bot authors (`author.type == "Bot"` or a login ending in `[bot]`): dependency bumps and automated PRs are not what the user wants to review. Keep them only if the user asked.
- Drop obvious noise: PRs to the author's own personal fork with thousands of comments, titles like `test`, `NEW`, `update`. Say how many you dropped.
- Re-sort the merged list by the requested order (`commentsCount` for popularity, `createdAt` for date), then cut to the requested size.
- If nothing is left, say so and suggest one broader search (fewer filters, another topic spelling).

## 4. Save the list

Write the final list to `~/.claude/pr-review-helper/last-search.json` (create the folder if needed), replacing the previous one:

```json
{
  "query": "<your one-line interpretation>",
  "searchedAt": "<ISO date>",
  "results": [
    { "index": 1, "repo": "owner/name", "number": 123, "title": "...", "url": "https://github.com/owner/name/pull/123", "author": "login", "createdAt": "...", "commentsCount": 4 }
  ]
}
```

## 5. Show it

A compact table, nothing else around it but one header line and the next step:

```
## Open PRs with no review · <interpretation> · <n> results

| # | Repository | PR | Author | Opened | 💬 |
| --: | --- | --- | --- | --- | --: |
| 1 | owner/name | [#123 Short title](url) | login | 3d ago | 4 |

**Next:** `/pr-review-helper:review <#>` to review one (add a focus: `/pr-review-helper:review 2 security`).
```

Ages relative to today (`3h`, `5d`, `2mo`). Titles truncated to about 60 characters. No commentary per PR unless the user asked.
