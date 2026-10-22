---
title: "Voces de OpenAI: la lista para GPT-Live, TTS y ChatGPT"
seoTitle: "Voces de OpenAI: lista completa de GPT-Live y ChatGPT"
description: "Voces de OpenAI a octubre de 2026: la tabla de voces de GPT-Live, las listas de Realtime y texto a voz, las nueve voces de ChatGPT y cuáles acepta la API."
pubDate: 2026-10-16T10:00:00-04:00
updatedDate: 2026-10-16T10:00:00-04:00
author: "Equipo de LobbyStack"
category: "Guías"
featured: false
coverImage: "/illustrations/openai-voices-hero.webp"
coverImageAlt: "Portada beige claro con un pequeño patrón de puntos y el título «OpenAI voices: the full list for GPT-Live, TTS and ChatGPT» en letras negras"
locale: "es"
canonicalSlug: "openai-voices"
---

Las voces de OpenAI vienen en cuatro listas, una por producto. Al 16 de octubre de 2026, GPT-Live usa `marin` por defecto y su tabla de voces agrega 21 más. La API Realtime tiene 10 voces y el servicio de texto a voz tiene 13. La aplicación ChatGPT tiene nueve voces con nombre, como Juniper y Cove, y ningún producto de la API las ofrece.

Atendemos llamadas con una recepcionista sobre GPT-Live, así que seguimos estas listas de cerca. Las tablas salen de la documentación y del SDK de OpenAI en esa fecha.

## Voces de OpenAI por producto

| Producto | Modelo | Voces | Predeterminada o recomendada |
| --- | --- | --- | --- |
| GPT-Live | `gpt-live-1` | `marin` más 21 en la tabla | `marin` por defecto |
| API Realtime | modelos `gpt-realtime` | 10 | OpenAI recomienda `marin` o `cedar` |
| Texto a voz | `gpt-4o-mini-tts` | 13 | OpenAI recomienda `marin` o `cedar` |
| Texto a voz, modelos anteriores | `tts-1`, `tts-1-hd` | 9 | No se indica |
| Aplicación ChatGPT | GPT-Live-1 y GPT-Live-1 mini | 9 voces con nombre | Usted elige una en Configuración |

Que una voz aparezca en una lista no garantiza que funcione en otra. `fable`, `nova` y `onyx` solo existen en texto a voz, y las 21 voces de la tabla siguiente solo existen en GPT-Live.

## Voces de GPT-Live

