import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Page height (pdf-lib uses bottom-up y, pdfplumber uses top-down) ─────────
const PAGE_H = 842.25;

/**
 * Field coordinates measured precisely via pdfplumber.
 * xStart / xEnd  → horizontal span of the blank line
 * y              → text baseline in pdf-lib bottom-up coords
 *                  = PAGE_H - plumber_bottom + 1
 *
 * For "date": blank starts after "Date:" label  → xStart trimmed to 170
 * For "id":   blank starts after "ID:" label    → xStart trimmed to 432
 * For "dear": blank starts after "Dear"         → xStart trimmed to 64
 * For "duration": blank starts after "Duration:"→ xStart trimmed to 130
 */
const FIELDS = {
  date:      { xStart: 170.0, xEnd: 294.0, y: PAGE_H - 121.9 + 4 },
  id:        { xStart: 432.0, xEnd: 533.0, y: PAGE_H - 124.4 + 4 },
  toName:    { xStart:  32.8, xEnd: 251.0, y: PAGE_H - 243.2 + 4 },
  dear:      { xStart:  64.0, xEnd: 167.9, y: PAGE_H - 306.5 + 4 },
  position:  { xStart: 324.0, xEnd: 530.1, y: PAGE_H - 334.5 + 4 },
  company:   { xStart:  93.5, xEnd: 245.0, y: PAGE_H - 354.0 + 4 },
  role:      { xStart:  83.7, xEnd: 217.1, y: PAGE_H - 425.4 + 4 },
  duration:  { xStart: 130.0, xEnd: 267.6, y: PAGE_H - 444.9 + 4 },
  startDate: { xStart: 123.3, xEnd: 256.6, y: PAGE_H - 483.9 + 4 },
};

/**
 * Draws text horizontally centered within a blank-line field.
 * Clamps font size down automatically if the text is too wide to fit.
 */
function drawCentered(page, font, text, field, size = 11, color = [0.05, 0.05, 0.12]) {
  const maxWidth = field.xEnd - field.xStart - 4; // 2pt padding each side
  let fontSize = size;

  // Auto-shrink if text overflows the blank
  while (font.widthOfTextAtSize(text, fontSize) > maxWidth && fontSize > 6) {
    fontSize -= 0.5;
  }

  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const centerX = (field.xStart + field.xEnd) / 2;
  const x = centerX - textWidth / 2;

  page.drawText(text, {
    x,
    y: field.y,
    size: fontSize,
    font,
    color: rgb(...color),
  });
}

/**
 * Generate a filled offer-letter PDF buffer.
 *
 * @param {{
 *   name: string,         // applicant full name  → "To," line + "Dear" line
 *   position: string,     // internship title     → "position of ___"
 *   company: string,      // company name         → "Intern at ___"
 *   role: string,         // role/domain          → "Role: ___"
 *   duration: string,     // e.g. "2 Months"      → "Duration: ___"
 *   startDate: string,    // e.g. "01 Jun 2025"   → "Start Date: ___"
 *   date: string,         // issue date           → "Date: ___"
 *   id: string,           // offer letter ID      → "ID: ___"
 *   templatePath?: string // optional custom path
 * }} data
 *
 * @returns {Promise<Buffer>}
 */
export async function generateOfferLetter(data) {
  const {
    name,
    position,
    company,
    role,
    duration,
    startDate,
    date,
    id,
    templatePath = path.join(__dirname, "../assets/offer_letter_template.pdf"),
  } = data;

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.getPages()[0];

  // ── Date & ID (top header row) ─────────────────────────────────────────────
  drawCentered(page, fontRegular, date,                FIELDS.date,      10);
  drawCentered(page, fontRegular, id,                  FIELDS.id,        10);

  // ── "To," name block ────────────────────────────────────────────────────────
  drawCentered(page, fontBold,    name,                FIELDS.toName,    11);

  // ── "Dear ____" – first name only ──────────────────────────────────────────
  drawCentered(page, fontBold,    name.split(" ")[0],  FIELDS.dear,      11);

  // ── Body fields ─────────────────────────────────────────────────────────────
  drawCentered(page, fontBold,    position,            FIELDS.position,  10);
  drawCentered(page, fontBold,    company,             FIELDS.company,   10);
  drawCentered(page, fontBold,    role,                FIELDS.role,      11);
  drawCentered(page, fontBold,    duration,            FIELDS.duration,  11);
  drawCentered(page, fontBold,    startDate,           FIELDS.startDate, 11);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}