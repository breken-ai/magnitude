import { describe, test, expect } from "vitest"
import { Effect, Option } from "effect"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createJustGitBackend, realFs } from "../src/backends/just-git"
import { buildShadowVcs } from "../src/layer"
import { ShadowVcs } from "../src/service"
import { checkpointChangesTool, checkpointRollbackTool } from "../src/tools"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** HH:MM:SS as the --- turn separators render it in the session timezone. */
function separatorTime(when: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(when)
}

/**
 * Three turn boundaries one second apart:
 *   t0: a=A1 b=B1   t1: a=A1 b=B2   t2: a=A2 b=B2
 * Returns the HH:MM:SS of t1 in the session timezone.
 */
async function setup(timezone: string) {
  const tmpDir = await fs.mkdtemp("/tmp/repro-checkpoint-tz-")
  await fs.writeFile(path.join(tmpDir, "a.txt"), "A1\n")
  await fs.writeFile(path.join(tmpDir, "b.txt"), "B1\n")

  const gitDirPath = path.join(tmpDir, ".shadow", ".git")
  await fs.mkdir(gitDirPath, { recursive: true })
  const backend = await createJustGitBackend(tmpDir, gitDirPath, realFs)
  const vcs = await buildShadowVcs(backend, tmpDir, timezone)

  await Effect.runPromise(vcs.record())
  await sleep(1100)
  await fs.writeFile(path.join(tmpDir, "b.txt"), "B2\n")
  const t1 = await Effect.runPromise(vcs.record())
  const t1Checkpoint = await Effect.runPromise(vcs.getCheckpoint(t1))
  await sleep(1100)
  await fs.writeFile(path.join(tmpDir, "a.txt"), "A2\n")
  await Effect.runPromise(vcs.record())

  return { tmpDir, vcs, since: separatorTime(t1Checkpoint.timestamp, timezone) }
}

describe("checkpoint tools resolve --- separator times in the session timezone", () => {
  for (const timezone of ["America/Los_Angeles", "Asia/Kolkata"]) {
    test(`checkpoint_changes since a turn boundary (${timezone})`, async () => {
      const { vcs, since } = await setup(timezone)
      const result = await Effect.runPromise(
        checkpointChangesTool
          .execute({ since, glob: Option.none() }, {} as never)
          .pipe(Effect.provideService(ShadowVcs, vcs)),
      )
      expect(result.files).toEqual([{ path: "a.txt", status: "modified" }])
    })

    test(`checkpoint_rollback since a turn boundary only undoes later turns (${timezone})`, async () => {
      const { tmpDir, vcs, since } = await setup(timezone)
      await Effect.runPromise(
        checkpointRollbackTool
          .execute({ since, glob: "*.txt" }, {} as never)
          .pipe(Effect.provideService(ShadowVcs, vcs)),
      )
      expect(await fs.readFile(path.join(tmpDir, "a.txt"), "utf8")).toBe("A1\n")
      expect(await fs.readFile(path.join(tmpDir, "b.txt"), "utf8")).toBe("B2\n")
    })
  }
})
