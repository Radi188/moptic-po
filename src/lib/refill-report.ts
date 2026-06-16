/**
 * Renders the daily stock-refill control sheet to a PDF via expo-print. The
 * HTML itself is built by the native-free helper in refill-report-html.ts.
 */
import * as Print from 'expo-print';

import {
  buildRefillReportHtml,
  type RefillReportMeta,
  type RefillReportRow,
} from '@/lib/refill-report-html';

export { toReportRow } from '@/lib/refill-report-html';
export type { RefillReportMeta, RefillReportRow } from '@/lib/refill-report-html';

/** Render the report to a PDF and return the local file uri. */
export async function generateRefillReportPdf(
  rows: RefillReportRow[],
  meta: RefillReportMeta,
): Promise<string> {
  const html = buildRefillReportHtml(rows, meta);
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}
