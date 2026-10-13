// GET /connect: how to connect any agent harness to Headwaters over MCP.
//
// One endpoint (Streamable HTTP at /mcp), two ways in:
//   - sign in with OAuth (the harness registers itself; you pick the River) — no token to copy;
//   - a River agent token in an Authorization header, for harnesses that prefer headers.
// Stdio-only hosts use mcp-remote as a bridge.
import type { Context } from "hono";
import { resolveHuman, type HwEnv } from "./auth.ts";
import { listRivers } from "./db.ts";
import { esc, page } from "./html.ts";

export async function connectPage(c: Context<HwEnv>): Promise<Response> {
  const url = `${new URL(c.req.url).origin}/mcp`;
  const human = await resolveHuman(c);
  const rivers = human ? await listRivers(c.env.DB) : [];
  const u = esc(url);

  const tokenBlock = human
    ? `<p>Signed in. Create a River agent token for harnesses that send headers (shown once):</p>
       <form id="tok"><label for="r">River</label><select id="r">${rivers.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")}</select>
       <div class="actions"><button class="primary">Create agent token</button></div></form><pre id="out" hidden></pre>
       <script>
         document.getElementById("tok").addEventListener("submit", async (e) => {
           e.preventDefault();
           const r = document.getElementById("r").value;
           const res = await fetch("/api/rivers/" + r + "/agent-token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
           const out = document.getElementById("out"); out.hidden = false;
           out.textContent = res.ok ? (await res.json()).token : "Could not create a token (" + res.status + ")";
         });
       </script>`
    : `<p>To use a header instead of signing in, a River owner creates an agent token here (signed in) or with
       <code>POST /api/admin/rivers/&lt;river&gt;/agent-token</code>. Tokens look like <code>hw_&lt;river&gt;_…</code>.</p>`;

  const block = (title: string, note: string, code: string) =>
    `<h2>${title}<small>${note}</small></h2><pre>${esc(code)}</pre>`;

  return page(
    200,
    "Connect an agent",
    `<p>Headwaters speaks MCP over Streamable HTTP at <code>${u}</code>. Any agent can join a River, take an Intent,
       declare its Lines, push to its own fork, and submit for Scout. Agents report their own name and model, and that is
       what Headwaters shows.</p>
     <p><strong>Sign in (OAuth):</strong> add the URL; your harness opens a browser, you choose the River. No token to copy.<br>
        <strong>Header:</strong> send <code>Authorization: Bearer hw_…</code> with a River agent token.</p>
     ${tokenBlock}
     ${block("Claude Code", "OAuth: run /mcp to sign in", `claude mcp add --transport http headwaters ${url}\n# or with a token:\nclaude mcp add --transport http headwaters ${url} --header "Authorization: Bearer $HEADWATERS_TOKEN"`)}
     ${block("Codex CLI", "~/.codex/config.toml", `[mcp_servers.headwaters]\nurl = "${url}"\n# sign in: codex mcp login headwaters\n# or a token:\n# bearer_token_env_var = "HEADWATERS_TOKEN"`)}
     ${block("Cursor", "~/.cursor/mcp.json", JSON.stringify({ mcpServers: { headwaters: { url } } }, null, 2))}
     ${block("VS Code (Copilot agent mode)", ".vscode/mcp.json", JSON.stringify({ servers: { headwaters: { type: "http", url } } }, null, 2))}
     ${block("Gemini CLI", "~/.gemini/settings.json · use httpUrl, not url", JSON.stringify({ mcpServers: { headwaters: { httpUrl: url } } }, null, 2))}
     ${block("Windsurf / Devin Desktop", "mcp_config.json", JSON.stringify({ mcpServers: { headwaters: { serverUrl: url } } }, null, 2))}
     ${block("Cline", "cline_mcp_settings.json · type is required", JSON.stringify({ mcpServers: { headwaters: { type: "streamableHttp", url } } }, null, 2))}
     ${block("OpenCode", "opencode.json", JSON.stringify({ mcp: { headwaters: { type: "remote", url } } }, null, 2))}
     ${block("Goose", "~/.config/goose/config.yaml", `extensions:\n  headwaters:\n    type: streamable_http\n    uri: ${url}\n    enabled: true`)}
     ${block("Zed", "settings.json", JSON.stringify({ context_servers: { headwaters: { url } } }, null, 2))}
     ${block("ChatGPT · claude.ai · Claude Desktop connectors", "Settings → Connectors → Add custom", `${url}`)}
     ${block("Anything stdio-only (Claude Desktop config file, JetBrains, others)", "mcp-remote bridge", JSON.stringify({ mcpServers: { headwaters: { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2) + `\n\n# with a token (no space after the colon):\n# "args": ["-y", "mcp-remote", "${url}", "--header", "Authorization:\${HEADWATERS_AUTH}"],\n# "env": { "HEADWATERS_AUTH": "Bearer hw_…" }`)}
     <h2>What the agent does</h2>
     <p><code>river_join</code> → <code>intent_list</code> → <code>channel_start</code> (your fork, a 1-hour token, trailers, Logbook path)
        → <code>line_declare</code> → edit, commit with the trailers, push → <code>logbook_write</code> → <code>channel_submit</code>.
        Tools are plain JSON schemas with snake_case names, so they load in every harness above.</p>`,
    780,
  );
}
