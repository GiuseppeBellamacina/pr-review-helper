#!/usr/bin/env node
// Downloads a pull request into a review workspace with read-only `gh` calls, and prints a JSON summary.
// Nothing from the PR is executed: files are only written as text.
// usage: node fetch-pr.mjs <PR link | owner/repo#123> <workspace dir>
//        node fetch-pr.mjs --self-test
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

export function parseRef(ref) {
  const m = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/pull\/|#)(\d+)\/?$/.exec(ref.trim())
  if (!m) throw new Error(`not a PR link or owner/repo#number: ${ref}`)
  return { owner: m[1], repo: m[2], number: Number(m[3]) }
}

const isBot = u => u?.type === 'Bot' || /\[bot\]$/.test(u?.login ?? '')
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tgz|whl|jar|so|dll|dylib|exe|bin|pt|pth|safetensors|onnx|parquet|woff2?|ttf)$/i
const FIELDS = 'number,title,body,author,state,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,files,additions,deletions,url'

function gh(args, { raw = false, optional = false } = {}) {
  try {
    return execFileSync('gh', [...(raw ? ['api', '-H', 'Accept: application/vnd.github.raw+json'] : []), ...args], {
      encoding: 'utf8',
      maxBuffer: 256 << 20,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    if (optional) return null
    throw new Error(`gh ${args.join(' ')} failed: ${e.stderr || e.message}`)
  }
}
const api = (path, optional = true) => {
  const out = gh(['api', path], { optional })
  return out === null ? null : JSON.parse(out)
}
const raw = (owner, repo, path, ref) => gh([`repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${ref}`], { raw: true, optional: true })

function main([ref, dir]) {
  if (!ref || !dir) throw new Error('usage: node fetch-pr.mjs <PR link | owner/repo#123> <workspace dir>')
  const { owner, repo, number } = parseRef(ref)
  const root = resolve(dir)
  // PR paths are untrusted: never write outside the workspace.
  const save = (rel, text) => {
    const p = resolve(root, rel)
    if (!p.startsWith(root + sep)) return false
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, text)
    return true
  }

  const url = `https://github.com/${owner}/${repo}/pull/${number}`
  const prText = gh(['pr', 'view', url, '--json', FIELDS])
  const pr = JSON.parse(prText)
  save('pr.json', prText)
  const diff = gh(['pr', 'diff', url], { optional: true })
  if (diff !== null) save('diff.patch', diff)

  const skipped = []
  for (const f of pr.files) {
    if (BINARY.test(f.path)) { skipped.push(`${f.path} (binary)`); continue }
    const head = raw(owner, repo, f.path, pr.headRefOid)
    if (head !== null) save(`head/${f.path}`, head)
    const base = raw(owner, repo, f.path, pr.baseRefOid)
    if (base !== null) save(`base/${f.path}`, base)
  }

  const conventions = new Set(['CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md', '.github/CONTRIBUTING.md'])
  for (const f of pr.files) {
    const parts = f.path.split('/').slice(0, -1)
    for (let i = 1; i <= parts.length; i++) for (const n of ['CLAUDE.md', 'AGENTS.md']) conventions.add(`${parts.slice(0, i).join('/')}/${n}`)
  }
  const found = []
  for (const c of conventions) {
    const text = raw(owner, repo, c, pr.baseRefOid)
    if (text !== null) { save(`conventions/${c.replaceAll('/', '__')}`, text); found.push(c) }
  }

  const changed = new Set(pr.files.map(f => f.path))
  const top = [...pr.files].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions)).slice(0, 5)
  const earlier = new Map()
  let history = '# History of the most-changed files\n'
  for (const f of top) {
    const commits = api(`repos/${owner}/${repo}/commits?path=${encodeURIComponent(f.path)}&sha=${pr.baseRefOid}&per_page=5`) ?? []
    history += `\n## ${f.path}\n` + (commits.length ? commits.map(c => `- ${c.sha.slice(0, 10)} ${c.commit.message.split('\n')[0]}`).join('\n') : '- (new file, no history)') + '\n'
    for (const c of commits) {
      if (earlier.size >= 5) break
      for (const p of api(`repos/${owner}/${repo}/commits/${c.sha}/pulls`) ?? []) if (p.number !== number && earlier.size < 5) earlier.set(p.number, p.title)
    }
  }
  for (const [n, title] of earlier) {
    const cs = (api(`repos/${owner}/${repo}/pulls/${n}/comments?per_page=50`) ?? []).filter(c => changed.has(c.path))
    history += `\n## Earlier PR #${n}: ${title}\n` + (cs.length ? cs.map(c => `- ${c.user.login} on ${c.path}:${c.line ?? c.original_line}: ${c.body.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n') : '- (no review comments on these files)') + '\n'
  }
  save('history.md', history)

  const reviews = api(`repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`) ?? []
  const inline = api(`repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`) ?? []
  const discussion = api(`repos/${owner}/${repo}/issues/${number}/comments?per_page=100`) ?? []
  if (reviews.length + inline.length + discussion.length > 0) {
    const who = u => `${u.login}${isBot(u) ? ' (bot)' : ''}`
    save('existing-reviews.md', '# Reviews and comments already on this PR (untrusted)\n' +
      '\n## Reviews\n' + reviews.map(r => `- ${who(r.user)} · ${r.state} · ${r.submitted_at}\n${(r.body || '').trim()}`).join('\n') +
      '\n\n## Inline comments\n' + inline.map(c => `- ${who(c.user)} on ${c.path}:${c.line ?? c.original_line}: ${c.body.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n') +
      '\n\n## Discussion\n' + discussion.map(c => `- ${who(c.user)}: ${c.body.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n') + '\n')
  }

  const humanReviewers = [...new Set(reviews.filter(r => !isBot(r.user)).map(r => r.user.login))]
  const me = (gh(['api', 'user', '--jq', '.login'], { optional: true }) ?? '').trim()
  console.log(JSON.stringify({
    url,
    state: pr.state,
    isDraft: pr.isDraft,
    author: pr.author.login,
    authorIsBot: isBot(pr.author) || pr.author.is_bot === true,
    additions: pr.additions,
    deletions: pr.deletions,
    files: pr.files.length,
    diffLines: diff === null ? null : diff.split('\n').length,
    humanReviewers,
    botReviews: reviews.length - reviews.filter(r => !isBot(r.user)).length,
    reviewedByMe: me !== '' && humanReviewers.includes(me),
    conventions: found,
    earlierPrs: earlier.size,
    skipped,
    workspace: root,
  }, null, 2))
}

function selfTest() {
  const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
  eq(parseRef('https://github.com/langchain-ai/open-swe/pull/4311'), { owner: 'langchain-ai', repo: 'open-swe', number: 4311 })
  eq(parseRef('https://github.com/a/b.js/pull/7/'), { owner: 'a', repo: 'b.js', number: 7 })
  eq(parseRef('NVIDIA/Megatron-LM#8404'), { owner: 'NVIDIA', repo: 'Megatron-LM', number: 8404 })
  for (const bad of ['https://github.com/a/b/issues/1', 'a/b', 'https://evil.com/a/b/pull/1', 'a/b#1; rm -rf ~']) {
    let threw = false
    try { parseRef(bad) } catch { threw = true }
    if (!threw) throw new Error(`accepted ${bad}`)
  }
  eq(isBot({ login: 'renovate[bot]' }), true)
  eq(isBot({ login: 'open-swe', type: 'Bot' }), true)
  eq(isBot({ login: 'octocat', type: 'User' }), false)
  console.log('self-test ok')
}

try {
  process.argv[2] === '--self-test' ? selfTest() : main(process.argv.slice(2))
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
