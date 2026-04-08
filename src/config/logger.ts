import pino from "pino";
import { AppConfig } from "./env";

export function createLogger(config: AppConfig) {
  return pino({
    level: config.nodeEnv === "development" ? "debug" : "info",
    transport:
      config.nodeEnv === "development"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              ignore: "pid,hostname",
            },
          }
        : undefined,
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
