/**
 * Pure HTML document builders for the inventory export. No native/IO imports so
 * the markup can be unit-tested and previewed outside the app. The `-export`
 * module wraps these with expo-print / file-system / sharing.
 */
import type { InventoryProduct } from "@/data/inventory";
import {
  BRAND_ACCENT,
  BRAND_INK,
  BRAND_LOGO_DATA_URI,
  BRAND_NAME,
} from "@/lib/brand-logo";

export type ExportFormat = "pdf" | "excel";
export type ExportLayout = "plain" | "grouped" | "count";

/** Localizable strings baked into the document (built from i18n by the caller). */
export type ExportLabels = {
  documentTitle: string;
  countTitle: string;
  generated: string;
  totalItems: string;
  totalStock: string;
  totalValue: string;
  colNo: string;
  colCode: string;
  colName: string;
  colCategory: string;
  colBrand: string;
  colStock: string;
  colPrice: string;
  colValue: string;
  colCount: string;
  countedBy: string;
  colorBlack: string;
  colorRed: string;
  colorBlue: string;
  subtotal: string;
  grandTotal: string;
  uncategorized: string;
  branch: string;
  item: string;
  items: string;
};

/** Pen colours offered on the count sheet for hand sign-off. */
const COUNT_COLORS: { key: keyof ExportLabels; hex: string }[] = [
  { key: "colorBlack", hex: "#111111" },
  { key: "colorRed", hex: "#e5484d" },
  { key: "colorBlue", hex: "#2563eb" },
];

export type ExportOptions = {
  format: ExportFormat;
  layout: ExportLayout;
  labels: ExportLabels;
  /** Branch name printed on the document; omit/undefined = all branches. */
  branchLabel?: string;
};

type Group = { name: string; items: InventoryProduct[] };

type Totals = { count: number; stock: number; value: number };

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (v: number) => v.toLocaleString("en-US");

function totalsOf(items: InventoryProduct[]): Totals {
  return items.reduce<Totals>(
    (acc, p) => {
      acc.count += 1;
      acc.stock += p.stock;
      acc.value += p.stock * p.price;
      return acc;
    },
    { count: 0, stock: 0, value: 0 },
  );
}

/** Bucket by category name, uncategorized last, both categories and items sorted. */
function groupByCategory(items: InventoryProduct[], uncategorized: string): Group[] {
  const map = new Map<string, InventoryProduct[]>();
  for (const p of items) {
    const key = p.category?.trim() || uncategorized;
    const bucket = map.get(key);
    if (bucket) bucket.push(p);
    else map.set(key, [p]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === uncategorized) return 1;
      if (b === uncategorized) return -1;
      return a.localeCompare(b);
    })
    .map(([name, groupItems]) => ({
      name,
      items: [...groupItems].sort((x, y) => x.name.localeCompare(y.name)),
    }));
}

