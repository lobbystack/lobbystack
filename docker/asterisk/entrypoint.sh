#!/bin/sh
# Renders the PJSIP configuration from the environment, then runs Asterisk in the foreground.
set -eu

fail() { echo "asterisk: $1" >&2; exit 1; }

: "${OPENAI_PROJECT_ID:?Set OPENAI_PROJECT_ID to your OpenAI project id (proj_...).}"
: "${CARRIER_IPS:?Set CARRIER_IPS to the carrier's SIP server addresses, comma separated. Only calls from them are accepted.}"

# Defaults suit production: OpenAI over TLS with encrypted audio, a carrier that sends plain UDP and RTP.
export SIP_UDP_PORT="${SIP_UDP_PORT:-5060}"
export SIP_TLS_PORT="${SIP_TLS_PORT:-5061}"
export OPENAI_HOST="${OPENAI_HOST:-sip.api.openai.com}"
export OPENAI_PORT="${OPENAI_PORT:-5061}"
export OPENAI_TRANSPORT="${OPENAI_TRANSPORT:-tls}"
export OPENAI_MEDIA_ENCRYPTION="${OPENAI_MEDIA_ENCRYPTION:-sdes}"
export CARRIER_MEDIA_ENCRYPTION="${CARRIER_MEDIA_ENCRYPTION:-no}"
export DEFAULT_COUNTRY_CODE="${DEFAULT_COUNTRY_CODE:-381}"
export CALLER_HEADER="${CALLER_HEADER:-}"
export RING_TIMEOUT="${RING_TIMEOUT:-60}"
export RTP_START="${RTP_START:-10000}"
export RTP_END="${RTP_END:-10200}"

case "$OPENAI_TRANSPORT" in udp|tls) ;; *) fail "OPENAI_TRANSPORT must be tls or udp." ;; esac
case "$OPENAI_MEDIA_ENCRYPTION" in sdes|no) ;; *) fail "OPENAI_MEDIA_ENCRYPTION must be sdes or no." ;; esac

cd /etc/asterisk
VARIABLES='${SIP_UDP_PORT} ${OPENAI_HOST} ${OPENAI_PORT} ${OPENAI_TRANSPORT} ${OPENAI_MEDIA_ENCRYPTION} ${CARRIER_MEDIA_ENCRYPTION} ${CARRIER_IPS}'
envsubst "$VARIABLES" < pjsip.conf.template > pjsip.conf

# Addresses a server behind NAT puts in its messages and audio. A server with a public address of its own needs neither.
NAT_LINES=""
: > rtp_local.conf
printf 'rtpstart=%s\nrtpend=%s\n' "$RTP_START" "$RTP_END" >> rtp_local.conf
if [ -n "${PUBLIC_IP:-}" ]; then
  NAT_LINES=$(printf 'external_signaling_address=%s\nexternal_media_address=%s' "$PUBLIC_IP" "$PUBLIC_IP")
fi
printf '%s\n' "$NAT_LINES" > pjsip_transport_local.conf

# OpenAI over TLS needs a TLS transport. A call from the carrier over TLS needs a certificate it trusts for this
# server's name. Without one, a self-signed certificate lets the transport start, which is enough for calls out.
: > pjsip_transport_tls.conf
if [ "$OPENAI_TRANSPORT" = "tls" ] || [ -n "${TLS_CERT_FILE:-}" ]; then
  if [ -n "${TLS_CERT_FILE:-}" ]; then
    # Asterisk runs as the asterisk user (uid below), so both files must be readable by it.
    [ -r "$TLS_CERT_FILE" ] || fail "Can't read TLS_CERT_FILE, $TLS_CERT_FILE."
    [ -r "${TLS_KEY_FILE:-}" ] || fail "Set TLS_KEY_FILE to a private key that exists."
    CERT="$TLS_CERT_FILE"; KEY="$TLS_KEY_FILE"
  else
    CERT=/tmp/self-signed.crt; KEY=/tmp/self-signed.key
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=lobbystack-sip" -keyout "$KEY" -out "$CERT" >/dev/null 2>&1
    chown asterisk:asterisk "$CERT" "$KEY"
  fi
  cat > pjsip_transport_tls.conf <<TLS
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:${SIP_TLS_PORT}
cert_file=${CERT}
priv_key_file=${KEY}
ca_list_file=/etc/ssl/certs/ca-certificates.crt
method=tlsv1_2
verify_server=${TLS_VERIFY_SERVER:-yes}
verify_client=no
${NAT_LINES}
TLS
fi

chown -R asterisk:asterisk /etc/asterisk /run/asterisk /var/log/asterisk
exec asterisk -f -vvv -U asterisk -G asterisk
