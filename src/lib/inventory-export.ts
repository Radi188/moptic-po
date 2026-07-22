/**
 * Inventory export: build a branded PDF or Excel document (see
 * `inventory-document.ts`) and hand it to the OS share sheet.
 *
 * - PDF is rendered from styled HTML via expo-print (the logo embeds reliably).
 * - Excel is a lean HTML `<table>` saved with a `.xls` extension, which Excel,
 *   Numbers and Google Sheets all open as a spreadsheet.
 */
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { InventoryProduct } from "@/data/inventory";
import {
  buildExcelHtml,
  buildPdfHtml,
  type ExportOptions,
} from "@/lib/inventory-document";

export type {
  ExportFormat,
  ExportLayout,
  ExportLabels,
  ExportOptions,
} from "@/lib/inventory-document";

function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * Build the document and open the share sheet. Returns false when sharing is
 * unavailable on the device; throws on generation failure.
 */
export async function exportInventory(
  items: InventoryProduct[],
  opts: ExportOptions,
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  const layoutTag =
    opts.layout === "grouped"
      ? "by-category"
      : opts.layout === "count"
        ? "count-sheet"
        : "list";
  const baseName = `inventory-${layoutTag}-${fileStamp()}`;

  if (opts.format === "pdf") {
    const html = buildPdfHtml(items, opts);
    const { uri } = await Print.printToFileAsync({ html });
    const dest = new File(Paths.cache, `${baseName}.pdf`);
    if (dest.exists) dest.delete();
    await new File(uri).move(dest);
    await Sharing.shareAsync(dest.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: opts.labels.documentTitle,
    });
    return true;
  }

  const html = buildExcelHtml(items, opts);
  const file = new File(Paths.cache, `${baseName}.xls`);
  if (file.exists) file.delete();
  file.create();
  file.write(html);
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/vnd.ms-excel",
    UTI: "com.microsoft.excel.xls",
    dialogTitle: opts.labels.documentTitle,
  });
  return true;
}
