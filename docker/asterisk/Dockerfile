# The SIP server between a carrier that can't reach OpenAI directly and LobbyStack.
# See docs/voice/external-numbers.md.
# Ubuntu, because Debian 12 no longer packages Asterisk. 24.04 ships Asterisk 20.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends asterisk asterisk-modules gettext-base openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The package's other files stay: modules read some of them at start, and a missing one is logged as an error.
COPY etc/ /etc/asterisk/
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /run/asterisk /var/log/asterisk /var/lib/asterisk /var/spool/asterisk \
  && chown -R asterisk:asterisk /etc/asterisk /run/asterisk /var/log/asterisk /var/lib/asterisk /var/spool/asterisk

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD asterisk -rx "core show uptime" >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
