import pino from "pino";

export const logger = pino({
  name: "action-gate",
  level: process.env.LOG_LEVEL ?? "info",
});
