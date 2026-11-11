/**
 * Public URLs that more than one surface prints, single-sourced so the
 * landing footer and the PDF report cannot drift apart.
 *
 * opencanopy.ca has no methodology route; the methodology is METHODOLOGY.md
 * in the public repository.
 */

/** The published methodology, as a full https URL (for href). */
export const METHODOLOGY_URL =
  "https://github.com/ToastedandTripping/opencanopy/blob/main/METHODOLOGY.md";

/** The same URL without the scheme, for print (a PDF reader cannot rely on a link). */
export const METHODOLOGY_URL_DISPLAY = METHODOLOGY_URL.replace(/^https:\/\//, "");
