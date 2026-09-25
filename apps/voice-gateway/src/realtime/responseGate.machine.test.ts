import { describe, expect, it } from "vitest";

import {
  createRealtimeResponseGate,
  getRealtimeResponseGateStatus,
  isRealtimeResponseInFlight,
  markRealtimeConversationInput,
  peekDeferredRealtimeResponse,
  markRealtimeResponseCreated,
  releaseUnconfirmedRealtimeResponse,
  requestRealtimeResponse,
  requeueRejectedRealtimeCreate,
  resetRealtimeResponseGate,
  takeDeferredRealtimeResponse,
  type RealtimeResponseGate,
  type RealtimeResponseGateStatus,
} from "./responseGate";

// Drives a gate into each state so the transition table can be asserted from a
// known starting point rather than from whatever a previous case left behind.
function gateIn(status: RealtimeResponseGateStatus): RealtimeResponseGate {
  const gate = createRealtimeResponseGate();
  if (status === "idle") return gate;

  requestRealtimeResponse(gate, undefined, "evt_seed");
  if (status === "requested") return gate;
  if (status === "queued") {
    requeueRejectedRealtimeCreate(gate, "evt_seed");
    return gate;
  }
  markRealtimeResponseCreated(gate, "resp_seed");
  return gate;
}

const ALL_STATUSES: Array<RealtimeResponseGateStatus> = [
  "idle",
  "requested",
  "active",
  "queued",
];

describe("realtime response gate state machine", () => {
  it("puts each seeded gate in the state it claims", () => {
    for (const status of ALL_STATUSES) {
      expect(getRealtimeResponseGateStatus(gateIn(status))).toBe(status);
    }
  });

  it("posts a request only from idle, and queues it everywhere else", () => {
    for (const status of ALL_STATUSES) {
      const gate = gateIn(status);
      const posted = requestRealtimeResponse(gate, { instructions: "x" }, "evt");
      expect(posted).toBe(status === "idle");
      expect(getRealtimeResponseGateStatus(gate)).toBe(
        status === "idle" ? "requested" : status,
      );
    }
  });

  it("moves to active from every state when a response is created", () => {
    for (const status of ALL_STATUSES) {
      const gate = gateIn(status);
      markRealtimeResponseCreated(gate, "resp_new");
      expect(getRealtimeResponseGateStatus(gate)).toBe("active");
    }
  });

  it("only releases a create from requested, and only when named", () => {
    for (const status of ALL_STATUSES) {
      const gate = gateIn(status);
      const released = releaseUnconfirmedRealtimeResponse(gate, "evt_seed");
      expect(released.released).toBe(status === "requested");
    }

    const gate = gateIn("requested");
    expect(releaseUnconfirmedRealtimeResponse(gate, "evt_other").released).toBe(
      false,
    );
  });

  it("only requeues a rejected create from requested, and only when named", () => {
    for (const status of ALL_STATUSES) {
      const gate = gateIn(status);
      expect(requeueRejectedRealtimeCreate(gate, "evt_seed")).toBe(
        status === "requested",
      );
    }

    const gate = gateIn("requested");
    expect(requeueRejectedRealtimeCreate(gate, "evt_other")).toBe(false);
  });

  it("returns every state to idle on reset", () => {
    for (const status of ALL_STATUSES) {
      const gate = gateIn(status);
      resetRealtimeResponseGate(gate);
      expect(getRealtimeResponseGateStatus(gate)).toBe("idle");
      expect(isRealtimeResponseInFlight(gate)).toBe(false);
    }
  });
});

