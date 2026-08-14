import { existsSync } from "node:fs";

/**
 * Renders HTML to a PDF buffer using Playwright's Chromium. Uses the
 * pre-installed browser at PLAYWRIGHT_BROWSERS_PATH/chromium when present
 * (common in CI/sandboxed environments) and otherwise falls back to
 * Playwright's normal browser resolution.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");

  const candidatePaths = [
    "/opt/pw-browsers/chromium",
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
  ].filter(Boolean) as string[];

  const executablePath = candidatePaths.find((p) => existsSync(p));

  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
