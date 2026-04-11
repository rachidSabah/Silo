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

---
Task ID: 3
Agent: main
Task: Fix article content styling (white bg, transparent text) and add download options

Work Log:
- Identified root cause: Article content rendered inside `bg-white prose prose-slate` container, but @tailwindcss/typography plugin is NOT installed, so `prose` classes don't work, causing text to be invisible/transparent on white background
- Added comprehensive `.article-content` CSS class in globals.css with full dark-mode styling for all HTML elements (h1-h4, p, ul, ol, li, a, strong, blockquote, code, pre, table, img, hr, figure, figcaption)
- Changed article content container from `bg-white prose prose-slate` to `article-content bg-slate-900 border border-slate-700` for dark theme consistency
- Enhanced `handleExportArticle` to support both HTML and Markdown formats:
  - HTML exports now include embedded dark-mode CSS styles for standalone viewing
  - Added `htmlToMarkdown()` function for HTML-to-Markdown conversion
- Added `handleDownloadAllPages` function for bulk download (HTML or Markdown)
- Added download UI elements:
  - Article detail view: dropdown with "Download as HTML" and "Download as Markdown" options
  - Articles tab list: "Download All Pages" dropdown button with HTML/Markdown options
  - Individual article cards: quick download icon button
  - Step3SemanticGen: "Download CSV" button for page structure export
- Updated Step3SemanticGen to import Download and FileText icons
- All lint checks pass

Stage Summary:
- Article content is now properly styled with dark-mode colors (slate-900 background, light text)
- Download options available in both HTML and Markdown formats
- Bulk download combines all articles into one file
- Step3 page structure can be downloaded as CSV
- All exports include proper styling for offline reading
---
Task ID: 1
Agent: Main Agent
Task: Upgrade AI generation pipeline with SEO_MASTER_PROMPT and improved payload construction

Work Log:
- Read and analyzed the complete ai.ts (1135 lines), API route handler, ArticleGenerator.tsx, and globals.css
- Created SEO_MASTER_PROMPT constant with HCU compliance, E-E-A-T, semantic density, strict silo/internal linking rules, and formatting rules
- Added new SiloContext fields: searchIntent (optional) and suggestedAnchor (optional)
- Rewrote generateSiloAwareArticle() with:
  - Strict system/user message separation (SEO_MASTER_PROMPT as system, dynamic data as user)
  - Page type → content strategy mapping (pillar/cluster/blog/category/landing)
  - Safe defaults for all optional fields (keywords, searchIntent, brandVoice, niche)
  - Anti-cannibalization context with explicit forbidden topics list
  - Explicit internal link formatting instructions with exact HTML format
  - Required pillar page link placement (within first 30% of article)
  - Improved JSON parsing with double-fallback strategy
- Updated bulkGenerateSiloArticles() to pass suggestedAnchor and searchIntent
- Updated API route /api/ai/generate-article with safe SiloContext construction (null/empty fallbacks)
- Updated API route /api/ai/bulk-generate with safe context construction
- Updated ArticleGenerator.tsx client to pass searchIntent (auto-detected from keyword pattern) and suggestedAnchor
- Increased Claude max_tokens from 4096 to 8192 for longer article generation
- Verified: lint passes clean, no new TypeScript errors introduced, dev server running

Stage Summary:
- SEO_MASTER_PROMPT governs all AI article generation across all providers
- Messages array strictly separates system prompt from user data
- All optional data (siblingPages, suggestedAnchor, searchIntent) handled with safe fallbacks
- Multi-provider logic (OpenAI/Gemini/Claude/DeepSeek) untouched — only messages array content changed