function formatToday(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------------------------------------------ PDF ---- */

function pdfRows(items: InventoryProduct[], startIndex: number) {
  return items
    .map((p, i) => {
      const value = p.stock * p.price;
      const low = p.stock <= p.reorderLevel;
      return `<tr>
        <td class="num">${startIndex + i + 1}</td>
        <td class="mono">${esc(p.code || "—")}</td>
        <td>${esc(p.name || "—")}</td>
        <td>${esc(p.category || "—")}</td>
        <td>${esc(p.brand || "—")}</td>
        <td class="num ${low ? "low" : ""}">${qty(p.stock)}</td>
        <td class="num">${money(p.price)}</td>
        <td class="num strong">${money(value)}</td>
      </tr>`;
    })
    .join("");
}

function pdfTotalRow(label: string, t: Totals, kind: "sub" | "grand") {
  return `<tr class="total ${kind}">
    <td colspan="5">${esc(label)}</td>
    <td class="num">${qty(t.stock)}</td>
    <td></td>
    <td class="num">${money(t.value)}</td>
  </tr>`;
}

/** Count-sheet table: only No. + Product, plus a blank column to hand-write. */
function pdfCountBody(items: InventoryProduct[]): string {
  return items
    .map(
      (p, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(p.name || "—")}</td>
        <td class="count-cell"></td>
      </tr>`,
    )
    .join("");
}

/** Pen-colour sign-off block: a blank line per colour for the counter's name. */
function pdfSignoff(l: ExportLabels): string {
  const rows = COUNT_COLORS.map(
    (c) => `<div class="signoff-row">
      <span class="swatch" style="background:${c.hex}"></span>
      <span class="signoff-color">${esc(l[c.key])}</span>
      <span class="signoff-line"></span>
    </div>`,
  ).join("");
  return `<div class="signoff">
    <div class="signoff-title">${esc(l.countedBy)}</div>
    <div class="signoff-rows">${rows}</div>
  </div>`;
}

export function buildPdfHtml(items: InventoryProduct[], opts: ExportOptions): string {
  const l = opts.labels;
  const isCount = opts.layout === "count";
  const grand = totalsOf(items);
  const title = isCount ? l.countTitle : l.documentTitle;

  let head: string;
  let body = "";
  let summary: string;
  let signoff = "";

  if (isCount) {
    head = `<tr>
      <th class="num" style="width:46px">${esc(l.colNo)}</th>
      <th>${esc(l.colName)}</th>
      <th class="count-col">${esc(l.colCount)}</th>
    </tr>`;
    body = pdfCountBody(items);
    // Deliberately no stock/value on a count sheet so the count stays blind.
    summary = `<div class="count-info">${esc(l.totalItems)}: ${qty(grand.count)}</div>`;
    signoff = pdfSignoff(l);
  } else {
    head = `<tr>
      <th class="num">${esc(l.colNo)}</th>
      <th>${esc(l.colCode)}</th>
      <th>${esc(l.colName)}</th>
      <th>${esc(l.colCategory)}</th>
      <th>${esc(l.colBrand)}</th>
      <th class="num">${esc(l.colStock)}</th>
      <th class="num">${esc(l.colPrice)}</th>
      <th class="num">${esc(l.colValue)}</th>
    </tr>`;
    if (opts.layout === "grouped") {
      const groups = groupByCategory(items, l.uncategorized);
      let offset = 0;
      for (const g of groups) {
        const gt = totalsOf(g.items);
        const word = g.items.length === 1 ? l.item : l.items;
        body += `<tr class="group"><td colspan="8">${esc(g.name)} · ${g.items.length} ${esc(word)}</td></tr>`;
        body += pdfRows(g.items, offset);
        body += pdfTotalRow(l.subtotal, gt, "sub");
        offset += g.items.length;
      }
      body += pdfTotalRow(l.grandTotal, grand, "grand");
    } else {
      body += pdfRows(items, 0);
      body += pdfTotalRow(l.grandTotal, grand, "grand");
    }
    summary = `<div class="summary">
      <div class="chip"><div class="k">${esc(l.totalItems)}</div><div class="v">${qty(grand.count)}</div></div>
      <div class="chip"><div class="k">${esc(l.totalStock)}</div><div class="v">${qty(grand.stock)}</div></div>
      <div class="chip"><div class="k">${esc(l.totalValue)}</div><div class="v">$${money(grand.value)}</div></div>
    </div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: ${BRAND_INK}; margin: 0; padding: 28px 26px; }
  .header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 3px solid ${BRAND_ACCENT}; }
  .logo { width: 56px; height: 56px; border-radius: 14px; overflow: hidden; flex-shrink: 0; }
  .logo img { width: 100%; height: 100%; object-fit: cover; }
  .brand { flex: 1; }
  .brand .name { font-size: 20px; font-weight: 800; letter-spacing: .2px; }
  .brand .title { font-size: 13px; color: ${BRAND_ACCENT}; font-weight: 600; margin-top: 2px; }
  .meta { text-align: right; font-size: 11px; color: #8a8f9c; line-height: 1.7; }
  .branch-pill { display: inline-block; background: ${BRAND_ACCENT}; color: #fff; font-weight: 700; font-size: 11px; padding: 3px 10px; border-radius: 999px; }
  .summary { display: flex; gap: 12px; margin: 18px 0; }
  .chip { flex: 1; border: 1px solid #ececf0; border-radius: 12px; padding: 12px 14px; }
  .chip .k { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #9aa0ac; }
  .chip .v { font-size: 20px; font-weight: 800; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { text-align: left; background: ${BRAND_INK}; color: #fff; padding: 9px 10px; font-weight: 600; }
  thead th.num { text-align: right; }
  tbody td { padding: 8px 10px; border-bottom: 1px solid #eef0f3; }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.mono { font-family: "SF Mono", Menlo, monospace; font-size: 10px; color: #6b7280; }
  td.strong { font-weight: 700; }
  td.low { color: #e5484d; font-weight: 700; }
  tr.group td { background: ${BRAND_ACCENT}1a; color: ${BRAND_INK}; font-weight: 700; padding: 9px 10px; border-bottom: none; }
  tr.total td { border-top: 1.5px solid #d9dce2; border-bottom: none; font-weight: 700; padding: 9px 10px; }
  tr.total.sub td { color: ${BRAND_ACCENT}; }
  tr.total.grand td { background: ${BRAND_INK}; color: #fff; font-size: 12px; }
  .count-info { margin: 16px 0 10px; font-size: 12px; font-weight: 700; color: ${BRAND_INK}; }
  .count-col { width: 130px; text-align: center; }
  body.count thead th { font-size: 12px; }
  body.count tbody td { padding: 12px 10px; font-size: 12px; }
  tbody td.count-cell { border-left: 1px solid #c4c8d0; }
  .signoff { margin-top: 26px; border-top: 2px solid ${BRAND_ACCENT}; padding-top: 16px; break-inside: avoid; }
  .signoff-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 16px; color: ${BRAND_INK}; }
  .signoff-rows { display: flex; flex-direction: column; gap: 18px; }
  .signoff-row { display: flex; align-items: center; gap: 12px; }
  .swatch { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(0,0,0,.18); }
  .signoff-color { width: 80px; font-size: 13px; font-weight: 700; }
  .signoff-line { flex: 1; border-bottom: 1.5px solid #9aa0ac; height: 20px; }
  .footer { margin-top: 22px; text-align: center; font-size: 10px; color: #adb2bd; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
</style></head>
<body class="${isCount ? "count" : ""}">
  <div class="header">
    <div class="logo"><img src="${BRAND_LOGO_DATA_URI}" /></div>
    <div class="brand">
      <div class="name">${esc(BRAND_NAME)}</div>
      <div class="title">${esc(title)}</div>
    </div>
    <div class="meta">
      ${opts.branchLabel ? `<span class="branch-pill">${esc(l.branch)}: ${esc(opts.branchLabel)}</span><br/>` : ""}
      ${esc(l.generated)} ${esc(formatToday())}
    </div>
  </div>

  ${summary}

  <table>
    <thead>${head}</thead>
    <tbody>${body}</tbody>
  </table>

  ${signoff}

  <div class="footer">${esc(BRAND_NAME)}${opts.branchLabel ? ` · ${esc(opts.branchLabel)}` : ""} · ${esc(l.generated)} ${esc(formatToday())}</div>
</body></html>`;
}

/* ---------------------------------------------------------------- Excel ---- */

function xlsRows(items: InventoryProduct[], startIndex: number) {
  return items
    .map((p, i) => {
      const value = p.stock * p.price;
      return `<tr>
        <td>${startIndex + i + 1}</td>
        <td>${esc(p.code || "")}</td>
        <td>${esc(p.name || "")}</td>
        <td>${esc(p.category || "")}</td>
        <td>${esc(p.brand || "")}</td>
        <td class="n">${p.stock}</td>
        <td class="n">${p.price.toFixed(2)}</td>
        <td class="n">${value.toFixed(2)}</td>
      </tr>`;
    })
    .join("");
}

function xlsTotalRow(label: string, t: Totals, cls: string) {
  return `<tr class="${cls}">
    <td colspan="5">${esc(label)}</td>
    <td class="n">${t.stock}</td>
    <td></td>
    <td class="n">${t.value.toFixed(2)}</td>
  </tr>`;
}

export function buildExcelHtml(items: InventoryProduct[], opts: ExportOptions): string {
  const l = opts.labels;
  const isCount = opts.layout === "count";
  const grand = totalsOf(items);
  const cols = isCount ? 3 : 8;
  const title = isCount ? l.countTitle : l.documentTitle;

  let head: string;
  let body = "";

  if (isCount) {
    head = `<tr class="h">
      <td>${esc(l.colNo)}</td>
      <td>${esc(l.colName)}</td>
      <td>${esc(l.colCount)}</td>
    </tr>`;
    body = items
      .map(
        (p, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(p.name || "")}</td>
          <td></td>
        </tr>`,
      )
      .join("");
    // Blank spacer + pen-colour sign-off rows (colour cell + blank name cell).
    body += `<tr class="plain"><td colspan="3"></td></tr>`;
    body += `<tr class="plain"><td colspan="3" style="font-weight:bold;font-size:13px">${esc(l.countedBy)}</td></tr>`;
    for (const c of COUNT_COLORS) {
      body += `<tr><td style="background:${c.hex};color:#ffffff;font-weight:bold">${esc(l[c.key])}</td><td colspan="2"></td></tr>`;
    }
  } else {
    head = `<tr class="h">
      <td>${esc(l.colNo)}</td>
      <td>${esc(l.colCode)}</td>
      <td>${esc(l.colName)}</td>
      <td>${esc(l.colCategory)}</td>
      <td>${esc(l.colBrand)}</td>
      <td>${esc(l.colStock)}</td>
      <td>${esc(l.colPrice)}</td>
      <td>${esc(l.colValue)}</td>
    </tr>`;
    if (opts.layout === "grouped") {
      const groups = groupByCategory(items, l.uncategorized);
      let offset = 0;
      for (const g of groups) {
        const gt = totalsOf(g.items);
        body += `<tr class="g"><td colspan="8">${esc(g.name)} (${g.items.length})</td></tr>`;
        body += xlsRows(g.items, offset);
        body += xlsTotalRow(l.subtotal, gt, "sub");
        offset += g.items.length;
      }
      body += xlsTotalRow(l.grandTotal, grand, "grand");
    } else {
      body += xlsRows(items, 0);
      body += xlsTotalRow(l.grandTotal, grand, "grand");
    }
  }

  const infoLine = isCount
    ? `${esc(l.generated)} ${esc(formatToday())} · ${esc(l.totalItems)}: ${grand.count}`
    : `${esc(l.generated)} ${esc(formatToday())} · ${esc(l.totalItems)}: ${grand.count} · ${esc(l.totalValue)}: $${grand.value.toFixed(2)}`;

  // A small brand band above the data. Excel ignores the <img>, but the name +
  // title keep the header intentional; Numbers/Sheets render the logo.
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8" />
<style>
  table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
  td { border: 0.5pt solid #d0d4da; padding: 5px 8px; }
  .band td { border: none; font-weight: bold; font-size: 16px; color: ${BRAND_INK}; }
  .branchrow td { border: none; font-weight: bold; color: ${BRAND_INK}; font-size: 13px; }
  .sub2 td { border: none; color: ${BRAND_ACCENT}; font-size: 11px; }
  .plain td { border: none; }
  tr.h td { background: ${BRAND_INK}; color: #ffffff; font-weight: bold; text-align: center; }
  td.n { text-align: right; mso-number-format: "0.00"; }
  tr.g td { background: #efe7e4; font-weight: bold; }
  tr.sub td { font-weight: bold; color: ${BRAND_ACCENT}; }
  tr.grand td { background: ${BRAND_INK}; color: #ffffff; font-weight: bold; }
</style></head>
<body>
  <table>
    <tr class="band"><td colspan="${cols}"><img src="${BRAND_LOGO_DATA_URI}" width="40" height="40" /> &nbsp; ${esc(BRAND_NAME)} — ${esc(title)}</td></tr>
    ${opts.branchLabel ? `<tr class="branchrow"><td colspan="${cols}">${esc(l.branch)}: ${esc(opts.branchLabel)}</td></tr>` : ""}
    <tr class="sub2"><td colspan="${cols}">${infoLine}</td></tr>
    <tr class="plain"><td colspan="${cols}"></td></tr>
    ${head}
    ${body}
  </table>
</body></html>`;
}
