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
