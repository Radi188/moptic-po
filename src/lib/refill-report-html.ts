/**
 * Pure HTML builder for the daily "stock refill" control sheet (matching the
 * branch paper form). Kept free of native imports so it can be unit-tested /
 * previewed outside the app; expo-print rendering lives in refill-report.ts.
 */

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
  /** YYYY-MM-DD date the transfer was created (today). */
  createdDate: string;
  /** Branch manager controlling the branch (manually entered). */
  bmName: string;
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

/** Bilingual (Khmer / English) column headers, matching the paper control sheet. */
const COLUMNS = [
  'ប្រភេទទំនិញ<br/><span class="en">Product name</span>',
  'ស្តុកលក់សាខា<br/><span class="en">Branch sale</span>',
  'ស្តុកផ្ញើចេញ<br/><span class="en">Transfer out</span>',
  'ស្តុកសាខាទទួល<br/><span class="en">Branch to get</span>',
  'ខ្វះ<br/><span class="en">Less</span>',
  'លើស<br/><span class="en">Over</span>',
  'ឈ្មោះ BM<br/><span class="en">BM name</span>',
];

export function buildRefillReportHtml(rows: RefillReportRow[], meta: RefillReportMeta) {
  const cell = (n: number) => (n > 0 ? String(n) : '–');

  const body = rows
    .map(
      (r, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="name">${esc(r.productName)}</td>
        <td>${esc(r.branchSale)}</td>
        <td>${esc(r.transferOut)}</td>
        <td>${esc(r.branchToGet)}</td>
        <td class="${r.less > 0 ? 'warn' : 'muted'}">${cell(r.less)}</td>
        <td class="${r.over > 0 ? 'warn' : 'muted'}">${cell(r.over)}</td>
        <td>${esc(meta.bmName || '–')}</td>
      </tr>`,
    )
    .join('');

  const totals = rows.reduce(
    (acc, r) => ({
      sale: acc.sale + r.branchSale,
      out: acc.out + r.transferOut,
      get: acc.get + r.branchToGet,
      less: acc.less + r.less,
      over: acc.over + r.over,
    }),
    { sale: 0, out: 0, get: 0, less: 0, over: 0 },
  );

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
      tfoot td { font-weight: 700; background: #f2f3f7; }
      tfoot td.label { text-align: right; }
    </style>
  </head>
  <body>
    <h1>List ស្តុកបញ្ជ-ផលិតផល ប្រចាំថ្ងៃ</h1>
    <p class="meta">
      <b>សាខា / Branch:</b> ${esc(meta.branchName)} &nbsp;·&nbsp;
      <b>ឃ្លាំង / From:</b> ${esc(meta.sourceName)}<br/>
      <b>ថ្ងៃលក់ / Sales date (ref):</b> ${esc(meta.date)} &nbsp;·&nbsp;
      <b>ថ្ងៃបង្កើត / Created:</b> ${esc(meta.createdDate)}<br/>
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
          <td class="label">សរុប / Total</td>
          <td>${totals.sale}</td>
          <td>${totals.out}</td>
          <td>${totals.get}</td>
          <td>${totals.less || '–'}</td>
          <td>${totals.over || '–'}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </body>
</html>`;
}
