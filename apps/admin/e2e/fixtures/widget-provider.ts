import { createServer, type Server } from "node:http";

type ChatMessage = { role: string; content?: string | null; tool_calls?: unknown[] };
type ChatRequest = { model: string; messages: ChatMessage[]; tools?: Array<{ function: { name: string } }> };
type ScriptedTurn = { kind: "text"; text: string } | { kind: "tool"; name: string; arguments: Record<string, unknown> };

// A tiny stand-in for the agent's model. It follows one script: look up
// openings for a date, book the first one when asked, or pass on a request.
// Anything else gets the plain opening-hours reply the widget test expects.
function scriptedTurn(body: ChatRequest): ScriptedTurn {
  const french = body.messages.some(message => (message.content ?? "").includes("Reply in French"));
  const tools = new Set((body.tools ?? []).map(tool => tool.function.name));
  const userText = [...body.messages].reverse().find(message => message.role === "user")?.content ?? "";
  const toolResults = body.messages.filter(message => message.role === "tool").map(message => JSON.parse(message.content ?? "{}") as Record<string, unknown>);
  const lastResult = body.messages.at(-1)?.role === "tool" ? toolResults.at(-1) : undefined;
  const date = userText.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (lastResult) {
    const openings = lastResult.openings as Array<{ startsAt: string; displayTime: string }> | undefined;
    if (/book it/i.test(userText) && openings?.[0] && tools.has("bookAppointment")) {
      return { kind: "tool", name: "bookAppointment", arguments: { serviceName: "Drain cleaning", startsAt: openings[0].startsAt, contactName: "Sam Lee", contactPhone: "+14165550100" } };
    }
    if (openings) return { kind: "text", text: openings[0] ? `I have ${openings[0].displayTime} open.` : "Nothing is open that day." };
    if (lastResult.appointmentId) return { kind: "text", text: "You're booked. See you then." };
    if (lastResult.inboxItemId) return { kind: "text", text: "I've passed your request to the team." };
    return { kind: "text", text: "That didn't work." };
  }
  if (date && tools.has("findAvailability")) return { kind: "tool", name: "findAvailability", arguments: { serviceName: "Drain cleaning", date, preferredTime: "09:00" } };
  if (date && tools.has("requestAppointment")) return { kind: "tool", name: "requestAppointment", arguments: { serviceName: "Drain cleaning", preferredTime: `${date} morning`, callerName: "Sam Lee", callbackPhone: "+14165550100" } };
  return { kind: "text", text: french ? "Nous sommes ouverts en semaine." : "We are open weekdays." };
}

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
    const body = JSON.parse(raw) as ChatRequest;
    requests.push(body.model);
    const turn = scriptedTurn(body);
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const base = { id: "chatcmpl-local-fixture", object: "chat.completion.chunk", created: 1788532200, model: body.model };
    const usage = { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 };
    if (turn.kind === "tool") {
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `call_${requests.length}`, type: "function", function: { name: turn.name, arguments: JSON.stringify(turn.arguments) } }] }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage })}\n\n`);
    } else {
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: turn.text.slice(0, 10) }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: turn.text.slice(10) }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(18090, "0.0.0.0", resolve); });
  return { server, requests };
}
