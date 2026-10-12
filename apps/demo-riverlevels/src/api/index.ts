import { Hono } from "hono";
import { level, levels } from "./levels";

export const api = new Hono();

api.get("/levels", levels);
api.get("/levels/:id", level);
