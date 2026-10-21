import { describe, expect, it } from "vitest";

import { TEAM_CHAT_QUIET_MS, teamChatWentQuiet } from "./widgetLiveChat";

const joined = new Date("2026-10-15T12:00:00.000Z");
const after = (ms: number) => new Date(joined.getTime() + ms);

describe("teamChatWentQuiet", () => {
  it("gives the team the quiet spell from when they joined the visitor who asked for them", () => {
    const chat = { teamRequestedAt: null, teamJoinedAt: joined, automationPausedAt: joined, lastTeamMessageAt: null };
    expect(teamChatWentQuiet(chat, after(TEAM_CHAT_QUIET_MS - 1))).toBe(false);
    expect(teamChatWentQuiet(chat, after(TEAM_CHAT_QUIET_MS))).toBe(true);
  });

  it("starts the quiet spell again with each message from the team", () => {
    const chat = { teamRequestedAt: null, teamJoinedAt: joined, automationPausedAt: joined, lastTeamMessageAt: after(30 * 60_000) };
    expect(teamChatWentQuiet(chat, after(30 * 60_000 + TEAM_CHAT_QUIET_MS - 1))).toBe(false);
    expect(teamChatWentQuiet(chat, after(30 * 60_000 + TEAM_CHAT_QUIET_MS))).toBe(true);
  });

  it("never applies while a visitor waits for someone to join", () => {
    expect(teamChatWentQuiet({ teamRequestedAt: joined, teamJoinedAt: null, automationPausedAt: joined, lastTeamMessageAt: null }, after(24 * 60 * 60_000))).toBe(false);
  });

  it("never applies to a chat the team took over on its own, however long it stays quiet", () => {
    expect(teamChatWentQuiet({ teamRequestedAt: null, teamJoinedAt: null, automationPausedAt: joined, lastTeamMessageAt: null }, after(24 * 60 * 60_000))).toBe(false);
    expect(teamChatWentQuiet({ teamRequestedAt: null, teamJoinedAt: null, automationPausedAt: null, lastTeamMessageAt: null }, joined)).toBe(false);
  });
});
