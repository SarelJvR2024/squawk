/** Builds a real PDF file from the on-screen report and saves it, so
 *  "Download PDF" downloads instead of opening the print dialog.
 *
 *  The report is drawn to a canvas and placed on A4 PORTRAIT pages. Because the
 *  file is built from an image of the page rather than by the browser's print
 *  engine, the print rules in the report's own CSS do not apply here, so this
 *  file does the same jobs itself (Sarel, 27 Nov 2026):
 *
 *    - page breaks fall only between "units": a table row, a finding with its
 *      photographs, a card, a heading kept with what follows it. Never through
 *      one;
 *    - a table that continues onto the next page repeats its header row at the
 *      top of that page;
 *    - no stranded rows: a break is not allowed directly after a table's first
 *      row (header + one row at the foot of a page) or directly before its last
 *      row (one row alone at the top of the next);
 *    - a running header (pages 2 onward) and a footer on every page with the
 *      generation time, the interim-report disclaimer and "Page X of Y".
 *
 *  The text in the PDF is an image, not selectable; Print -> Save as PDF keeps
 *  selectable text and uses the report's @page rules instead. */

export interface ReportPdfMeta {
  /** Running header, pages 2 onward, e.g. "Squawk Assurance · Civil · FAPE · Nov 2026". */
  header?: string;
}

/** A place a page may end, and what a following page needs repeated above it. */
interface Candidate {
  y: number;
  /** The table this break falls inside, so its header can be repeated. */
  table: number | null;
}

export async function downloadReportPdf(root: HTMLElement, filename: string, meta: ReportPdfMeta = {}): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  const rootTop = root.getBoundingClientRect().top;
  const widthPx = root.scrollWidth;
  const heightPx = root.scrollHeight;
  const rel = (el: Element, edge: "top" | "bottom") => el.getBoundingClientRect()[edge] - rootTop;

  /* ---- tables: header rect, and the rows inside, in order ---- */
  const tables = Array.from(root.querySelectorAll<HTMLTableElement>("table"));
  const tableInfo = tables.map((t) => {
    const head = t.querySelector("thead");
    const rows = Array.from(t.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
    // A "unit" is a row that is not a continuation of the row above it
    // (a finding's photograph row is kept with the finding row).
    const units: HTMLTableRowElement[] = rows.filter((_, i) => !rows[i - 1]?.hasAttribute("data-keepnext"));
    return {
      top: rel(t, "top"),
      bottom: rel(t, "bottom"),
      headTop: head ? rel(head, "top") : 0,
      headBottom: head ? rel(head, "bottom") : 0,
      unitBottoms: units.map((u) => {
        const group = u.hasAttribute("data-keepnext") ? u.nextElementSibling : null;
        return rel(group ?? u, "bottom");
      }),
    };
  });

  /* ---- where a page may end ---- */
  const cands: Candidate[] = [];
  const add = (y: number, table: number | null) => {
    if (y > 0) cands.push({ y, table });
  };
  tableInfo.forEach((t, i) => {
    const n = t.unitBottoms.length;
    t.unitBottoms.forEach((y, k) => {
      const isLast = k === n - 1;
      // No break after the first unit (header + one row) or before the last (one row alone).
      if (n >= 3 && (k === 0 || k === n - 2)) return;
      if (n === 2 && k === 0) return;
      add(y, isLast ? null : i);
    });
  });
  root.querySelectorAll<HTMLElement>(".rr-card, .report-card").forEach((el) => {
    if (el.closest("table")) return;
    add(rel(el, "bottom"), null);
  });
  root.querySelectorAll<HTMLElement>("h2").forEach((el) => add(rel(el, "top") - 8, null));
  // Blocks of plain text (the footer note, paragraphs) may end a page too.
  root.querySelectorAll<HTMLElement>("p").forEach((el) => {
    if (!el.closest("table")) add(rel(el, "bottom"), null);
  });
  cands.sort((a, b) => a.y - b.y);

  const SCALE = 2;
  const canvas = await html2canvas(root, {
    scale: SCALE,
    backgroundColor: "#FFFFFF",
    useCORS: true,
    logging: false,
    ignoreElements: (el) => el.hasAttribute("data-html2canvas-ignore"),
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const MX = 12; // left/right margin
  const MT = 15; // top margin (room for the running header on pages 2+)
  const MB = 15; // bottom margin (room for the footer)
  const mmPerPx = (pageW - 2 * MX) / widthPx;
  const usablePx = (pageH - MT - MB) / mmPerPx;

  /** The table (if any) a position falls inside the BODY of, for header repeat. */
  const tableAt = (y: number) => tableInfo.findIndex((t) => y > t.headBottom + 1 && y < t.bottom - 1 && t.headBottom > 0);

  interface Slice {
    y0: number;
    y1: number;
    /** header band to draw above this slice, in px of the source */
    head: [number, number] | null;
  }
  const slices: Slice[] = [];
  let start = 0;
  while (start < heightPx - 1) {
    const ti = slices.length > 0 ? tableAt(start + 1) : -1;
    const head: [number, number] | null = ti >= 0 ? [tableInfo[ti].headTop, tableInfo[ti].headBottom] : null;
    const headPx = head ? head[1] - head[0] : 0;
    const room = usablePx - headPx;
    let end = Math.min(start + room, heightPx);
    if (end < heightPx) {
      const fit = cands.filter((c) => c.y > start + room * 0.3 && c.y <= end);
      if (fit.length) end = fit[fit.length - 1].y;
    }
    if (end <= start + 1) end = Math.min(start + room, heightPx); // a unit taller than a page: cut it
    slices.push({ y0: start, y1: end, head });
    start = end;
  }

  const stamp = new Date().toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  slices.forEach(({ y0, y1, head }, i) => {
    if (i > 0) pdf.addPage();
    const crop = (from: number, to: number) => {
      const sy = Math.round(from * SCALE);
      const sh = Math.max(1, Math.round((to - from) * SCALE));
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = sh;
      part.getContext("2d")!.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
      return part.toDataURL("image/jpeg", 0.92);
    };
    let yMm = i === 0 ? MX : MT;
    if (head) {
      const h = (head[1] - head[0]) * mmPerPx;
      pdf.addImage(crop(head[0], head[1]), "JPEG", MX, yMm, pageW - 2 * MX, h);
      yMm += h;
    }
    pdf.addImage(crop(y0, y1), "JPEG", MX, yMm, pageW - 2 * MX, (y1 - y0) * mmPerPx);

    pdf.setFontSize(7.5);
    pdf.setTextColor(110);
    if (i > 0 && meta.header) pdf.text(meta.header, MX, 9);
    pdf.text(`Generated ${stamp} · Interim, system-generated report: subject to update`, MX, pageH - 7);
    pdf.text(`Page ${i + 1} of ${slices.length}`, pageW - MX, pageH - 7, { align: "right" });
  });
  pdf.save(filename);
}
