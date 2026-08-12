import { createServer, type Socket } from "node:net";

import { SmtpEmailProvider } from "@lobbystack/providers";
import { handleJob } from "../apps/worker/src/handlers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function startSmtpSink(): Promise<{ port: number; messages: string[]; close: () => Promise<void> }> {
  let buffer = "";
  let dataMode = false;
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.write("220 local-sink ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (true) {
        const index = buffer.indexOf("\r\n");
        if (index < 0) return;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (dataMode) {
          if (line === ".") {
            dataMode = false;
            socket.write("250 OK\r\n");
            continue;
          }
          messages.push(line);
          continue;
        }
        const command = line.toUpperCase();
        if (command === "QUIT") {
          socket.write("221 Bye\r\n");
          socket.end();
          return;
        }
        if (command.startsWith("EHLO") || command.startsWith("HELO")) {
          socket.write("250-local-sink\r\n250 SIZE 10_000_000\r\n");
        } else if (command.startsWith("MAIL FROM") || command.startsWith("RCPT TO")) {
          socket.write("250 OK\r\n");
        } else if (command === "DATA") {
          dataMode = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (command.startsWith("RSET")) {
          socket.write("250 OK\r\n");
        } else if (command.startsWith("NOOP")) {
          socket.write("250 OK\r\n");
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object", "SMTP sink did not bind.");
  return {
    port: address.port,
    messages,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function main(): Promise<void> {
  const sink = await startSmtpSink();
  try {
    const email = new SmtpEmailProvider({ host: "127.0.0.1", port: sink.port, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" });
    const domain = { db: undefined as never };
    const first = await handleJob({ jobId: "00000000-0000-0000-0000-000000000001", type: "email.send", queue: "default", businessId: null, payload: { template: "operator_alert", to: "operator@example.test", subject: "Operator alert", variables: { message: "A live SMTP proof message." } }, trace: {}, idempotencyKey: "smtp-proof:01", scheduled: false }, { domain, email });
    const second = await handleJob({ jobId: "00000000-0000-0000-0000-000000000002", type: "email.send", queue: "default", businessId: null, payload: { template: "operator_alert", to: "operator@example.test", subject: "Operator alert", variables: { message: "A live SMTP proof message." } }, trace: {}, idempotencyKey: "smtp-proof:01", scheduled: false }, { domain, email });
    assert(first.status === "completed" && second.status === "completed", "Worker email.send did not complete against the SMTP sink.");
    const joined = sink.messages.join("\n");
    assert(joined.includes("A live SMTP proof message."), "SMTP sink did not receive the message body.");
    assert(joined.includes("operator@example.test"), "SMTP sink did not receive the recipient.");
    assert((joined.match(/Message-ID:/g) ?? []).length >= 1, "SMTP sink did not receive a Message-ID.");
    const data = joined.split("\n").map((line) => line.trim());
    const messageIds = data.filter((line) => line.startsWith("Message-ID:"));
    assert(messageIds.length === 1 || new Set(messageIds).size === 1, "Retries did not produce a stable privacy-safe Message-ID.");
    assert(data.every((line) => !line.includes("recipient-pii") && !line.includes("Bearer ") && !line.includes("password=")), "Email payload leaked sensitive markers.");
    console.log(JSON.stringify({ smtpDelivered: true, stableMessageId: true, recipientPresent: true, noSecrets: true }));
  } finally {
    await sink.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
