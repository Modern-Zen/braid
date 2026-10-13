// Small server-rendered pages (OAuth consent, /connect), on the Headwaters tokens.

export function page(status: number, title: string, body: string, width = 520): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Headwaters</title>
<style>
@font-face{font-family:Lora;src:url(/fonts/Lora-VariableFont.ttf) format("truetype-variations");font-weight:400 700}
@font-face{font-family:Inter;src:url(/fonts/Inter-VariableFont.ttf) format("truetype-variations");font-weight:100 900}
:root{--paper:#fafaf9;--surface:#fff;--ink:#1c1917;--ink2:#57534e;--ink3:#78716c;--line:#e7e5e4;--strong:#d6d3d1;--teal:#0d9488}
@media (prefers-color-scheme:dark){:root{--paper:#1c1917;--surface:#292524;--ink:#fafaf9;--ink2:#d6d3d1;--ink3:#a8a29e;--line:#44403c;--strong:#57534e;--teal:#2dd4bf}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 Inter,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}
main{max-width:var(--w,520px);width:100%;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:28px 32px}
.mark{font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--teal)}
h1{font:500 26px/1.15 Lora,Georgia,serif;letter-spacing:-.01em;margin:10px 0 12px}p{color:var(--ink2);margin:0 0 16px}
label{display:block;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);margin:8px 0 6px}
select,input{width:100%;padding:10px 12px;border:1px solid var(--strong);border-radius:8px;background:var(--paper);color:var(--ink);font:inherit}
.actions{display:flex;gap:8px;margin-top:18px}button{font:600 11px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:13px 20px;border-radius:8px;cursor:pointer}
.primary{background:var(--ink);color:var(--paper);border:0}.secondary{background:transparent;color:var(--ink);border:1px solid var(--strong)}
.meta{font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--ink3);margin-top:16px}
pre{background:#1c1917;color:#d6d3d1;border-radius:12px;padding:16px 18px;font:12.5px/1.7 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;margin:8px 0 20px}
h2{font:500 19px/1.3 Lora,Georgia,serif;margin:28px 0 6px}h2 small{font:12px Inter,sans-serif;color:var(--ink3);margin-left:8px}
code{font:13px ui-monospace,Menlo,Consolas,monospace}a{color:var(--teal)}
</style></head><body><main style="--w:${width}px"><div class="mark">Headwaters</div><h1>${esc(title)}</h1>${body}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY" } },
  );
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
