import { createServer, type Server } from "node:http";

export async function startWidgetProvider(): Promise<{ server: Server; requests: string[] }> {
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost:18090");
    if (url.pathname === "/widget-host") {
      const key = url.searchParams.get("key") ?? "";
      if (!/^[a-z0-9-]+$/.test(key)) { response.writeHead(400).end(); return; }
      response.setHeader("content-type", "text/html");
      const adminOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;
      response.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Disposable widget host</h1><script src="${adminOrigin}/embed.js" data-base-url="${adminOrigin}" data-widget-key="${key}"></script></body></html>`);
      return;
    }
    if (url.pathname !== "/v1/chat/completions" || request.headers.authorization !== "Bearer local-widget-certification") { response.writeHead(404).end(); return; }
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw) as { model: string; messages: Array<{ content: string }> };
    requests.push(body.model);
    const french = body.messages.some(message => message.content.includes("Reply in French"));
    const reply = french ? "Nous sommes ouverts en semaine." : "We are open weekdays.";
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const base = { id: "chatcmpl-local-fixture", object: "chat.completion.chunk", created: 1788532200, model: body.model };
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: reply.slice(0, 10) }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: reply.slice(10) }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(18090, "0.0.0.0", resolve); });
  return { server, requests };
}
