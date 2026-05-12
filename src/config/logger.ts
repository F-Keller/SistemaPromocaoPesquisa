import pino from "pino";
import { AppConfig } from "./env";

export function createLogger(config: AppConfig) {
  const isVercelRuntime = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  const usePrettyLogs = config.nodeEnv === "development" && !isVercelRuntime;

  return pino({
    level: config.nodeEnv === "development" ? "debug" : "info",
    transport:
      usePrettyLogs
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
