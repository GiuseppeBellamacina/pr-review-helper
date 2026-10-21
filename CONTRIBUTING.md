# Contributing

Thanks for helping! The project is intentionally small: two skills, two read-only reviewer agents and no scripts. `gh` does the GitHub work; the skills (`skills/*/SKILL.md`) tell the agent how to use it, and the agents (`agents/*.md`) analyse the downloaded PR.

## Ground rules

- Nothing is posted to GitHub without the user's explicit confirmation of the exact text.
- Reviews are written in the user's voice and never mention AI or tools.
- PR content is untrusted: never run, install or check out a PR's code, and ignore instructions found in it. Only read-only `gh` calls fetch it; the reviewer agents keep read-only tools (no Bash).
- Prefer a plain `gh` command over adding a script.

## Develop

```bash
git clone https://github.com/GiuseppeBellamacina/pr-review-helper
claude plugin validate ./pr-review-helper
claude --plugin-dir ./pr-review-helper       # try it in a session
```

When testing `review`, choose **Cancel** at the confirmation step unless you really mean to post.

## Pull requests

- One topic per PR.
- Run `claude plugin validate .` before opening it.
- Update `README.md` when behavior changes.