// The failure mode behind most of this gate's history is a state combination
// that never reopens, so the call goes silent. These drive long pseudo-random
// event sequences and assert the two properties that matter.
describe("realtime response gate invariants", () => {
  type GateEvent =
    | { name: "request"; forced: boolean; bare: boolean }
    | { name: "created" }
    | { name: "done" }
    | { name: "rejectedBenign" }
    | { name: "rejectedHard" }
    | { name: "input" }
    | { name: "reset" };

  const EVENTS: Array<GateEvent> = [
    { name: "request", forced: false, bare: true },
    { name: "request", forced: false, bare: false },
    { name: "request", forced: true, bare: false },
    { name: "created" },
    { name: "done" },
    { name: "rejectedBenign" },
    { name: "rejectedHard" },
    { name: "input" },
    { name: "reset" },
  ];

  // Deterministic, so a failure is reproducible from its seed alone.
  function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
  }

  function run(seed: number): RealtimeResponseGate {
    const random = makeRandom(seed);
    const gate = createRealtimeResponseGate();
    let eventCounter = 0;

    for (let step = 0; step < 200; step += 1) {
      const event = EVENTS[Math.floor(random() * EVENTS.length)]!;
      eventCounter += 1;
      const eventId = `evt_${eventCounter}`;
      const responseId = `resp_${eventCounter}`;
      const before = getRealtimeResponseGateStatus(gate);

      switch (event.name) {
        case "request": {
          const request = event.bare ? undefined : { instructions: "x" };
          const posted = requestRealtimeResponse(gate, request, eventId, {
            forced: event.forced,
          });
          // Safety: a create is authorised only when nothing was outstanding.
          expect(posted).toBe(before === "idle");
          break;
        }
        case "created":
          markRealtimeResponseCreated(gate, responseId);
          break;
        case "done": {
          const taken = takeDeferredRealtimeResponse(gate, {
            responseId,
            eventId,
          });
          // A drained request immediately becomes the outstanding create.
          if (taken.post) {
            expect(getRealtimeResponseGateStatus(gate)).toBe("requested");
          }
          break;
        }
        case "rejectedBenign":
          requeueRejectedRealtimeCreate(gate, eventId);
          break;
        case "rejectedHard": {
          const released = releaseUnconfirmedRealtimeResponse(gate, eventId);
          if (released.released) {
            expect(before).toBe("requested");
          }
          break;
        }
        case "input":
          markRealtimeConversationInput(gate);
          break;
        case "reset":
          resetRealtimeResponseGate(gate);
          break;
      }
    }

    return gate;
  }

  it("authorises a create only when nothing is outstanding", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      expect(() => run(seed)).not.toThrow();
    }
  });

  it("never silently drops a queued terminal message", () => {
    // Findings in this gate's history were terminal messages that were queued
    // and then discarded by a later transition, leaving the call to hang up
    // without speaking. A queued terminal message may only leave the queue by
    // being posted, by being replaced by another terminal message, or by an
    // explicit reset that ends the call.
    for (let seed = 1; seed <= 50; seed += 1) {
      const random = makeRandom(seed);
      const gate = createRealtimeResponseGate();
      let eventCounter = 0;

      for (let step = 0; step < 200; step += 1) {
        const event = EVENTS[Math.floor(random() * EVENTS.length)]!;
        eventCounter += 1;
        const eventId = `evt_${eventCounter}`;
        const responseId = `resp_${eventCounter}`;
        const terminalQueuedBefore =
          peekDeferredRealtimeResponse(gate)?.forced === true;
        let terminalPosted = false;

        switch (event.name) {
          case "request": {
            const request = event.bare ? undefined : { instructions: "x" };
            requestRealtimeResponse(gate, request, eventId, {
              forced: event.forced,
            });
            terminalPosted = event.forced;
            break;
          }
          case "created":
            markRealtimeResponseCreated(gate, responseId);
            break;
          case "done": {
            const taken = takeDeferredRealtimeResponse(gate, {
              responseId,
              eventId,
            });
            terminalPosted = taken.post && taken.forced;
            break;
          }
          case "rejectedBenign":
            requeueRejectedRealtimeCreate(gate, eventId);
            break;
          case "rejectedHard": {
            const released = releaseUnconfirmedRealtimeResponse(gate, eventId);
            terminalPosted = released.post && released.forced;
            break;
          }
          case "input":
            markRealtimeConversationInput(gate);
            break;
          case "reset":
            resetRealtimeResponseGate(gate);
            terminalPosted = true; // the call is ending; the queue goes with it
            break;
        }

        const terminalQueuedAfter =
          peekDeferredRealtimeResponse(gate)?.forced === true;
        if (terminalQueuedBefore && !terminalQueuedAfter && !terminalPosted) {
          throw new Error(
            `seed ${seed} step ${step}: queued terminal message dropped by ${event.name}`,
          );
        }
      }
    }
  });

  it("can always be reopened by the events a live call produces", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const gate = run(seed);

      // Whatever state a call lands in, the provider events that follow have to
      // be able to return it to idle. A gate that cannot is a silent call.
      let guard = 0;
      while (isRealtimeResponseInFlight(gate) && guard < 8) {
        const responseId = `resp_drain_${guard}`;
        markRealtimeResponseCreated(gate, responseId);
        takeDeferredRealtimeResponse(gate, { responseId });
        guard += 1;
      }

      expect(isRealtimeResponseInFlight(gate)).toBe(false);
    }
  });
});
