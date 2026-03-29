// Wraps scene content into a full HTML document for Puppeteer capture.

export function wrapInHtml(content: string, css: string, width: number, height: number): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
  ${css}
</style>
</head><body>${content}</body></html>`;
}
