---
title: "LobbyStack auto-hébergé fonctionne maintenant avec Telnyx ou Twilio"
description: "Si vous auto-hébergez LobbyStack, vous pouvez utiliser Telnyx pour vos numéros, vos appels et vos textos, dans certains pays ou partout."
pubDate: 2026-10-30
locale: "fr"
canonicalSlug: "telnyx-self-hosting"
category: "Produit"
---

Si vous auto-hébergez LobbyStack, vous pouvez maintenant utiliser Telnyx pour vos numéros de téléphone, vos appels et vos textos. Réglez `TELEPHONY_NUMBERS` pour choisir les pays dont vous achetez les numéros chez Telnyx. Vous pouvez acheter vos numéros américains chez Telnyx et garder le reste chez Twilio, ou passer tous les pays à Telnyx.

LobbyStack achète chaque numéro Telnyx et le connecte à GPT-Live par SIP chiffré. Votre réceptionniste répond aux appels, transfère les appelants à votre équipe et renvoie les appels qu'elle ne peut pas prendre. Les textos passent par le même numéro, et LobbyStack enregistre le coût de chaque appel et de chaque texto.

LobbyStack hébergé reste sur Twilio : les clients hébergés n'ont rien à changer. Pour configurer Telnyx, suivez le [guide d'auto-hébergement](https://docs.lobbystack.com/fr/self-hosting/providers).