GPT-Live es el modelo de voz full-duplex de OpenAI, el que usa ChatGPT Voice. La voz se fija con `audio.output.voice` al iniciar la sesión, y para cambiarla hace falta una sesión nueva. La [tabla de voces de OpenAI](https://developers.openai.com/api/docs/guides/live-conversations#voice-options) incluye estas voces además de `marin`:

| Voz | Nombre en la API | Idioma | Influencia regional | Presentación | Origen |
| --- | --- | --- | --- | --- | --- |
| Quartz | `quartz` | Inglés | Australiana | Femenina | Generada |
| Ripple | `ripple` | Inglés | Australiana | Masculina | Natural |
| Vesper | `vesper` | Inglés | Británica | Masculina | Natural |
| Willow | `willow` | Inglés | Irlandesa | Femenina | Natural |
| Stone | `stone` | Inglés | Irlandesa | Masculina | Natural |
| Gleam | `gleam` | Inglés | Norteamericana | Femenina | Natural |
| Meridian | `meridian` | Inglés | Norteamericana | Masculina | Natural |
| Bossa | `bossa` | Portugués | Brasileña | Femenina | Natural |
| Tempo | `tempo` | Portugués | Brasileña | Masculina | Natural |
| Beacon | `beacon` | Inglés | Filipina | Masculina | Generada |
| Delta | `delta` | Inglés | Sur de EE. UU. | Femenina | Generada |
| Cinder | `cinder` | Inglés | Sur de EE. UU. | Masculina | Generada |
| Nuri | `nuri` | Alemán | No se indica | Femenina | Natural |
| Juni | `juni` | Alemán | No se indica | Femenina | Natural |
| Flitz | `flitz` | Alemán | No se indica | Masculina | Natural |
| Brise | `brise` | Francés | No se indica | Femenina | Natural |
| Sillage | `sillage` | Francés | No se indica | Masculina | Natural |
| Nira | `nira` | Hindi | No se indica | Femenina | Natural |
| Harema | `harema` | Japonés | No se indica | Femenina | Natural |
| Shida | `shida` | Japonés | No se indica | Masculina | Natural |
| Noeul | `noeul` | Coreano | No se indica | Femenina | Natural |

El [anuncio de GPT-Live de OpenAI](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471), del 10 de septiembre de 2026, presentó las primeras 12 filas. El SDK de Node de OpenAI (versión 7.35.0) también acepta los nombres anteriores de Realtime en sesiones Live: `alloy`, `ash`, `ballad`, `cedar`, `coral`, `echo`, `sage`, `shimmer` y `verse`.

La tabla no tiene voces en español. Si sus clientes llaman en español, pruebe varias voces con su propio saludo antes de elegir. La "influencia regional" describe la forma de hablar de una voz, así que una voz con influencia irlandesa sigue hablando inglés.

Las sesiones de GPT-Live cuestan [$0.05 por minuto, cobrado por segundo](https://developers.openai.com/api/docs/models/gpt-live-1), sin importar la voz.

## Voces de la API Realtime

La [API Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations#voice-options) ofrece 10 voces integradas:

`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin` y `cedar`

Puede fijar la voz al iniciar la sesión o en una respuesta. Cuando el modelo ya habló en la sesión, la voz queda fija. OpenAI recomienda `marin` o `cedar` para la mejor calidad.

## Voces de texto a voz de OpenAI

El endpoint de voz de `gpt-4o-mini-tts` tiene 13 voces integradas, según la [guía de texto a voz de OpenAI](https://developers.openai.com/api/docs/guides/text-to-speech):

`alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse`, `marin` y `cedar`

Los modelos anteriores `tts-1` y `tts-1-hd` aceptan 9: `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage` y `shimmer`. OpenAI dice que estas voces están optimizadas para inglés. Puede escuchar cada una en [OpenAI.fm](https://www.openai.fm/), el sitio de demostración de OpenAI.

El texto a voz lee un guion en voz alta. No sostiene una conversación, así que un agente telefónico hecho con él necesita reconocimiento de voz y manejo de turnos aparte. GPT-Live y la API Realtime hacen ambas cosas.

## ¿Cuáles son los nombres de las voces de ChatGPT?

La aplicación ChatGPT tiene nueve voces. El [centro de ayuda de OpenAI](https://help.openai.com/en/articles/20001274-chatgpt-voice) las describe así (descripciones traducidas del inglés):

| Voz de ChatGPT | Descripción de OpenAI |
| --- | --- |
| Arbor | Relajada y versátil |
| Breeze | Animada y sincera |
| Cove | Serena y directa |
| Ember | Segura y optimista |
| Juniper | Abierta y alegre |
| Maple | Animosa y franca |
| Sol | Hábil y tranquila |
| Spruce | Calmada y afirmativa |
| Vale | Brillante y curiosa |

Usted elige una en ChatGPT en Configuración, luego Voz. Desde el 8 de julio de 2026, ChatGPT Voice funciona con GPT-Live: [GPT-Live-1 para usuarios de pago y GPT-Live-1 mini para usuarios gratuitos](https://deploymentsafety.openai.com/gpt-live).

Una voz anterior, Sky, salió de la lista en mayo de 2024. [Bloomberg informó](https://www.bloomberg.com/news/articles/2024-05-20/openai-to-pull-johansson-soundalike-sky-s-voice-from-chatgpt) que OpenAI la pausó después de que oyentes la compararon con la voz de Scarlett Johansson.

## ¿Se pueden usar las voces de ChatGPT en la API?

No por su nombre. Al 16 de octubre de 2026, ninguno de los nueve nombres de ChatGPT aparece en la tabla de voces de GPT-Live, la lista de Realtime, la lista de texto a voz ni el tipo de voz del SDK de Node. Algunos directorios de modelos de terceros presentan a Juniper o Breeze como voces de la API de GPT-Live. La documentación de OpenAI no.

Lo que sí puede obtener es el mismo modelo. GPT-Live-1 en la API es el modelo que ChatGPT Voice usa por defecto para usuarios de pago. Para una recepcionista que suene como ChatGPT, parta de `gpt-live-1` y pruebe las voces integradas de oído. Nuestra guía para [crear una recepcionista virtual con la voz de ChatGPT](/es/blog/how-to-build-an-ai-receptionist/) cubre la parte telefónica.

## ¿Cómo se crea una voz personalizada de OpenAI?

La [guía de voces personalizadas de OpenAI](https://developers.openai.com/api/docs/guides/custom-voices) describe dos formas:

- **A partir de una descripción.** La función prompt-to-voice crea una voz a partir de un texto. Todos los clientes de la API pueden usarla, crear la voz no cuesta nada y la voz solo funciona con GPT-Live. Al usarla, paga la tarifa normal de las sesiones.
- **A partir de una grabación.** Usted sube una grabación de consentimiento, en la que la persona lee una frase fija, más una muestra. Requiere acceso a la API de voces personalizadas. La voz funciona con GPT-Live, texto a voz, la API Realtime y el audio de Chat Completions.

Las pautas de OpenAI piden no hacerse pasar por nadie, usar solo voces de adultos y avisar a los oyentes que la voz viene de una IA.

## ¿Qué voz de OpenAI conviene para la línea de un negocio?

Elija escuchando, con su propio guion. Algunas pruebas útiles:

- **Piense en quién llama.** Un negocio en Texas podría probar `delta` o `cinder`. Para llamadas en español, compare varias voces con su saludo.
- **Pruebe el saludo.** El nombre de su negocio, los nombres de calles y de servicios son donde una voz tropieza. Inclúyalos en la prueba.
- **Pruebe por teléfono.** El audio de una llamada suena más delgado que el altavoz de una computadora, así que juzgue la voz en una llamada real.
- **Cuente con una voz por llamada.** GPT-Live fija la voz para la sesión; no cambia a mitad de la llamada.

LobbyStack, nuestra recepcionista con IA, atiende cada llamada con `gpt-live-1` y la voz predeterminada, `marin`. Si la aloja usted, cambie `DEFAULT_VOICE` en [`packages/agent-core/src/live/session.ts`](https://github.com/lobbystack/lobbystack/blob/main/packages/agent-core/src/live/session.ts) por cualquier voz de GPT-Live. El código es [de código abierto con licencia MIT](/es/solutions/open-source-ai-receptionist/). Las cuentas alojadas usan `marin`; el panel no tiene selector de voz por ahora.

## Preguntas sobre las voces de OpenAI

### ¿Cuál es la voz predeterminada de OpenAI?

`marin` es la voz predeterminada de las sesiones de GPT-Live. Para la API Realtime y el texto a voz, OpenAI recomienda `marin` o `cedar` para la mejor calidad.

### ¿Se puede cambiar la voz durante una llamada?

No. GPT-Live necesita una sesión nueva para cambiar la voz. En la API Realtime, la voz queda fija cuando el modelo ya habló en la sesión.

### ¿Hay voces de OpenAI en español?

La tabla de voces de GPT-Live no incluye voces en español al 16 de octubre de 2026, y OpenAI dice que las voces de texto a voz están optimizadas para inglés. Pruebe varias voces con su saludo en español antes de elegir.

### ¿La voz de ChatGPT que se oye en TikTok está disponible para desarrolladores?

Los videos usan una de las nueve voces de la aplicación ChatGPT, y la API no ofrece esos nombres. Los desarrolladores tienen el mismo modelo GPT-Live y su propia lista de voces. Nuestro [artículo sobre GPT-Live](/es/blog/ai-voice-agent-gpt-live/) explica cómo conectamos ese modelo a una recepcionista.

## Escuche una voz de GPT-Live en una llamada

Pulse el botón de llamada de [nuestra página de inicio](/es/) para hablar con la recepcionista de LobbyStack, con `gpt-live-1` y `marin`. Para oírla atender su negocio, [cree una cuenta gratis](https://app.lobbystack.com/es/signup): el plan Free le da 30 minutos de voz al mes sin tarjeta, y un número de EE. UU. o Canadá gratis durante 14 días. Vea los [precios](/es/pricing/) de los planes de pago.
