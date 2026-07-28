/**
 * Pure HTML builder for the daily "stock refill" control sheet (matching the
 * branch paper form). Kept free of native imports so it can be unit-tested /
 * previewed outside the app; expo-print rendering lives in refill-report.ts.
 */
import { REPORT_LOGO_DATA_URI } from '@/lib/brand-logo';

const STORE_NAME = 'ហាងវ៉ែនតា អឺម អុបទិក';

export type RefillReportRow = {
  productName: string;
  /** Quantity the branch sold that day ("stock branch sale"). */
  branchSale: number;
  /** Quantity sent out from the source warehouse. */
  transferOut: number;
  /** Quantity the branch should receive (same as transferOut). */
  branchToGet: number;
  /** Shortage: branchSale - transferOut when positive, else 0. */
  less: number;
  /** Surplus: transferOut - branchSale when positive, else 0. */
  over: number;
};

export type RefillReportMeta = {
  branchName: string;
  sourceName: string;
  /** YYYY-MM-DD sales date the user selected (the reference date). */
  date: string;
  /** YYYY-MM-DD date the transfer was created (today) — shown as the transaction date. */
  createdDate: string;
  /** Branch manager controlling the branch (manually entered). */
  bmName: string;
  /** Delivery person's name (manually entered) — printed under their signature line. */
  deliveryPerson: string;
};

/** Derive a report row from the sold qty and the qty being transferred out. */
export function toReportRow(
  productName: string,
  branchSale: number,
  transferOut: number,
): RefillReportRow {
  const diff = branchSale - transferOut;
  return {
    productName,
    branchSale,
    transferOut,
    branchToGet: transferOut,
    less: diff > 0 ? diff : 0,
    over: diff < 0 ? -diff : 0,
  };
}

