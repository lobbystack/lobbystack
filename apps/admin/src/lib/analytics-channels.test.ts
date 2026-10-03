import { describe, expect, it } from "vitest";

import { channelPercentages } from "./analytics-channels";

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);

describe("channelPercentages", () => {
  it("adds up to 100 when plain rounding would not", () => {
    const shares = channelPercentages({ phone_call: 1, web_call: 1, sms: 1, web_chat: 0, other: 0 });
    expect(shares).toEqual({ phone_call: 34, web_call: 33, sms: 33, web_chat: 0, other: 0 });
    expect(sum(shares)).toBe(100);
  });

  it("gives website chat and web calls their own share", () => {
    expect(channelPercentages({ phone_call: 2, web_call: 1, sms: 2, web_chat: 5, other: 0 })).toEqual({ phone_call: 20, web_call: 10, sms: 20, web_chat: 50, other: 0 });
  });

  it("returns zeros with no activity and ignores missing channels", () => {
    expect(channelPercentages({})).toEqual({ phone_call: 0, web_call: 0, sms: 0, web_chat: 0, other: 0 });
    expect(sum(channelPercentages({ web_chat: 7 }))).toBe(100);
  });
});
