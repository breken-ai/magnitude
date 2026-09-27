import { describe, test, expect } from "vitest"
import { Effect } from "effect"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createJustGitBackend, realFs } from "../src/backends/just-git"
import { buildShadowVcs } from "../src/layer"

describe("diffWorking against an earlier checkpoint with a dirty worktree", () => {
  test("includes files changed between the checkpoint and HEAD", async () => {
    const tmpDir = await fs.mkdtemp("/tmp/repro-diffworking-earlier-")
    await fs.writeFile(path.join(tmpDir, "a.txt"), "A1\n")
    await fs.writeFile(path.join(tmpDir, "b.txt"), "B1\n")

    const gitDirPath = path.join(tmpDir, ".shadow", ".git")
    await fs.mkdir(gitDirPath, { recursive: true })
    const backend = await createJustGitBackend(tmpDir, gitDirPath, realFs)
    const vcs = await buildShadowVcs(backend, tmpDir, "UTC")

    // turn 1 starts
    const turn1Start = await Effect.runPromise(vcs.record())
    // turn 1 edits a.txt and ends
    await fs.writeFile(path.join(tmpDir, "a.txt"), "A2\n")
    await Effect.runPromise(vcs.record())
    // turn 2 edits b.txt (not yet recorded)
    await fs.writeFile(path.join(tmpDir, "b.txt"), "B2\n")

    const diff = await Effect.runPromise(vcs.diffWorking({ against: turn1Start }))
    expect(diff.files.map((f) => f.path).sort()).toEqual(["a.txt", "b.txt"])
  })

  test("reports a file created after the checkpoint as added, even if edited again since HEAD", async () => {
    const tmpDir = await fs.mkdtemp("/tmp/repro-diffworking-earlier-")
    await fs.writeFile(path.join(tmpDir, "a.txt"), "A1\n")

    const gitDirPath = path.join(tmpDir, ".shadow", ".git")
    await fs.mkdir(gitDirPath, { recursive: true })
    const backend = await createJustGitBackend(tmpDir, gitDirPath, realFs)
    const vcs = await buildShadowVcs(backend, tmpDir, "UTC")

    const turn1Start = await Effect.runPromise(vcs.record())
    await fs.writeFile(path.join(tmpDir, "new.txt"), "N1\n")
    await Effect.runPromise(vcs.record())
    await fs.writeFile(path.join(tmpDir, "new.txt"), "N2\n")

    const diff = await Effect.runPromise(vcs.diffWorking({ against: turn1Start }))
    expect(diff.files.map((f) => [f.path, f.status])).toEqual([["new.txt", "added"]])
    expect(diff.additions).toBe(1)
    expect(diff.modifications).toBe(0)
  })
})
