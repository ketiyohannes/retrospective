---
name: retrospective
description: Review completed Codex work and preserve concise, reusable lessons in the local retrospective knowledge base. Use after a work session, when an automatic retrospective continuation requests it, or when the user asks what worked, failed, became stuck, or changed.
---

# Run A Retrospective

1. Call `get_retrospective_context`. Pass the session id when the continuation prompt provides one; otherwise omit it to review the latest completed session.
2. Inspect tool inputs, outputs, and outcomes together with related active knowledge. Base every conclusion on observable evidence. Do not infer, request, expose, or store hidden chain-of-thought.
3. Extract only concise lessons that are likely to help a future tool call:
   - what reliably worked
   - what failed and the observable reason
   - where progress became stuck
   - a better workflow or decision rule
   - an explicit strategy or assumption that changed
4. Choose the narrowest valid scope:
   - `session:<id>` for one-off context
   - `project:<absolute path>` for repository-specific workflow
   - `global` only for broadly reusable behavior
5. Compare each lesson with related knowledge and choose exactly one lifecycle action:
   - `add` when the lesson is new
   - `keep` when an existing active record remains accurate
   - `replace` when an active record in the same scope is stale
   - `retire` when an active record is no longer useful and has no replacement
6. A narrower project or session exception does not replace broader knowledge. Add the override in the narrower scope.
7. Call `apply_retrospective` once with all changes. Call it with an empty `changes` array when no durable lesson exists so processed events are still cleared.

Keep cues short and searchable. Write content as a direct instruction or fact that can be applied without rereading the original session.
