import packageJson from "../package.json" with { type: "json" };

export const version: string = packageJson.version;
/** Sent with every request, so the server's logs tell CLI versions apart. */
export const userAgent = `lobbystack-cli/${version}`;
