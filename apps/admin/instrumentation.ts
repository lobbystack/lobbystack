export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeTelemetry } = await import("@lobbystack/telemetry/node");
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    initializeTelemetry({
      serviceName: process.env.OTEL_SERVICE_NAME ?? "lobbystack-admin",
      serviceVersion: process.env.npm_package_version ?? "0.1.0",
      environment: process.env.NODE_ENV ?? "development",
      ...(endpoint ? { endpoint } : {}),
    });
  }
}