function esc(value: string | number) {
  return String(value).replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

/** Khmer-only column headers, matching the paper control sheet. */
const COLUMNS = [
  'ប្រភេទទំនិញ',
  'ស្តុកលក់សាខា',
  'ស្តុកផ្ញើចេញ',
  'ស្តុកសាខាទទួល',
  'ខ្វះ',
  'លើស',
  'ឈ្មោះ BM',
];

/**
 * Grouping key: the product name's first 5 letters, lowercased with spaces
 * stripped so "Ray Ban" and "RayBan" group together. Names shorter than 5
 * letters use whatever they have.
 */
function groupKey(name: string) {
  return name.replace(/\s+/g, '').toLowerCase().slice(0, 5);
}

type Totals = { sale: number; out: number; get: number; less: number; over: number };

function sumRows(rows: RefillReportRow[]): Totals {
  return rows.reduce<Totals>(
    (acc, r) => ({
      sale: acc.sale + r.branchSale,
      out: acc.out + r.transferOut,
      get: acc.get + r.branchToGet,
      less: acc.less + r.less,
      over: acc.over + r.over,
    }),
    { sale: 0, out: 0, get: 0, less: 0, over: 0 },
  );
}

export function buildRefillReportHtml(rows: RefillReportRow[], meta: RefillReportMeta) {
  const cell = (n: number) => (n > 0 ? String(n) : '–');

  // Group rows whose product names share the same first 5 letters. Order the
  // groups by that key, keeping the incoming (already A–Z by name) order within
  // each group. `label` shows the shared prefix taken from the first product.
  const groups = new Map<string, { label: string; rows: RefillReportRow[] }>();
  for (const r of rows) {
    const key = groupKey(r.productName);
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else groups.set(key, { label: r.productName.trim().slice(0, 5), rows: [r] });
  }
  const keys = [...groups.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  const itemRow = (r: RefillReportRow, i: number) => `
      <tr>
        <td class="num">${i}</td>
        <td class="name">${esc(r.productName)}</td>
        <td>${esc(r.branchSale)}</td>
        <td>${esc(r.transferOut)}</td>
        <td>${esc(r.branchToGet)}</td>
        <td class="${r.less > 0 ? 'warn' : 'muted'}">${cell(r.less)}</td>
        <td class="${r.over > 0 ? 'warn' : 'muted'}">${cell(r.over)}</td>
        <td>${esc(meta.bmName || '–')}</td>
      </tr>`;

  let n = 0;
  const body = keys
    .map((key) => {
      const { label, rows: groupRows } = groups.get(key)!;
      const st = sumRows(groupRows);
      // Single-item groups render as a plain row — no header/subtotal, since the
      // row already is the group. Only multi-item groups get the header + subtotal.
      const multi = groupRows.length > 1;
      const header = multi
        ? `
      <tr class="cat">
        <td></td>
        <td class="name">${esc(label)}…</td>
        <td colspan="6">${groupRows.length} មុខទំនិញ</td>
      </tr>`
        : '';
      const items = groupRows.map((r) => itemRow(r, (n += 1))).join('');
      const subtotal = multi
        ? `
      <tr class="subtotal">
        <td></td>
        <td class="label">សរុបក្រុម</td>
        <td>${st.sale}</td>
        <td>${st.out}</td>
        <td>${st.get}</td>
        <td>${st.less || '–'}</td>
        <td>${st.over || '–'}</td>
        <td></td>
      </tr>`
          : '';
      return header + items + subtotal;
    })
    .join('');

  const totals = sumRows(rows);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: 'Khmer OS', 'Noto Sans Khmer', -apple-system, 'Roboto', sans-serif;
        color: #1a1a1a;
        margin: 0;
        padding: 20px;
        font-size: 12px;
      }
      .brand { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 10px; }
      .brand img { width: 48px; height: 48px; border-radius: 10px; object-fit: cover; }
      .brand .store-name { font-size: 16px; font-weight: 700; color: #232843; }
      h1 { font-size: 18px; margin: 0 0 6px; text-align: center; }
      .meta { margin: 0 0 14px; color: #444; font-size: 12px; line-height: 1.6; }
      .meta b { color: #1a1a1a; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; }
      th { background: #232843; color: #fff; font-weight: 600; }
      th .en { font-weight: 400; font-size: 9px; opacity: 0.8; }
      td.num { width: 28px; color: #888; }
      td.name { text-align: left; }
      td.warn { color: #c0392b; font-weight: 700; }
      td.muted { color: #bbb; }
      tr.cat td { background: #e8eaf2; font-weight: 700; text-align: left; }
      tr.cat td.name { color: #232843; }
      tr.subtotal td { background: #f7f8fb; font-weight: 700; color: #444; }
      tr.subtotal td.label { text-align: right; }
      tfoot td { font-weight: 700; background: #f2f3f7; }
      tfoot td.label { text-align: right; }
      .checks { display: flex; justify-content: space-between; gap: 16px; margin-top: 18px; }
      .checks .check { display: flex; align-items: flex-start; gap: 8px; flex: 1; font-size: 12px; line-height: 1.5; }
      .checks .box { width: 13px; height: 13px; border: 1.5px solid #1a1a1a; flex-shrink: 0; margin-top: 2px; }
      .signatures { display: flex; justify-content: space-between; gap: 16px; margin-top: 18px; text-align: center; }
      .signatures .sign { flex: 1; font-size: 12px; }
      .signatures .space { height: 46px; }
      .signatures .sign-name { font-weight: 700; color: #232843; }
    </style>
  </head>
  <body>
    <div class="brand">
      <img src="${REPORT_LOGO_DATA_URI}" />
      <span class="store-name">${esc(STORE_NAME)}</span>
    </div>
    <h1>លិខិតស្នើរនិងផ្ទេរស្តុក</h1>
    <p class="meta">
      <b>ផ្ទេរពី:</b> ${esc(meta.sourceName)} &nbsp;&nbsp;
      <b>ទៅកាន់:</b> ${esc(meta.branchName)}<br/>
      <b>កាលបរិច្ឆេទ:</b> ${esc(meta.createdDate)}<br/>
      <b>BM:</b> ${esc(meta.bmName || '–')}
    </p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          ${COLUMNS.map((c) => `<th>${c}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td></td>
          <td class="label">សរុប</td>
          <td>${totals.sale}</td>
          <td>${totals.out}</td>
          <td>${totals.get}</td>
          <td>${totals.less || '–'}</td>
          <td>${totals.over || '–'}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="checks">
      <div class="check"><span class="box"></span><span>បានត្រួតពិនិត្យ និង​ទទួលស្គាល់នូវទំនិញដែលបានទទួលបានស្ថិតក្នុងលក្ខខណ្ឌល្អប្រសើរ ត្រឹមត្រូវ</span></div>
      <div class="check"><span class="box"></span><span>បានត្រួតពិនិត្យ និង​ទទួលបានគ្រប់ចំនួនរាល់ទំនិញដែលបានស្នើរ</span></div>
    </div>

    <div class="signatures">
      <div class="sign">ហត្ថាលេខានិងឈ្មោះអ្នកផ្ទេរ<div class="space"></div></div>
      <div class="sign">ហត្ថាលេខានិងឈ្មោះអ្នកដឹក<div class="space sign-name">${esc(meta.deliveryPerson || '')}</div></div>
      <div class="sign">ហត្ថាលេខានិងឈ្មោះអ្នកទទួល<div class="space"></div></div>
    </div>
  </body>
</html>`;
}
