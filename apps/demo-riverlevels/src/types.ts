// Shapes shared by the API and the UI.

export type GaugeKind = "stage" | "flow" | "temp";

/** One gauge reading in US units: feet (stage), cubic feet per second (flow), °F (temp). */
export interface Reading {
  value: number;
  unit: "ft" | "cfs" | "°F";
  /** The gauge's scale. The bar is drawn as the reading's share of max - min. */
  min: number;
  max: number;
  /** Flood stage, high flow or warm water: at or above it the gauge shows an alert. */
  alertAt?: number;
}

export interface River {
  id: string;
  name: string;
  site: string;
  stage: Reading;
  flow: Reading;
  temp: Reading;
  /** ISO 8601, UTC. */
  updatedAt: string;
}

export interface LevelsResponse {
  rivers: River[];
  updatedAt: string;
}
