/** Renew only while the browser's media connection is confirmed connected. */
export function startWebCallPresence(endpoint: string, sessionId: string, peer: RTCPeerConnection): () => void {
  const controller = new AbortController();
  const renew = () => {
    if (peer.connectionState !== "connected") return;
    void fetch(`${endpoint}/${encodeURIComponent(sessionId)}/presence`, {
      method: "POST",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2_000)]),
    }).catch(() => undefined);
  };
  renew();
  const interval = setInterval(renew, 10_000);
  return () => { clearInterval(interval); controller.abort(); };
}
