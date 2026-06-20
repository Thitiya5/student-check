/**
 * Shared PDF document header — same layout on every page / export type.
 */
import {
  SCHOOL_LOGO_SRC,
  SCHOOL_NAME_TH,
  SCHOOL_TAGLINE_TH,
  APP_THEME_COLOR
} from '../config/schoolBranding.js';

/** @param {string} s */
export function escapePdfHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{
 *   title: string,
 *   metaLines?: { label: string, value: string }[],
 *   logoSize?: number,
 *   nameSize?: number,
 *   tagSize?: number,
 *   titleSize?: number,
 *   metaSize?: number,
 *   marginBottom?: number,
 *   monochrome?: boolean,
 * }} opts
 */
export function buildPdfDocumentHeaderHtml(opts) {
  const {
    title,
    metaLines = [],
    logoSize = 64,
    nameSize = 20,
    tagSize = 13,
    titleSize = 16,
    metaSize = 12,
    marginBottom = 14,
    monochrome = false
  } = opts;

  const brandColor = monochrome ? '#1a1a1a' : APP_THEME_COLOR;
  const borderColor = monochrome ? '#333' : APP_THEME_COLOR;

  const metaHtml = metaLines
    .filter((line) => line.label || line.value)
    .map(
      (line) =>
        `<strong>${escapePdfHtml(line.label)}:</strong> ${escapePdfHtml(line.value || '—')}`
    )
    .join('<br/>');

  return `<div class="pdf-doc-header" style="margin-bottom:${marginBottom}px;">
    <header style="display:flex;align-items:center;gap:16px;margin-bottom:16px;border-bottom:2px solid ${borderColor};padding-bottom:14px;">
      <img src="${SCHOOL_LOGO_SRC}" alt="" width="${logoSize}" height="${logoSize}" style="border-radius:12px;flex-shrink:0;" crossorigin="anonymous" />
      <div>
        <h1 style="margin:0;font-size:${nameSize}px;font-weight:700;color:${brandColor};line-height:1.2;">${escapePdfHtml(SCHOOL_NAME_TH)}</h1>
        <p style="margin:4px 0 0;font-size:${tagSize}px;color:#555;line-height:1.3;">${escapePdfHtml(SCHOOL_TAGLINE_TH)}</p>
      </div>
    </header>
    <h2 style="font-size:${titleSize}px;font-weight:700;margin:0 0 8px;line-height:1.35;">${escapePdfHtml(title)}</h2>
    ${
      metaHtml
        ? `<p style="font-size:${metaSize}px;color:#444;margin:0 0 12px;line-height:1.5;">${metaHtml}</p>`
        : ''
    }
  </div>`;
}

/**
 * หัวกระดาษแบบเดียวกับ PDF ตารางรายเดือน (กลางหน้า + สีม่วง)
 * @param {{
 *   title: string,
 *   metaLines?: { label: string, value: string }[],
 *   logoSize?: number,
 *   nameSize?: number,
 *   tagSize?: number,
 *   titleSize?: number,
 *   metaSize?: number,
 *   marginBottom?: number,
 * }} opts
 */
export function buildPdfMatrixStyleHeaderHtml(opts) {
  const {
    title,
    metaLines = [],
    logoSize = 56,
    nameSize = 18,
    tagSize = 11,
    titleSize = 15,
    metaSize = 11,
    marginBottom = 10
  } = opts;

  const metaInline = metaLines
    .filter((line) => line.label || line.value)
    .map(
      (line) =>
        `${escapePdfHtml(line.label)}: <strong>${escapePdfHtml(line.value || '—')}</strong>`
    )
    .join('&nbsp;·&nbsp; ');

  return `<header style="text-align:center;margin-bottom:${marginBottom}px;border-bottom:2px solid ${APP_THEME_COLOR};padding-bottom:8px;">
    <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
      <img src="${SCHOOL_LOGO_SRC}" alt="" width="${logoSize}" height="${logoSize}" style="border-radius:8px;flex-shrink:0;" crossorigin="anonymous" />
      <div style="text-align:left;">
        <h1 style="margin:0;font-size:${nameSize}px;font-weight:700;color:${APP_THEME_COLOR};line-height:1.2;">${escapePdfHtml(SCHOOL_NAME_TH)}</h1>
        <p style="margin:3px 0 0;font-size:${tagSize}px;color:#444;line-height:1.3;">${escapePdfHtml(SCHOOL_TAGLINE_TH)}</p>
      </div>
    </div>
    <h2 style="margin:8px 0 4px;font-size:${titleSize}px;font-weight:700;line-height:1.25;">${escapePdfHtml(title)}</h2>
    ${metaInline ? `<p style="margin:0;font-size:${metaSize}px;line-height:1.5;word-wrap:break-word;">${metaInline}</p>` : ''}
  </header>`;
}

/** @param {string} [extra] */
export function pdfPageBreakStyle(extra = '') {
  return `page-break-before:always;break-before:page;${extra}`;
}
