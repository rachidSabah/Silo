---
Task ID: 1
Agent: main
Task: Fix "AI returned unexpected format" regression in Semantic Generation (Step 3)

Work Log:
- Analyzed the full data flow: Step3SemanticGen.tsx → API route → ai.ts generatePages() → AI provider → response parsing
- Identified root cause: AI responses can contain extra text around JSON, use different nesting patterns, or have inconsistent field names, and the existing parsing wasn't robust enough
- Server-side fixes (ai.ts):
  1. Added `cleanAIResponse()` function that robustly extracts JSON from AI text containing preamble/postamble text
  2. Uses brace/bracket depth tracking to find the first valid JSON object/array boundary
  3. Added `deepExtractPages()` recursive function as ultra-last-resort fallback that scans any nested structure for arrays containing objects with 'title' fields
  4. Updated `extractPagesBySilo()` to use `cleanAIResponse()` and add `deepExtractPages()` fallback
  5. Updated `generatePages()` fallback to handle nested page structures (pillar/cluster/blog sub-objects)
  6. Updated `extractArray()` and `parseJSON()` to use `cleanAIResponse()` for consistency
  7. Added detailed console.error logging throughout the parsing pipeline for future debugging
  8. Fixed regex `s` flag compatibility issue for broader ES target support
- Client-side fixes (Step3SemanticGen.tsx):
  1. Added `extractPage()` helper that handles all field name variations (meta_description, metaDescription, meta_desc)
  2. Added `inferType()` helper to infer page type from key names (pillar, cluster, blog, etc.)
  3. Restructured page extraction into clear cases: array of pages, nested objects with pages key, nested objects with pillar/cluster/blog sub-keys
  4. Added proper handling for single page objects (like pillar: {title, slug, ...}) alongside array values
  5. Added detailed console.error logging when extraction fails, including response preview

Stage Summary:
- Both server-side and client-side parsing are now significantly more robust
- The `cleanAIResponse()` function handles AI text that includes commentary before/after JSON
- The `deepExtractPages()` function provides a safety net for any deeply nested format
- Error messages now include debug info in the console to help diagnose future issues
- All lint checks pass

---
Task ID: 2
Agent: main
Task: Fix AI-generated pages not being relevant to keyword and niche

Work Log:
- Analyzed the AI prompts in `expandKeywords()`, `generateSilos()`, and `generatePages()` — all were too generic
- Root cause: Prompts didn't enforce niche-specific content, allowing the AI to generate generic pages
- Improved `expandKeywords()` prompt (ai.ts):
  1. Added niche-specific expertise framing
  2. Required all keywords to be directly relevant to the niche
  3. Added mix of informational, commercial, and transactional keyword types
  4. Required long-tail variations that include the niche name
  5. Explicitly prohibited generic keywords
- Improved `generateSilos()` prompt (ai.ts):
  1. Added 5 strict relevance rules for silo generation
  2. Required silos to be distinct sub-topics within the niche
  3. Required keywords to include niche name or close variants
  4. Added search intent requirements (commercial + informational mix)
  5. Required descriptive silo names (2-4 words)
- Improved `generatePages()` prompt (ai.ts):
  1. Added 7 critical relevance rules with niche name injected throughout
  2. Required every page title to directly mention the niche
  3. Required keywords to come from silo keyword list or contain niche term
  4. Banned generic titles like "Introduction to..." — provided niche-specific examples
  5. Added silo focus descriptions for each silo in the user message
  6. Added strong reinforcement in the user message about relevance
  7. Added `seedKeywords` parameter to include core niche keywords in the prompt
- Updated `generatePages()` signature to accept optional `seedKeywords` parameter
- Updated API route (route.ts) to pass `d.seedKeywords` to `generatePages()`
- Updated Step3SemanticGen.tsx to send `project.seedKeywords` in the API request body
- All lint checks pass

Stage Summary:
- All three AI prompts (expandKeywords, generateSilos, generatePages) now strongly enforce niche relevance
- The niche name is injected throughout the prompts to keep the AI focused
- Seed keywords are now passed from the project to the page generation for additional context
- Each prompt includes explicit rules and examples that prevent generic content generation
