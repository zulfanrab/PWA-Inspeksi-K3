# Workspace Custom Rules - Aksara Inspect K3

These rules define project-specific patterns, constraints, and architecture guidelines for the Aksara Inspect K3 codebase.

## 1. Document Template Management
- **Direct Uploads Only:** Always upload document templates (.docx) directly from the client browser to the Google Drive API using multipart upload. Never route file uploads through Vercel serverless APIs to prevent hitting Vercel's 4.5MB request payload size limit (HTTP 413).
- **Manual Report Numbering:** Do not use automatic server-side sequence counters for allocating report numbers. Instead, provide a manual input field in the UI for the user to specify the report number to prevent optimistic locking failures on serverless environments.

## 2. Penyalur Petir (Lightning Protection) Report Patterns
- **Multi-Point Grounding Measurements:** For grounding resistance test values, accept comma-separated inputs in the form (e.g., `1.39, 2.10`).
  - In `ReportWizard.tsx`, split the values to build a `{ groundingPoints: [{ no, value }] }` array for Word template rendering (`{#groundingPoints}`).
  - In `ValidationEngine.ts`, split the values and validate that *every* measurement satisfies the range limit.
  - In `formulas.ts`, parse the list and use the maximum value (`Math.max`) to determine the overall safety status.
- **Split Checklist Loop Logic:**
  - Table 1 (Main Checklist): Loops over `{#components}` in the Word template (excludes the `hubungan_antar_bagian` category).
  - Table 2 (Continuity/Joint Connections): Loops over `{#continuity}` in the Word template (contains items from `hubungan_antar_bagian`).
  - The split is handled inside `ReportWizard.tsx` before assembling the final report payload.
