// Reads actual expenditure from the weekly expense workbook ("LOCAL DEEJAYS WEEKLY EXPENSES").
//
// Each tab of that workbook is one week, and only one tab is read per import. A tab is a stack of
// sections: a heading row (# in column A, the section name in column B), numbered lines, and a SUBTOTAL
// row (amount due in column C, amount paid in column D). Only the SUBTOTAL of each section is used. The
// individual lines are never stored or compared.
import ExcelJS from 'exceljs';
import { emptyByGroup, groupLabel, type VarianceGroupKey } from '../../shared/categories.ts';
import type { ActualSectionPreview, ActualSheetInfo, ActualSheetList } from '../../shared/types.ts';
import { cellNumber, cellText, ImportError, toCents } from './excel.ts';

export interface ReadSection {
  heading: string;
  group: VarianceGroupKey;
  /** The section's subtotal as printed on the sheet. */
  sheetCents: number;
  paidCents: number;
}

export interface ReadSheet {
  tab: string;
  sections: ReadSection[];
  /** The "TOTAL AMOUNT DUE" printed at the top of the tab, or null. */
  sheetTotalCents: number | null;
  warnings: string[];
}

export async function loadWorkbook(data: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
  } catch {
    throw new ImportError('The file could not be read as an Excel (.xlsx) workbook');
  }
  return wb;
}

/** Which comparison group a section heading belongs to. */
export function groupForHeading(heading: string): { group: VarianceGroupKey; known: boolean } {
  const h = heading.toLowerCase();
  if (/resident/.test(h)) return { group: 'standard', known: true }; // camera, MC, graphics
  if (/\bdj/.test(h)) return { group: 'resident', known: true }; // LOCAL DJ's
  if (/host/.test(h)) return { group: 'hosts', known: true };
  if (/rider/.test(h)) return { group: 'rider', known: true };
  if (/bottle/.test(h)) return { group: 'standard', known: true };
  if (/headline/.test(h)) return { group: 'headline', known: true };
  if (/misc/.test(h)) return { group: 'marketing', known: true };
  return { group: 'marketing', known: false };
}

/** Reads one tab (one week): the subtotal of every section. */
export function readSheet(ws: ExcelJS.Worksheet): ReadSheet {
  const warnings: string[] = [];
  const sections: ReadSection[] = [];

  let heading: string | null = null;
  let running = 0; // the section's amounts added up, used only if the sheet has no usable subtotal
  let subtotal: number | null | undefined; // undefined: no SUBTOTAL row seen yet
  let paid = 0;

  const close = () => {
    if (heading === null) return;
    let cents: number;
    if (typeof subtotal === 'number') {
      cents = subtotal;
    } else {
      cents = running;
      if (running > 0) warnings.push(`${heading}: the sheet has no subtotal for this section, so its amounts were added up (R${(running / 100).toFixed(2)}).`);
    }
    if (cents > 0) {
      const { group, known } = groupForHeading(heading);
      if (!known) warnings.push(`The section "${heading}" is not recognised. It is counted under ${groupLabel(group)}.`);
      sections.push({ heading, group, sheetCents: cents, paidCents: Math.min(paid, cents) });
    }
    heading = null;
  };

  ws.eachRow({ includeEmpty: false }, (row) => {
    const a = cellText(row.getCell(1).value);
    const b = cellText(row.getCell(2).value);

    if (a === '#') {
      close();
      heading = b || '(untitled section)';
      running = 0;
      subtotal = undefined;
      paid = 0;
      return;
    }
    if (heading === null) return;

    if (a.toUpperCase() === 'SUBTOTAL' || b.toUpperCase() === 'SUBTOTAL') {
      const due = cellNumber(row.getCell(3).value);
      subtotal = due === null ? null : toCents(due);
      const p = cellNumber(row.getCell(4).value);
      paid = p && p > 0 ? toCents(p) : 0;
      return;
    }
    if (subtotal === undefined) {
      const amount = cellNumber(row.getCell(3).value);
      if (amount !== null && amount > 0) running += toCents(amount);
    }
  });
  close();

  if (sections.length === 0) throw new ImportError(`The tab "${ws.name}" has no expense totals. Choose a weekly tab.`);

  const topTotal = cellNumber(ws.getCell('D3').value);
  const sheetTotalCents = topTotal === null ? null : toCents(topTotal);
  const sum = sections.reduce((s, x) => s + x.sheetCents, 0);
  if (sheetTotalCents !== null && sheetTotalCents !== sum) {
    warnings.push(
      `The sheet's TOTAL AMOUNT DUE is R${(sheetTotalCents / 100).toFixed(2)} but its section subtotals add up to R${(sum / 100).toFixed(2)} (difference R${((sum - sheetTotalCents) / 100).toFixed(2)}).`,
    );
  }
  return { tab: ws.name, sections, sheetTotalCents, warnings };
}

/** The tabs of a workbook, so the person importing can choose the week. */
export function listSheets(wb: ExcelJS.Workbook): ActualSheetList {
  const sheets: ActualSheetInfo[] = wb.worksheets
    .filter((w) => w.state === 'visible')
    .map((w) => {
      try {
        const r = readSheet(w);
        return { name: w.name, total: r.sections.reduce((s, x) => s + x.sheetCents, 0) / 100, sections: r.sections.length };
      } catch {
        return { name: w.name, total: 0, sections: 0 }; // not a weekly tab, such as SUMMARY
      }
    });
  const withData = sheets.filter((s) => s.sections > 0);
  return { sheets, suggested: withData.at(-1)?.name ?? null };
}

/**
 * Applies the amounts the person chose to change in the preview. `adjust` maps a section heading to the
 * rand amount to use instead of the sheet's subtotal.
 */
export function applyAdjustments(sections: ReadSection[], adjust: Record<string, number>): { sections: (ReadSection & { cents: number })[]; adjusted: boolean } {
  const known = new Set(sections.map((s) => s.heading));
  for (const key of Object.keys(adjust)) {
    if (!known.has(key)) throw new ImportError(`There is no section called "${key}" on this tab.`);
  }
  let adjusted = false;
  const out = sections.map((s) => {
    const override = adjust[s.heading];
    const cents = override === undefined ? s.sheetCents : toCents(override);
    if (cents !== s.sheetCents) adjusted = true;
    return { ...s, cents, paidCents: Math.min(s.paidCents, cents) };
  });
  return { sections: out, adjusted };
}

/** Totals by group of the amounts that will be imported. */
export function summarise(sections: { group: VarianceGroupKey; cents: number; paidCents: number }[]) {
  const byGroup = emptyByGroup();
  let total = 0;
  let paid = 0;
  for (const s of sections) {
    byGroup[s.group] += s.cents;
    total += s.cents;
    paid += s.paidCents;
  }
  for (const k of Object.keys(byGroup) as VarianceGroupKey[]) byGroup[k] /= 100;
  return { byGroup, total: total / 100, paid: paid / 100 };
}

export function toPreviewSections(sections: (ReadSection & { cents: number })[]): ActualSectionPreview[] {
  return sections.map((s) => ({ heading: s.heading, group: s.group, sheetAmount: s.sheetCents / 100, amount: s.cents / 100 }));
}
