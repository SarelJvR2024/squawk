/** Builds a real PDF file from the on-screen report and saves it, so
 *  "Download PDF" downloads instead of opening the print dialog.
 *
 *  The report is drawn to a canvas and placed on A4 landscape pages. Page
 *  breaks fall between table rows and cards (never through one) wherever a
 *  row fits on a page, so no row is sliced in half. The text in the PDF is
 *  an image, not selectable; Print → Save as PDF keeps selectable text. */
export async function downloadReportPdf(root: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  const rootTop = root.getBoundingClientRect().top;
  const widthPx = root.scrollWidth;
  const heightPx = root.scrollHeight;
  /* Where a page may end: the bottom of every body row and card, and the
     top of every section heading (so a heading is never left alone at the
     foot of a page). Header rows are skipped for the same reason. */
  const rel = (el: Element, edge: "top" | "bottom") => el.getBoundingClientRect()[edge] - rootTop;
  const breaks = [
    ...Array.from(root.querySelectorAll<HTMLElement>("tbody tr, .rr-card")).map((el) => rel(el, "bottom")),
    ...Array.from(root.querySelectorAll<HTMLElement>("h2")).map((el) => rel(el, "top") - 6),
  ]
    .filter((y) => y > 0)
    .sort((a, b) => a - b);

  const SCALE = 2;
  const canvas = await html2canvas(root, { scale: SCALE, backgroundColor: "#FFFFFF", useCORS: true, logging: false });

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 8;
  const mmPerPx = (pageW - 2 * M) / widthPx;
  const pagePx = (pageH - 2 * M - 6) / mmPerPx; // room for the footer

  const slices: Array<[number, number]> = [];
  let start = 0;
  while (start < heightPx - 1) {
    let end = Math.min(start + pagePx, heightPx);
    if (end < heightPx) {
      const fit = breaks.filter((y) => y > start + pagePx * 0.4 && y <= end);
      if (fit.length) end = fit[fit.length - 1];
    }
    slices.push([start, end]);
    start = end;
  }

  slices.forEach(([y0, y1], i) => {
    if (i > 0) pdf.addPage();
    const sy = Math.round(y0 * SCALE);
    const sh = Math.max(1, Math.round((y1 - y0) * SCALE));
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = sh;
    part.getContext("2d")!.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", M, M, pageW - 2 * M, (y1 - y0) * mmPerPx);
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text("Squawk — TPJV for Airports Company South Africa", M, pageH - 5);
    pdf.text(`Page ${i + 1} of ${slices.length}`, pageW - M, pageH - 5, { align: "right" });
  });

  pdf.save(filename);
}
