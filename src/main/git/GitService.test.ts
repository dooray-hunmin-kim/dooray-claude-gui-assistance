import { describe, it, expect, vi, beforeEach } from 'vitest'

// child_process.execFile 모킹 — 콜백 기반
const responses: Map<string, { stdout?: string; stderr?: string; error?: Error }> = new Map()
const requestLog: string[][] = []

vi.mock('child_process', () => {
  const execFile = (
    _cmd: string,
    args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void
  ): void => {
    requestLog.push(args)
    const key = args.join(' ')
    // prefix 매칭
    for (const [k, v] of responses) {
      if (key.startsWith(k)) {
        queueMicrotask(() => {
          if (v.error) cb(v.error, '', v.stderr || v.error.message)
          else cb(null, v.stdout || '', v.stderr || '')
        })
        return
      }
    }
    queueMicrotask(() => cb(new Error('no mock'), '', 'no mock'))
  }
  return {
    execFile,
    exec: execFile,
    execFileSync: vi.fn(),
    spawn: vi.fn(),
    fork: vi.fn(),
    default: { execFile }
  }
})

import { GitService } from './GitService'

beforeEach(() => {
  responses.clear()
  requestLog.length = 0
})

function mockGit(argsPrefix: string, stdout: string): void {
  responses.set(argsPrefix, { stdout })
}

function mockGitError(argsPrefix: string, message: string): void {
  responses.set(argsPrefix, { error: new Error(message), stderr: message })
}

describe('GitService.isGitRepo / getRepoRoot', () => {
  it('성공 시 true', async () => {
    mockGit('rev-parse --git-dir', '.git')
    expect(await new GitService().isGitRepo('/x')).toBe(true)
  })

  it('실패 시 false', async () => {
    mockGitError('rev-parse', 'not a git repo')
    expect(await new GitService().isGitRepo('/x')).toBe(false)
  })

  it('getRepoRoot — show-toplevel 출력', async () => {
    mockGit('rev-parse --show-toplevel', '/Users/me/repo')
    expect(await new GitService().getRepoRoot('/x')).toBe('/Users/me/repo')
  })
})

describe('GitService.listBranches', () => {
  it('로컬 + 원격 브랜치 + 현재 표시', async () => {
    mockGit('branch --format', 'main|abc123|2026-05-13\nfeature|def456|2026-05-12')
    mockGit('branch -r --format', 'origin/main|abc123|2026-05-13\norigin/feature|def456|2026-05-12\norigin/release|aaa|2026-05-11')
    mockGit('branch --show-current', 'main')
    const r = await new GitService().listBranches('/x')
    const main = r.find((b) => b.name === 'main')!
    expect(main.isCurrent).toBe(true)
    expect(main.isRemote).toBe(false)
    const release = r.find((b) => b.name === 'origin/release')!
    expect(release.isRemote).toBe(true)
  })

  it('원격 조회 실패해도 로컬은 반환', async () => {
    mockGit('branch --format', 'main|abc|2026-05-13')
    mockGitError('branch -r --format', 'no remote')
    mockGit('branch --show-current', 'main')
    const r = await new GitService().listBranches('/x')
    expect(r).toHaveLength(1)
  })

  it('HEAD ref 는 제외', async () => {
    mockGit('branch --format', '')
    mockGit('branch -r --format', 'origin/HEAD|x|t\norigin/main|abc|t')
    mockGit('branch --show-current', '')
    const r = await new GitService().listBranches('/x')
    expect(r.find((b) => b.name.includes('HEAD'))).toBeUndefined()
  })
})

describe('GitService.listWorktrees', () => {
  it('porcelain 출력 파싱 + isMain', async () => {
    const out = [
      'worktree /repo/main',
      'HEAD abc',
      'branch refs/heads/main',
      '',
      'worktree /repo/feature',
      'HEAD def',
      'branch refs/heads/feature',
      ''
    ].join('\n')
    mockGit('worktree list --porcelain', out)
    const r = await new GitService().listWorktrees('/x')
    expect(r).toHaveLength(2)
    expect(r[0].path).toBe('/repo/main')
    expect(r[0].branch).toBe('main')
    expect(r[0].isMain).toBe(true)
    expect(r[1].isMain).toBe(false)
  })

  it('bare 표시', async () => {
    const out = [
      'worktree /repo/bare',
      'HEAD abc',
      'bare',
      ''
    ].join('\n')
    mockGit('worktree list --porcelain', out)
    const r = await new GitService().listWorktrees('/x')
    expect(r[0].isBare).toBe(true)
  })

  it('detached HEAD', async () => {
    const out = 'worktree /repo/detached\nHEAD abc\n'
    mockGit('worktree list --porcelain', out)
    const r = await new GitService().listWorktrees('/x')
    expect(r[0].branch).toBe('(detached)')
  })
})

