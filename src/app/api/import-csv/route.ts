import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();

    return new Promise((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const validRows: Record<string, string>[] = [];
          const errors: string[] = [];

          results.data.forEach((row: Record<string, string>, index: number) => {
            const slug = row.slug || row.Slug || '';
            const title = row.title || row.Title || '';

            if (!slug || !title) {
              errors.push(`Row ${index + 1}: Missing slug or title`);
              return;
            }

            validRows.push({
              slug,
              title,
              meta_description: row.meta_description || row.meta || row.Meta || row['Meta Description'] || '',
              keywords: row.keywords || row.Keywords || '',
              type: row.type || row.Type || 'blog',
              parent: row.parent || row.Parent || row.parent_silo || row['Parent Silo'] || '',
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
            NextResponse.json({ error: error.message }, { status: 400 })
          );
        },
      });
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
