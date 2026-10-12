import type { Context } from "hono";
import type { LevelsResponse } from "../types";
import { RIVERS } from "./data";

/** GET /api/levels: every river, newest reading time first in `updatedAt`. */
export function levels(c: Context) {
  const updatedAt = RIVERS.map((r) => r.updatedAt).sort().at(-1) ?? new Date(0).toISOString();
  const body: LevelsResponse = { rivers: RIVERS, updatedAt };
  return c.json(body);
}

/** GET /api/levels/:id: one river, or 404. */
export function level(c: Context) {
  const river = RIVERS.find((r) => r.id === c.req.param("id"));
  if (!river) return c.json({ error: "not_found" }, 404);
  return c.json(river);
}
