import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function GET() {
  return NextResponse.json({
    name: "SiloForge API",
    version: "1.0.0",
    endpoints: {
      projects: "/api/projects",
      silos: "/api/silos",
      pages: "/api/pages",
      ai: {
        expandKeywords: "/api/ai/expand-keywords",
        generateSilos: "/api/ai/generate-silos",
        generatePages: "/api/ai/generate-pages",
        internalLinks: "/api/ai/internal-links",
      },
      csv: {
        import: "/api/import-csv",
        export: "/api/export-csv",
      },
    },
  });
}
