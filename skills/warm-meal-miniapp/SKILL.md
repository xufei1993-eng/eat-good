---
name: warm-meal-miniapp
description: Implement or review product behavior, nutrition logic, health-profile flows, meal recommendations, meal recording, and related UI copy in the Warm Morning WeChat mini program. Use for changes where dietary estimates, pregnancy or chronic-condition safeguards, privacy, local fallbacks, or the product's action-first design affect implementation decisions.
---

# Warm Meal Mini Program

Preserve the product as a practical meal-planning MVP for pregnancy, fat-loss, and general-health users. Work from the current code and documented rules; do not invent clinical claims or silently expand the product into diagnosis or treatment.

## Load only relevant references

- For energy targets, profile calculations, recommendation ranking, pregnancy safeguards, allergens, or health disclaimers, read [`../../docs/NUTRITION_BASIS.md`](../../docs/NUTRITION_BASIS.md).
- For layout, copy, components, or visual changes, read [`../../docs/PRODUCT_DESIGN_PRINCIPLES.md`](../../docs/PRODUCT_DESIGN_PRINCIPLES.md).
- For setup, cloud-function behavior, feature boundaries, and local fallbacks, read [`../../README.md`](../../README.md).

## Product invariants

- Present calories, nutrients, portions, prices, and vision results as estimates. Let authoritative package labels or measured values override estimates.
- Require user confirmation before an image-analysis result becomes a meal record, and keep the editable/manual path available when recognition or cloud services fail.
- Apply pregnancy-risk and allergen hard filters before nutrition scoring. A higher score must never override a safety exclusion.
- Health guidance must not diagnose, prescribe treatment, or imply that it replaces a clinician or registered dietitian. Preserve escalation copy for pregnancy complications, chronic disease, minors, and users with an existing professional plan.
- Keep API credentials and privileged cloud operations server-side. Store only the minimum client data needed for the feature and preserve the app's privacy checks.
- Preserve deterministic local meal generation and offline/local operation unless the user explicitly requests a data-source change.

## Change discipline

- Keep calculations and safety rules in reusable logic rather than duplicating them in page handlers or display templates.
- When changing a calculation or safety rule, update its documentation and focused tests in the same task.
- When changing UI, keep the primary action and current state prominent; remove copy, components, and decoration that do not help the user decide or act.
- External mutations such as deployment, publishing, database writes, account configuration, or sending subscription messages require explicit user authorization. Prepare local code and configuration changes first when that work is already in scope.

## Completion

Run the smallest meaningful checks for the affected behavior. For cloud functions, use their local tests when present; for mini-program UI, distinguish static inspection from actual WeChat DevTools or device validation. Summarize behavioral changes, verification, and remaining environment-dependent checks without repeating the full implementation.
