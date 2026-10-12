# Headwaters agent sandbox (Sandbox SDK 1.0, durable_object scheduling).
# Every Channel, review and Confluence run gets its own container from this image.
# The container has no direct Internet access: git, npm and AI Gateway traffic is
# routed through the Worker's Outbound entrypoint, which holds the credentials.
FROM node:24-trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep jq procps \
  && rm -rf /var/lib/apt/lists/*

# pnpm for tests, Claude Code (pinned) for live mode, wrangler for preview uploads.
RUN npm install --global pnpm@11.18.0 @anthropic-ai/claude-code@2.1.280 wrangler@4.149.0 \
  && npm cache clean --force

# Sandbox SDK 1.0 shim (Files, process control). Tag matches @cloudflare/sandbox.
COPY --from=docker.io/cloudflare/sandbox:1.0.0 /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim

# Small helpers the agents call: braid-line (declare Lines) and braid-apply (scripted mode).
COPY bin/ /usr/local/bin/
RUN chmod +x /usr/local/bin/braid-* \
  && git config --system init.defaultBranch main \
  && git config --system advice.detachedHead false \
  && git config --system pull.rebase true

WORKDIR /workspace
CMD ["sleep", "infinity"]
