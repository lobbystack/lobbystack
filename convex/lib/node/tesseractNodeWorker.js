"use node";
"use strict";

const { parentPort } = require("worker_threads");
const worker = require("tesseract.js/src/worker-script");
const getCore = require("tesseract.js/src/worker-script/node/getCore");
const gunzip = require("tesseract.js/src/worker-script/node/gunzip");
const cache = require("tesseract.js/src/worker-script/node/cache");

if (parentPort) {
  parentPort.on("message", (packet) => {
    worker.dispatchHandlers(packet, (obj) => parentPort.postMessage(obj));
  });

  worker.setAdapter({
    getCore,
    gunzip,
    fetch: global.fetch.bind(global),
    ...cache,
  });
}
