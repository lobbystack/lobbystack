import { describe, expect, it } from "vitest";

import { mapDialCallStatusToTransferOutcome } from "./transferOutcome";

describe("mapDialCallStatusToTransferOutcome", () => {
  it("marks completed transfers as transferred calls", () => {
    expect(mapDialCallStatusToTransferOutcome("completed")).toEqual({
      transferState: "completed",
      callStatus: "transferred",
      disposition: "transfer_completed",
    });
  });

  it("marks answered transfers as transferred calls", () => {
    expect(mapDialCallStatusToTransferOutcome("answered")).toEqual({
      transferState: "completed",
      callStatus: "transferred",
      disposition: "transfer_answered",
    });
  });

  it("marks unsuccessful transfer outcomes as failed", () => {
    expect(mapDialCallStatusToTransferOutcome("busy")).toEqual({
      transferState: "failed",
      callStatus: "completed",
      disposition: "transfer_busy",
    });
    expect(mapDialCallStatusToTransferOutcome("no-answer")).toEqual({
      transferState: "failed",
      callStatus: "completed",
      disposition: "transfer_no-answer",
    });
  });

  it("falls back safely for missing statuses", () => {
    expect(mapDialCallStatusToTransferOutcome(undefined)).toEqual({
      transferState: "failed",
      callStatus: "completed",
      disposition: "transfer_unknown",
    });
  });
});
