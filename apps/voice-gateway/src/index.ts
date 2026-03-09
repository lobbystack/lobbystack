import { createServer } from "./http/server";

const server = createServer();

const port = Number(process.env.PORT ?? 3001);

server.listen({ port, host: "0.0.0.0" }).catch((error: unknown) => {
  const unknownError = error instanceof Error ? error : new Error(String(error));
  server.log.error(unknownError);
  process.exitCode = 1;
});
