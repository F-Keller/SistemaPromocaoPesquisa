import { createAppRuntime } from "./app";

const runtime = createAppRuntime({ startCleanupJob: false });

export default runtime.app;
