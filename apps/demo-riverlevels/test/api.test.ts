import { describe, expect, it } from "vitest";
import type { LevelsResponse, River } from "../src/types";
import { app } from "../src/worker";

describe("GET /api/levels", () => {
  it("lists every river as JSON", async () => {
    const res = await app.request("/api/levels");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as LevelsResponse;
    expect(body.rivers.map((r) => r.id)).toEqual([
      "snake-moose",
      "yellowstone-livingston",
      "green-labarge",
      "salmon-whitebird",
    ]);
    expect(body.updatedAt).toBe("2026-10-12T14:00:00Z");
  });

  it("reads 6.2 ft, 4,810 cfs and 51°F on the Snake River at Moose", async () => {
    const body = (await (await app.request("/api/levels")).json()) as LevelsResponse;
    const snake = body.rivers.find((r) => r.id === "snake-moose");
    expect(snake).toMatchObject({
      name: "Snake River",
      site: "Moose, WY",
      stage: { value: 6.2, unit: "ft" },
      flow: { value: 4810, unit: "cfs" },
      temp: { value: 51, unit: "°F" },
    });
  });

  it("keeps every reading inside its gauge's range", async () => {
    const body = (await (await app.request("/api/levels")).json()) as LevelsResponse;
    for (const river of body.rivers) {
      for (const reading of [river.stage, river.flow, river.temp]) {
        expect(reading.min).toBeLessThan(reading.max);
        expect(reading.value).toBeGreaterThanOrEqual(reading.min);
        expect(reading.value).toBeLessThanOrEqual(reading.max);
      }
      expect(Number.isNaN(Date.parse(river.updatedAt))).toBe(false);
    }
  });
});

describe("GET /api/levels/:id", () => {
  it("returns one river", async () => {
    const res = await app.request("/api/levels/salmon-whitebird");
    expect(res.status).toBe(200);
    const river = (await res.json()) as River;
    expect(river.name).toBe("Salmon River");
    expect(river.stage.alertAt).toBe(8.5);
  });

  it("answers an unknown river with a JSON 404", async () => {
    const res = await app.request("/api/levels/mississippi-nowhere");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
