// MCP tool schemas. External agents (any vendor, any harness) join a River through these and
// self-report their agent name and model.
//
// Portable on purpose: snake_case names without dots (Claude's API rejects dots), plain types
// only (no regex patterns, formats or defaults, which some clients reject or drop), optional
// fields instead of defaults, and short descriptions. Values are validated in the handlers.
import { z } from "zod";
import { STRATEGIES } from "./types.ts";

const river = z.string().optional().describe("River id. Optional: your token is already scoped to one River.");
const channel = z.string().describe("Your Channel id from channel_start, e.g. ch-10");

export const McpTools = {
  river_join: {
    title: "Join the River",
    readOnly: false,
    description: "Join the River: returns its main repo, AGENTS.md, the protocol rules and the open Intents. Call this first.",
    input: {
      river,
      agent: z.string().describe("Your agent name, shown on your Channel, e.g. codex"),
      model: z.string().describe("The model you are running, e.g. gpt-5-codex"),
    },
  },
  intent_list: {
    title: "List Intents",
    readOnly: true,
    description: "List the River's Intents (units of work) with their status and Channels.",
    input: { river },
  },
  intent_open: {
    title: "Open an Intent",
    readOnly: false,
    description: "Open a new Intent: a goal and acceptance checks. Then take it with channel_start.",
    input: {
      river,
      title: z.string().describe("Short title, e.g. Add a dark mode"),
      goal: z.string().describe("What should change and why"),
      checks: z.array(z.string()).optional().describe("Acceptance checks"),
    },
  },
  channel_start: {
    title: "Take an Intent",
    readOnly: false,
    description:
      "Take an Intent: Headwaters forks main into your own Channel repo and returns its git remote, a 1-hour write token, the commit trailers, your Logbook path and the rules.",
    input: {
      river,
      intent: z.string().describe("Intent id from intent_list, e.g. dark-mode"),
      agent: z.string().describe("Your agent name, e.g. codex"),
      model: z.string().describe("The model you are running"),
      strategy: z.enum(STRATEGIES).optional().describe("Your approach. Default minimal-diff."),
    },
  },
  line_declare: {
    title: "Declare Lines",
    readOnly: false,
    description:
      "Before editing, declare the files you will touch (paths or globs). ok:false lists Channels of other Intents already holding them: narrow your globs or work around them.",
    input: {
      river,
      channel,
      globs: z.array(z.string()).describe('Paths or globs, e.g. ["src/theme/*", "src/components/Gauge.tsx"]'),
      note: z.string().optional().describe("Why, in a few words"),
    },
  },
  line_release: {
    title: "Release Lines",
    readOnly: false,
    description: "Release your Lines: all of them, or the listed globs.",
    input: { river, channel, globs: z.array(z.string()).optional() },
  },
  logbook_write: {
    title: "Write the Logbook",
    readOnly: false,
    description: "Record why: your plan, decisions and rejected approaches. Returns the file content and path to commit with your last commit.",
    input: {
      river,
      channel,
      plan: z.string(),
      decisions: z.array(z.string()),
      rejected: z.array(z.string()).optional(),
      notes: z.string().optional(),
    },
  },
  channel_submit: {
    title: "Submit for Scout",
    readOnly: false,
    description: "After your last push: tell Headwaters your Channel is ready. Scout compares it with the other Channels of the Intent.",
    input: {
      river,
      channel,
      summary: z.string().optional(),
      costUsd: z.number().optional().describe("What your run cost, if you know"),
    },
  },
  river_ask: {
    title: "Ask the River",
    readOnly: true,
    description: "Ask why something is the way it is: searches the River's Logbooks (plans and decisions).",
    input: { river, question: z.string() },
  },
} as const;

export type McpToolName = keyof typeof McpTools;

/** Result of line_declare, shared by MCP and the in-container CLI. */
export interface LineDeclareResult {
  ok: boolean;
  overlaps: Array<{ channelId: string; theirs: string; ours: string; path: string }>;
}
