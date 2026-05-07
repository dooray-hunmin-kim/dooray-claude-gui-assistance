import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises'
import { existsSync, statSync, lstatSync } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'
import { dialog } from 'electron'
import type { Skill, SkillSaveRequest } from '../../shared/types/skills'

export class SkillsManager {
  // Claude Code stores skills in ~/.claude/skills/{name}/SKILL.md
  private skillsDir: string

  constructor() {
    this.skillsDir = join(homedir(), '.claude', 'skills')
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.skillsDir)) {
      await mkdir(this.skillsDir, { recursive: true })
    }
  }

  async list(): Promise<Skill[]> {
    await this.ensureDir()
    const entries = await readdir(this.skillsDir)

    const skills: Skill[] = []
    for (const entry of entries) {
      const entryPath = join(this.skillsDir, entry)
      try {
        const stat = lstatSync(entryPath)
        // Each skill is a directory (or symlink to dir) containing SKILL.md
        if (stat.isDirectory() || stat.isSymbolicLink()) {
          const skillFile = join(entryPath, 'SKILL.md')
          if (existsSync(skillFile)) {
            const content = await readFile(skillFile, 'utf-8')
            const fileStat = statSync(skillFile)
            skills.push({
              name: entry,
              filename: entry,
              content,
              updatedAt: fileStat.mtimeMs
            })
          }
        }
      } catch {
        // skip unreadable entries
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  }

  async read(filename: string): Promise<string> {
    const skillFile = join(this.skillsDir, filename, 'SKILL.md')
    return readFile(skillFile, 'utf-8')
  }

  async save(req: SkillSaveRequest): Promise<void> {
    const skillDir = join(this.skillsDir, req.filename)
    if (!existsSync(skillDir)) {
      await mkdir(skillDir, { recursive: true })
    }
    const skillFile = join(skillDir, 'SKILL.md')
    await writeFile(skillFile, req.content, 'utf-8')
  }

  async delete(filename: string): Promise<void> {
    const skillFile = join(this.skillsDir, filename, 'SKILL.md')
    if (existsSync(skillFile)) {
      await unlink(skillFile)
    }
  }

  /** 다중 삭제 — 실패는 항목별로 무시(베스트 에포트). 삭제 성공 갯수 반환. */
  async deleteMany(filenames: string[]): Promise<{ deleted: number }> {
    let deleted = 0
    for (const filename of filenames) {
      try { await this.delete(filename); deleted++ } catch { /* skip */ }
    }
    return { deleted }
  }

  /** 사용자가 선택한 .md 파일들을 임포트. 파일명 기준으로 디렉토리를 만들어 SKILL.md 로 저장. */
  async importFromFiles(): Promise<{ imported: number; cancelled: boolean }> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: '스킬 가져오기 (.md 파일 다중 선택)',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, cancelled: true }
    }
    let imported = 0
    for (const path of result.filePaths) {
      try {
        const content = await readFile(path, 'utf-8')
        // 디렉토리 이름은 파일명에서 확장자만 제거. SKILL.md 로 저장.
        const base = basename(path).replace(/\.(md|markdown)$/i, '')
        await this.save({ filename: base, content })
        imported++
      } catch { /* skip unreadable */ }
    }
    return { imported, cancelled: false }
  }

  /** 지정한 스킬들을 사용자 선택 폴더에 .md 로 내보냄. 디렉토리/SKILL.md 가 아닌 평탄한 형태. */
  async exportToFolder(filenames: string[]): Promise<{ exported: number; cancelled: boolean; folder?: string }> {
    if (filenames.length === 0) return { exported: 0, cancelled: true }
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '스킬 내보낼 폴더 선택'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { exported: 0, cancelled: true }
    }
    const folder = result.filePaths[0]
    let exported = 0
    for (const filename of filenames) {
      try {
        const content = await this.read(filename)
        await writeFile(join(folder, `${filename}.md`), content, 'utf-8')
        exported++
      } catch { /* skip */ }
    }
    return { exported, cancelled: false, folder }
  }
}
