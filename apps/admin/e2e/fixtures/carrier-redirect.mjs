// Loaded with `node --import` into the admin server and the worker on the
// full-stack e2e run. Neither carrier has a base URL setting, so this sends
// their REST calls to the local fake at the network boundary, and the real
// adapters run unchanged. Twilio's SDK uses https.request; Telnyx uses fetch.
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

const fake = new URL(process.env.E2E_CARRIER_FAKE_URL);
const isCarrier = (host) => /(^|\.)(twilio|telnyx)\.com$/i.test(host ?? "");
const fakePath = (host, path) => `/carrier/${host}${path}`;

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!isCarrier(url.hostname)) return realFetch(input, init);
  const target = new URL(fakePath(url.hostname, `${url.pathname}${url.search}`), fake);
  return realFetch(input instanceof Request ? new Request(target, input) : target, init);
};

function requestOptions(target, second) {
  if (typeof target !== "string" && !(target instanceof URL)) return target;
  const url = new URL(target);
  return { hostname: url.hostname, path: `${url.pathname}${url.search}`, ...(typeof second === "object" ? second : {}) };
}

const realRequest = https.request;
https.request = function request(...args) {
  const options = requestOptions(args[0], args[1]);
  const host = options.hostname ?? options.host?.split(":")[0];
  if (!isCarrier(host)) return realRequest.apply(this, args);
  const callback = args.find((argument) => typeof argument === "function");
  // The https agent can't carry a plain http request to the fake.
  const { agent: _agent, agents: _agents, ...rest } = options;
  return http.request({ ...rest, protocol: "http:", hostname: fake.hostname, host: fake.hostname, port: fake.port, path: fakePath(host, options.path ?? "/") }, callback);
};
syncBuiltinESMExports();
