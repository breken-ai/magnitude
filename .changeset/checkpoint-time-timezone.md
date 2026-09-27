---
"@magnitudedev/cli": patch
---

Resolve the HH:MM:SS turn time given to `checkpoint_changes` and `checkpoint_rollback` in the session timezone, so outside UTC a rollback no longer undoes earlier turns (west of UTC) or nothing at all (east of UTC).
