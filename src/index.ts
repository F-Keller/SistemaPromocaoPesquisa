import express from "express";
import http from "node:http";
import { createAppRuntime } from "./app";

// Keep this import visible for tooling that detects Express from the entrypoint.
void express;

async function bootstrap() {
  const runtime = createAppRuntime({ startCleanupJob: true });
  const server = http.createServer(runtime.app);

  server.listen(runtime.config.port, () => {
    runtime.logger.info({ port: runtime.config.port }, "Servidor iniciado.");
  });

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    runtime.logger.info("Encerrando aplicacao...");

    server.close(async () => {
      await runtime.close();
      runtime.logger.info("Aplicacao encerrada.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
