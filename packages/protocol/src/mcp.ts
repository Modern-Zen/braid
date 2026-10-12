// MCP tool schemas. External agents (any vendor) join a River through these
// and self-report their agent name and model. Shapes are zod raw shapes so the
// MCP server can register them directly.
import { z } from "zod";
import { STRATEGIES } from "./types.ts";

const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9]|-(?!-))*$/, "lowercase slug");
const channel = z.string().regex(/^ch-\d+$/, "channel id like ch-5");

export const McpTools = {
  "river.join": {
    description: "Join a River. Returns its main remote, AGENTS.md, and the protocol rules.",
    input: {
      river: slug.describe("River id, e.g. riverlevels"),
      agent: z.string().min(1).max(40).describe("Your agent name, e.g. claude-code"),
      model: z.string().min(1).max(80).describe("The model you are running, e.g. claude-sonnet-5-5"),
    },
  },
  "intent.list": {
    description: "List the River's Intents and their status.",
    input: { river: slug },
  },
  "intent.open": {
    description: "Open a new Intent. Headwaters forks Channels for it.",
    input: {
      river: slug,
      title: z.string().min(3).max(120),
      goal: z.string().min(3).max(2000),
      checks: z.array(z.string().max(300)).max(20).default([]),
    },
  },
  "channel.start": {
    description:
      "Take an Intent: Headwaters forks main into a new Channel repo and returns its remote, a short-lived write token, AGENTS.md and the rules.",
    input: {
      river: slug,
      intent: slug,
      strategy: z.enum(STRATEGIES).default("minimal-diff"),
    },
  },
  "line.declare": {
    description:
      "Declare the files you will touch, before you edit. Returns ok:false with overlaps if another Channel holds them; then narrow or yield.",
    input: {
      river: slug,
      channel,
      globs: z.array(z.string().min(1).max(200)).min(1).max(50),
      note: z.string().max(200).optional(),
    },
  },
  "line.release": {
    description: "Release your Lines (all, or the listed globs).",
    input: { river: slug, channel, globs: z.array(z.string()).optional() },
  },
  "logbook.write": {
    description:
      "Record why: plan, decisions, rejected approaches. Headwaters returns the Logbook number and path to commit.",
    input: {
      river: slug,
      channel,
      plan: z.string().max(4000),
      decisions: z.array(z.string().max(2000)).max(20),
      rejected: z.array(z.string().max(2000)).max(20).default([]),
      notes: z.string().max(4000).default(""),
    },
  },
  "channel.submit": {
    description: "Tell Headwaters your Channel is ready for Scout.",
    input: {
      river: slug,
      channel,
      summary: z.string().max(2000).optional(),
      costUsd: z.number().min(0).max(1000).optional(),
    },
  },
  "river.ask": {
    description: "Ask the River why: semantic search over Logbooks.",
    input: { river: slug, question: z.string().min(3).max(500) },
  },
} as const;

export type McpToolName = keyof typeof McpTools;

/** Result of line.declare, shared by MCP and the in-container CLI. */
export interface LineDeclareResult {
  ok: boolean;
  overlaps: Array<{ channelId: string; theirs: string; ours: string; path: string }>;
}