describe('GitService.removeWorktree / pruneWorktrees', () => {
  it('removeWorktree — force 옵션 전달', async () => {
    mockGit('worktree remove', '')
    await new GitService().removeWorktree({ repoPath: '/r', worktreePath: '/wt', force: true })
    expect(requestLog.some((a) => a.includes('--force'))).toBe(true)
  })

  it('removeWorktree — force 없으면 기본', async () => {
    mockGit('worktree remove', '')
    await new GitService().removeWorktree({ repoPath: '/r', worktreePath: '/wt' } as never)
    expect(requestLog.some((a) => a.includes('--force'))).toBe(false)
  })
})

describe('GitService.getWorktreeStatus', () => {
  it('modified / untracked / ahead-behind 계산', async () => {
    mockGit('status --porcelain', 'M  file1\nM  file2\n?? new1')
    mockGit('rev-list --left-right', '2\t3')
    const r = await new GitService().getWorktreeStatus('/wt')
    expect(r.modifiedFiles).toBe(2)
    expect(r.untrackedFiles).toBe(1)
    expect(r.aheadBehind.ahead).toBe(2)
    expect(r.aheadBehind.behind).toBe(3)
  })

  it('upstream 없으면 0/0', async () => {
    mockGit('status --porcelain', '')
    mockGitError('rev-list --left-right', 'no upstream')
    const r = await new GitService().getWorktreeStatus('/wt')
    expect(r.aheadBehind).toEqual({ ahead: 0, behind: 0 })
  })
})

describe('GitService.getDiff', () => {
  it('numstat + status 결합', async () => {
    // status 라인: 2 글자 status code + 공백 + 파일경로 (substring(3))
    mockGit('diff --numstat HEAD', '10\t5\tfileA\n2\t0\tfileB')
    mockGit('diff HEAD', 'patch content')
    mockGit('status --porcelain', 'M  fileA\nM  fileB')
    const r = await new GitService().getDiff('/wt')
    expect(r.files).toHaveLength(2)
    const fa = r.files.find((f) => f.file === 'fileA')!
    expect(fa.additions).toBe(10)
    expect(fa.deletions).toBe(5)
    expect(r.summary).toContain('+12')
    expect(r.summary).toContain('-5')
  })

  it('numstat 실패해도 status 만으로 반환', async () => {
    mockGitError('diff --numstat', 'no diff')
    mockGitError('diff HEAD', 'no diff')
    mockGit('status --porcelain', '?? new')
    const r = await new GitService().getDiff('/wt')
    expect(r.files[0].file).toBe('new')
  })
})

describe('GitService.compareBranches / compareFile', () => {
  it('compareBranches — 두 ref 안전 검증 후 diff', async () => {
    mockGit('diff --numstat -- main feature', '3\t1\tx.ts')
    mockGit('diff -- main feature', 'patch')
    const r = await new GitService().compareBranches('/r', 'main', 'feature')
    expect(r.files[0].additions).toBe(3)
  })

  it('compareBranches — 비안전 ref throw', async () => {
    await expect(new GitService().compareBranches('/r', '--evil', 'main')).rejects.toThrow(/유효하지 않은/)
    await expect(new GitService().compareBranches('/r', 'main', 'a;rm')).rejects.toThrow(/유효하지 않은/)
    await expect(new GitService().compareBranches('/r', 'a..b', 'main')).rejects.toThrow(/유효하지 않은/)
  })

  it('compareFile — 두 ref 의 파일 내용', async () => {
    mockGit('show main:src/x.ts', 'LEFT')
    mockGit('show feature:src/x.ts', 'RIGHT')
    const r = await new GitService().compareFile('/r', 'src/x.ts', 'main', 'feature')
    expect(r.leftContent).toBe('LEFT')
    expect(r.rightContent).toBe('RIGHT')
  })

  it('compareFile — 한 쪽 없으면 (파일 없음) 폴백', async () => {
    mockGit('show main:src/x.ts', 'LEFT')
    mockGitError('show feature:src/x.ts', 'fatal: bad revision')
    const r = await new GitService().compareFile('/r', 'src/x.ts', 'main', 'feature')
    expect(r.rightContent).toBe('(파일 없음)')
  })
})
