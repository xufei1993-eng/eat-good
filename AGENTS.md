# Project Instructions

## Scope and priority

- Apply these instructions to the whole repository.
- The user's explicit request takes precedence over repository skills and conventions. Preserve the requested scope and do not turn guidance into additional work.
- For product behavior, nutrition calculations, meal recommendations, health profiles, meal-image analysis, or user-facing health copy, read and follow [`skills/warm-meal-miniapp/SKILL.md`](skills/warm-meal-miniapp/SKILL.md).

## Working approach

- Infer routine implementation details from the code and existing product documentation. Ask only when a missing choice would materially change the outcome or authorize an external or irreversible action.
- Complete requested changes and proportionate verification. Do not stop after proposing a plan when the request authorizes implementation.
- Keep changes local to the requested behavior. Preserve unrelated working-tree changes and existing local-first fallbacks.
- Use concise, direct language in user-facing explanations. Prefer short paragraphs; use lists only when they improve comparison or sequence.

## Authorization boundaries

- Read-only inspection and reversible repository edits within the user's request are authorized.
- Do not deploy cloud functions, publish the mini program, alter production data, create paid resources, send messages, or change third-party account settings without explicit user authorization.
- Never place API keys, OpenIDs, health profiles, or other personal data in source, logs, fixtures, screenshots, or client-visible configuration.
- Treat destructive data operations, schema migrations, dependency upgrades, and changes to authentication or privacy behavior as separate scope unless the user explicitly requests them or they are strictly required for the requested fix. If required, explain the smallest necessary expansion before taking the action.

## Verification

- Match verification to risk. Run focused checks for the changed module first; broaden only when failures, shared contracts, or unresolved risk justify it.
- Do not add tests that merely repeat a low-impact implementation. Add or update tests for nutrition calculations, safety filters, quotas, authentication boundaries, persistence, and other behavior where regression would affect user data or health guidance.
- Report what was verified and any checks that could not be run. Do not claim simulator, cloud, or device validation unless it was actually performed.
