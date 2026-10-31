---
title: "LobbyStack autoalojado ahora funciona con Telnyx o Twilio"
description: "Si autoaloja LobbyStack, puede usar Telnyx para sus números, llamadas y mensajes de texto, en algunos países o en todos."
pubDate: 2026-10-30
locale: "es"
canonicalSlug: "telnyx-self-hosting"
category: "Producto"
---

Si autoaloja LobbyStack, ahora puede usar Telnyx para sus números de teléfono, llamadas y mensajes de texto. Configure `TELEPHONY_NUMBERS` para elegir los países cuyos números compra a Telnyx. Puede comprar sus números de EE. UU. a Telnyx y mantener el resto en Twilio, o pasar todos los países a Telnyx.

LobbyStack compra cada número de Telnyx y lo conecta a GPT-Live por SIP cifrado. Su recepcionista contesta las llamadas, transfiere a quienes llaman a su equipo y desvía las llamadas que no puede atender. Los mensajes de texto pasan por el mismo número, y LobbyStack registra el costo de cada llamada y cada mensaje.

LobbyStack alojado sigue en Twilio, así que los clientes alojados no tienen que cambiar nada. Para configurar Telnyx, siga la [guía de autoalojamiento](https://docs.lobbystack.com/es/self-hosting/providers).
