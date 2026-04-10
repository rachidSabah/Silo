import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      return NextResponse.json({ error: 'Only CSV files are accepted' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 });
    }

    const text = await file.text();

    if (!text.trim()) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 });
    }

    return new Promise<NextResponse>((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_'),
        complete: (results) => {
          const validRows: Record<string, string>[] = [];
          const errors: string[] = [];

          if (results.errors && results.errors.length > 0) {
            const parseErrors = results.errors.slice(0, 3).map((e) => `Row ${e.row}: ${e.message}`);
            if (parseErrors.length > 0) {
              // Still try to process valid rows
            }
          }

          (results.data as Record<string, string>[]).forEach((row, index) => {
            // Support multiple header formats
            const slug = row.slug || row.Slug || '';
            const title = row.title || row.Title || '';

            if (!title) {
              errors.push(`Row ${index + 2}: Missing title`);
              return;
            }

            // Auto-generate slug from title if missing
            const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

            if (!finalSlug) {
              errors.push(`Row ${index + 2}: Could not generate slug`);
              return;
            }

            validRows.push({
              slug: finalSlug,
              title,
              meta_description: row.meta_description || row.meta || row['meta_description'] || '',
              keywords: row.keywords || row.Keywords || '',
              type: row.type || row.Type || 'blog',
              parent: row.parent || row.Parent || row.parent_silo || row['parent_silo'] || '',
            });
          });

          resolve(
            NextResponse.json({
              rows: validRows,
              errors,
              total: results.data.length,
              valid: validRows.length,
            })
          );
        },
        error: (error) => {
          resolve(
            NextResponse.json({ error: `CSV parsing error: ${error.message}` }, { status: 400 })
          );
        },
      });
    });
  } catch (error) {
    console.error('Import CSV error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
