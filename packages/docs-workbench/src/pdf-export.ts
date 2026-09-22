import { createRequire } from "node:module";
import { join } from "node:path";
import type { Browser, BrowserType } from "playwright";

let busy = false;

/** Offline printing only: no author scripts, network, cookies, or local files. */
export async function handlePdfExport(request: Request, allowedOrigins: string[] = []): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && !allowedOrigins.includes(origin)) {
    return Response.json({ detail: "PDF export requires a same-origin request." }, { status: 403 });
  }
  if (busy) return Response.json({ detail: "Another PDF is being generated. Try again shortly." }, { status: 429 });
  // Read a bounded stream rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ detail: "Missing print document." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20 * 1024 * 1024) {
      await reader.cancel();
      return Response.json({ detail: "This page exceeds the 20 MB PDF export limit." }, { status: 413 });
    }
    chunks.push(value);
  }
  let html: unknown;
  let pageNumbers = true;
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    html = body.html;
    pageNumbers = body.pageNumbers !== false;
  } catch {}
  if (typeof html !== "string" || !html.trim()) {
    return Response.json({ detail: "Missing print document." }, { status: 400 });
  }
  if (busy) return Response.json({ detail: "Another PDF is being generated. Try again shortly." }, { status: 429 });
  busy = true;
  let browser: Browser | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Resolve at runtime: Playwright's browser assets cannot be bundled into
    // the central service's single-file managed runtime.
    const runtimeRequire = createRequire(process.env.CODECAINE_DOCS_PACKAGE_ROOT
      ? join(process.env.CODECAINE_DOCS_PACKAGE_ROOT, "../docs-workbench/package.json")
      : import.meta.url);
    const { chromium } = runtimeRequire("playwright") as { chromium: BrowserType };
    try { browser = await chromium.launch({ headless: true, timeout: 20000 }); }
    catch { browser = await chromium.launch({ headless: true, channel: "chrome", timeout: 20000 }); }
    timer = setTimeout(() => { void browser?.close(); }, 60000);
    const context = await browser!.newContext({ javaScriptEnabled: false, serviceWorkers: "block", viewport: { width: 688, height: 994 } });
    await context.route("**/*", route => route.abort());
    const page = await context.newPage();
    await page.emulateMedia({ media: "print", colorScheme: "light", reducedMotion: "reduce" });
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    // Expand native disclosures and ensure embedded static HTML is not cropped.
    for (const frame of page.frames()) {
      await frame.evaluate(async () => {
        document.querySelectorAll("details").forEach(el => { el.open = true; });
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, img => img.decode()));
      });
      if (frame !== page.mainFrame()) {
        const height = await frame.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
        if (height > 970) throw new Error("Embedded HTML exceeds one PDF sheet. Split that HTML block into smaller blocks before exporting.");
        const element = await frame.frameElement();
        await element.evaluate((el, height) => { (el as HTMLElement).style.height = `${height + 8}px`; }, height);
      }
    }
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: pageNumbers, headerTemplate: "<span></span>",
      footerTemplate: '<div style="font-size:9px;color:#666;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
  } catch (error) {
    const missing = /executable|browser.*not found|doesn't exist/i.test(String(error));
    return Response.json({ detail: error instanceof Error && error.message.startsWith("Embedded HTML exceeds") ? error.message : missing
      ? "PDF printing needs Chromium. Run bunx playwright install chromium in packages/docs-workbench, then retry."
      : "PDF rendering failed. Check that the page's embedded content fits a printable page, then retry." }, { status: 500 });
  } finally {
    if (timer) clearTimeout(timer);
    await browser?.close().catch(() => {});
    busy = false;
  }
}
