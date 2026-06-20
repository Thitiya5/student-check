/**
 * Multi-page PDF rendering (canvas per page) — same approach as monthly matrix export.
 */
import html2pdf from 'html2pdf.js';
import { jsPDF } from 'jspdf';

/** @type {import('html2pdf.js').Html2PdfOptions} */
export const PDF_PORTRAIT_OPTIONS = {
  margin: [8, 8, 8, 8],
  image: { type: 'jpeg', quality: 0.92 },
  html2canvas: { scale: 2, useCORS: true, logging: false },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
};

/**
 * @param {string} pageHtml
 * @param {typeof PDF_PORTRAIT_OPTIONS} [options]
 */
export async function renderHtmlPageCanvas(pageHtml, options = PDF_PORTRAIT_OPTIONS) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = pageHtml;
  const el = wrapper.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error('PDF render failed');

  document.body.appendChild(el);
  try {
    const worker = html2pdf()
      .set({ ...options, pagebreak: { mode: [] } })
      .from(el);
    await worker.toCanvas();
    const canvas = await worker.get('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('PDF canvas failed');
    return canvas;
  } finally {
    el.remove();
  }
}

/**
 * @param {import('jspdf').jsPDF} pdf
 * @param {HTMLCanvasElement} canvas
 * @param {typeof PDF_PORTRAIT_OPTIONS} [options]
 */
export function appendCanvasToPortraitPdf(pdf, canvas, options = PDF_PORTRAIT_OPTIONS) {
  const margin = options.margin;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const innerW = pageWidth - margin[1] - margin[3];
  const innerH = pageHeight - margin[0] - margin[2];
  const imgType = options.image.type.toUpperCase();
  const imgData = canvas.toDataURL(`image/${options.image.type}`, options.image.quality);
  const aspect = canvas.height / canvas.width;
  let renderW = innerW;
  let renderH = innerW * aspect;
  if (renderH > innerH) {
    renderH = innerH;
    renderW = innerH / aspect;
  }
  pdf.addImage(imgData, imgType, margin[1], margin[0], renderW, renderH);
}

/**
 * @param {string[]} pageHtmlList
 * @param {string} filename
 * @param {typeof PDF_PORTRAIT_OPTIONS} [options]
 */
export async function saveMultiPagePortraitPdf(pageHtmlList, filename, options = PDF_PORTRAIT_OPTIONS) {
  if (!pageHtmlList.length) throw new Error('PDF has no pages');

  /** @type {import('jspdf').jsPDF} */
  let pdf = new jsPDF(options.jsPDF);

  for (let i = 0; i < pageHtmlList.length; i += 1) {
    const canvas = await renderHtmlPageCanvas(pageHtmlList[i], options);
    if (i > 0) pdf.addPage();
    appendCanvasToPortraitPdf(pdf, canvas, options);
  }

  pdf.save(filename);
}
