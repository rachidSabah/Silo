---
Task ID: 1
Agent: main
Task: Fix white background/transparent text styling bug and verify SEO_MASTER_PROMPT implementation

Work Log:
- Reviewed all code files: src/lib/ai.ts, src/app/api/[[...slug]]/route.ts, src/components/seo/ArticleGenerator.tsx, src/components/seo/Step3SemanticGen.tsx, src/app/globals.css, src/lib/utils.ts
- Confirmed SEO_MASTER_PROMPT constant was already implemented (lines 852-874 of ai.ts)
- Confirmed structured messages array with system/user role separation was already implemented
- Confirmed safe fallbacks for optional data (siblingPages, suggested_anchor, pillar_name) were already implemented
- Confirmed download feature was already implemented (handleExportArticle, handleDownloadAllPages)
- Identified root cause of white background/transparent text bug: AI-generated HTML contains inline style attributes that override dark-mode CSS
- Fixed by updating sanitizeHTML() in src/lib/utils.ts to strip inline style attributes
- Fixed by adding !important to critical color rules in .article-content CSS (h1, h2, h3, h4, p, ul, ol, strong, a, td)
- Fixed by adding explicit background-color: #0f172a !important to .article-content base class
- Added catch-all CSS rule for AI-generated HTML elements without specific rules (span, div, section, etc.)

Stage Summary:
- All 6 tasks completed
- SEO_MASTER_PROMPT: Already implemented with HCU, E-E-A-T, silo rules, formatting rules
- Structured messages: Already implemented with [{role: "system", content: SEO_MASTER_PROMPT}, {role: "user", content: dynamicPayload}]
- Safe fallbacks: Already implemented in generateSiloAwareArticle()
- Download: Already implemented with HTML and Markdown export options
- Styling bug: Fixed by stripping inline styles and adding !important CSS overrides
