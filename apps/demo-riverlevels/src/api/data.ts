import type { River } from "../types";

// Mock gauge data. Fixed values so tests, previews and screenshots are stable.
export const RIVERS: River[] = [
  {
    id: "snake-moose",
    name: "Snake River",
    site: "Moose, WY",
    stage: { value: 6.2, unit: "ft", min: 0, max: 10, alertAt: 9 },
    flow: { value: 4810, unit: "cfs", min: 0, max: 10000, alertAt: 8000 },
    temp: { value: 51, unit: "°F", min: 32, max: 86, alertAt: 68 },
    updatedAt: "2026-10-12T14:00:00Z",
  },
  {
    id: "yellowstone-livingston",
    name: "Yellowstone River",
    site: "Livingston, MT",
    stage: { value: 4.4, unit: "ft", min: 0, max: 12, alertAt: 9 },
    flow: { value: 2650, unit: "cfs", min: 0, max: 30000, alertAt: 20000 },
    temp: { value: 54, unit: "°F", min: 32, max: 86, alertAt: 73 },
    updatedAt: "2026-10-12T14:00:00Z",
  },
  {
    id: "green-labarge",
    name: "Green River",
    site: "La Barge, WY",
    stage: { value: 3.1, unit: "ft", min: 0, max: 8, alertAt: 6.5 },
    flow: { value: 1260, unit: "cfs", min: 0, max: 6000, alertAt: 4500 },
    temp: { value: 56, unit: "°F", min: 32, max: 86, alertAt: 70 },
    updatedAt: "2026-10-12T13:45:00Z",
  },
  {
    id: "salmon-whitebird",
    name: "Salmon River",
    site: "White Bird, ID",
    stage: { value: 8.7, unit: "ft", min: 0, max: 14, alertAt: 8.5 },
    flow: { value: 9350, unit: "cfs", min: 0, max: 40000, alertAt: 30000 },
    temp: { value: 49, unit: "°F", min: 32, max: 86, alertAt: 70 },
    updatedAt: "2026-10-12T13:30:00Z",
  },
];
