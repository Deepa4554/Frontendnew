import * as XLSX from 'xlsx';
import { saveBinaryFile, savePdfFromHtml } from './fileExport';

export interface ReportColumn {
  key: string;
  label: string;
  /** Numeric columns should right-align — replaces the old "last column is always the
   * number" CSS assumption, which broke the moment a section had more than two columns. */
  align?: 'left' | 'right';
  /** Display-only formatting (e.g. money, percentages). Excel always gets the raw value
   * from `row[column.key]` regardless of this, so sheets stay sortable/summable. */
  format?: (value: unknown, row: Record<string, unknown>) => string;
}

export interface ReportSection {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** Appended as a final, visually distinct row in both the PDF table and the Excel sheet. */
  totalsRow?: Record<string, unknown>;
}

export interface ReportDefinition {
  title: string;
  businessName: string;
  dateRangeLabel: string;
  generatedAt?: Date;
  sections: ReportSection[];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Report';

const fileStamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

/** Excel sheet names can't exceed 31 characters and can't contain \ / ? * [ ] : — every
 * new report's section titles are free text ("Payment-Mode-Wise Sales"), unlike the four
 * short fixed names this util's predecessor (Dashboard-only ExportService) ever saw. */
const safeSheetName = (title: string, used: Set<string>) => {
  let base = title.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name)) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
};

const displayValue = (col: ReportColumn, row: Record<string, unknown>): string => {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  if (typeof raw === 'number') return Number.isInteger(raw) ? String(raw) : raw.toFixed(2);
  return raw == null ? '' : String(raw);
};

export class ReportExportService {
  /** Builds the report as a PDF — a shared file on mobile, a print-to-PDF on web. */
  static async exportToPDF(def: ReportDefinition): Promise<void> {
    const sectionHtml = (section: ReportSection) => {
      const headerRow = `<tr>${section.columns.map((c) => `<th style="text-align:${c.align === 'right' ? 'right' : 'left'}">${escapeHtml(c.label)}</th>`).join('')}</tr>`;
      const bodyRows = section.rows.length
        ? section.rows.map((row) => `<tr>${section.columns.map((c) => `<td style="text-align:${c.align === 'right' ? 'right' : 'left'}">${escapeHtml(displayValue(c, row))}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${section.columns.length}">No data in this range.</td></tr>`;
      const totalsRowHtml = section.totalsRow
        ? `<tr style="font-weight:bold;border-top:2px solid #2b1810;">${section.columns.map((c) => `<td style="text-align:${c.align === 'right' ? 'right' : 'left'}">${escapeHtml(displayValue(c, section.totalsRow!))}</td>`).join('')}</tr>`
        : '';
      return `<h2>${escapeHtml(section.title)}</h2><table><thead>${headerRow}</thead><tbody>${bodyRows}${totalsRowHtml}</tbody></table>`;
    };

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(def.title)}</title>
          <style>
            @page { margin: 16mm; }
            body { font-family: Helvetica, Arial, sans-serif; color: #2b1810; }
            h1 { font-size: 22px; margin: 0 0 4px; }
            h2 { font-size: 14px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b5b52; }
            .meta { color: #6b5b52; font-size: 12px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #e5ddd7; padding: 7px 10px; }
            th { background: #f6f2ef; font-weight: bold; }
            tr { page-break-inside: avoid; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(def.businessName)}</h1>
          <div class="meta">${escapeHtml(def.title)} &middot; ${escapeHtml(def.dateRangeLabel)}</div>
          <div class="meta">Generated ${escapeHtml((def.generatedAt ?? new Date()).toLocaleString())}</div>
          ${def.sections.map(sectionHtml).join('')}
        </body>
      </html>
    `;

    await savePdfFromHtml(`${slug(def.title)}-${fileStamp()}.pdf`, html);
  }

  /** Builds the same report as a multi-sheet .xlsx workbook — one sheet per section. */
  static async exportToExcel(def: ReportDefinition): Promise<void> {
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [def.businessName],
        [def.title],
        ['Date range', def.dateRangeLabel],
        ['Generated', (def.generatedAt ?? new Date()).toLocaleString()],
      ]),
      safeSheetName('Summary', usedNames),
    );

    for (const section of def.sections) {
      const headerRow = section.columns.map((c) => c.label);
      // Raw values (not `displayValue`'s formatted strings) so numbers stay numbers —
      // sortable/summable once the sheet lands in Excel, same principle the Dashboard-only
      // predecessor of this util followed.
      const bodyRows = section.rows.map((row) => section.columns.map((c) => row[c.key] ?? ''));
      const totalsRow = section.totalsRow ? [section.columns.map((c) => section.totalsRow![c.key] ?? '')] : [];
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([headerRow, ...bodyRows, ...totalsRow]),
        safeSheetName(section.title, usedNames),
      );
    }

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await saveBinaryFile(
      `${slug(def.title)}-${fileStamp()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64,
    );
  }
}
