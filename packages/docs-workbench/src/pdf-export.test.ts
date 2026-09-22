import { describe, expect, test } from "bun:test";
import { handlePdfExport } from "./pdf-export";

describe("offline PDF endpoint", () => {
  test("rejects cross-origin requests before parsing print data", async () => {
    const request = new Request("http://localhost/api/export-pdf", { method: "POST", body: '{"html":"hello"}' });
    request.headers.set("origin", "https://example.com");
    const response = await handlePdfExport(request);
    expect(response.status).toBe(403);
  });
  test("rejects invalid payloads and methods", async () => {
    expect((await handlePdfExport(new Request("http://localhost/api/export-pdf"))).status).toBe(405);
    for (const body of ["bad json", "{}", '{"html":4}', '{"html":""}']) {
      expect((await handlePdfExport(new Request("http://localhost/api/export-pdf", { method: "POST", body }))).status).toBe(400);
    }
  });
  test("bounds actual body size even without Content-Length", async () => {
    const body = "x".repeat(20 * 1024 * 1024 + 1);
    expect((await handlePdfExport(new Request("http://localhost/api/export-pdf", { method: "POST", body }))).status).toBe(413);
  });
});
