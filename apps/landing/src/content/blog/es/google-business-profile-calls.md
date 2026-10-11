---
title: "Llamadas del Perfil de Negocio de Google: guía 2026"
seoTitle: "Perfil de Negocio de Google: número, horario y llamadas"
description: "Las llamadas de su Perfil de Negocio de Google llegan al número del perfil. Configure número y horario, lea la métrica Llamadas y cubra las llamadas que no contesta."
pubDate: 2026-10-10T09:00:00-04:00
updatedDate: 2026-10-10T09:00:00-04:00
author: "Equipo de LobbyStack"
category: "Guías"
featured: false
coverImage: "/illustrations/google-business-profile-calls-hero.webp"
coverImageAlt: "Portada beige claro con un pequeño patrón de puntos y el título Google Business Profile calls: set up, track, answer en letras negras"
locale: "es"
canonicalSlug: "google-business-profile-calls"
---

Las llamadas de su **Perfil de Negocio de Google** (Google Business Profile) llegan al número del perfil: el botón de llamada de la Búsqueda y de Maps lo marca. Google cuenta los clics en ese botón, pero dejó de mostrar el historial de llamadas el 31 de julio de 2024. Cuide el número y el horario, y prepare quién contesta.

Revisamos cada función, ruta de menú y límite de Google de esta guía en las páginas de ayuda de Google el 10 de octubre de 2026, y enlazamos cada una. Si una etiqueta de su pantalla es distinta, la página enlazada tiene la redacción actual de Google. LobbyStack escribió esta guía y vende una recepcionista con IA, así que también decimos dónde no encaja.

## ¿De dónde sale el botón de llamada del Perfil de Negocio de Google?

El botón de llamada usa el número de teléfono que usted agrega a su perfil. El [informe de rendimiento](https://support.google.com/business/answer/9918094?hl=es-419) de Google cuenta las veces que los clientes hacen clic en ese botón y le pide agregar un número para medir esa métrica. Crear el perfil es [gratis](https://business.google.com/us/business-profile/).

Algunos perfiles tenían un número de desvío de Google detrás del botón de llamada mientras existió el historial de llamadas. Cuando Google eliminó el historial de llamadas y el chat el 31 de julio de 2024, indicó que esos números se cambiarían de forma automática al número que proporcionó el negocio ([Google](https://support.google.com/business/answer/14919056?hl=es-419)). Hoy, un cliente que toca el botón de llamada marca el número que usted escribió, y la misma página confirma que usted sigue recibiendo las llamadas de su perfil.

Dos cosas que usted controla deciden el resto: el número y el horario del perfil, y quién contesta cuando usted no puede.

## ¿Cómo agrego o cambio el número de mi Perfil de Negocio de Google?

Los [pasos de Google para agregar un número](https://support.google.com/business/answer/16750496?hl=es-419), en la Búsqueda de Google:

1. Abra su Perfil de Negocio.
2. Seleccione **Editar perfil** y luego **Contacto**.
3. Junto a **Número de teléfono**, seleccione **Editar**.
4. Elija su país para que Google ponga el código de país.
5. Escriba el número. Google le da formato, así que no hace falta poner paréntesis ni guiones. Para un segundo o tercer número, seleccione **Agregar teléfono**.
6. Seleccione **Guardar**.

En la app de Google Maps, toque **Negocio** en la parte inferior derecha y luego **Editar perfil** ([Google](https://support.google.com/business/answer/3039617?hl=es-419)).

Google revisa los cambios antes de actualizar su perfil público y no publica un plazo de revisión. Mantenga activa la línea anterior hasta que vea el número nuevo en su perfil.

### Las reglas de Google para el número

- **Hasta tres números:** uno principal y hasta dos más, fijos o celulares. Google no acepta números de fax ([agregar su número](https://support.google.com/business/answer/16750496?hl=es-419)).
- **Local antes que centro de llamadas:** use un número local en lugar de la línea de ayuda de un centro de llamadas central siempre que pueda ([lineamientos](https://support.google.com/business/answer/3038177?hl=es-419)).
- **Bajo su control:** el número debe estar bajo el control directo del negocio.
- **Sin números de redirección:** no ponga números que redirijan a quien llama a páginas de destino o a números que no sean los del propio negocio.
- **Sin números de tarifa especial**, cobre lo que cobre a quien llama.

### ¿Se puede ocultar el número?

Sí. Abra su perfil, seleccione **Más** y luego **Configuración del Perfil de Negocio** y **Configuración avanzada**. En **Número de teléfono**, active **No mostrar** ([Google](https://support.google.com/business/answer/3039617?hl=es-419)). Ocúltelo solo si no quiere recibir llamadas desde Google.

## ¿Qué datos de llamadas muestra Google hoy?

Dentro de su perfil, Google muestra un solo dato de llamadas: **Llamadas**, en el informe de rendimiento, que cuenta los clics en el botón de llamada durante el periodo que usted elija. Un conteo de clics no le dice quién llamó, si alguien contestó ni cuánto duró la llamada. El historial de llamadas, que listaba las llamadas de algunos perfiles, terminó el 31 de julio de 2024.

Para verlo ([Google](https://support.google.com/business/answer/9918094?hl=es-419)):

- **En la Búsqueda de Google:** abra su Perfil de Negocio, seleccione **Rendimiento**, elija un periodo y seleccione **Aplicar**.
- **En la app de Google Maps:** en **Negocio**, toque **Ver más** junto a Rendimiento, elija un periodo y toque **Aplicar**.

Solo los perfiles verificados tienen datos de rendimiento, y usted debe acceder con la Cuenta de Google que administra el perfil.

| Dato de llamadas | ¿Disponible en octubre de 2026? | Dónde |
| --- | --- | --- |
| Clics en el botón de llamada | Sí | Rendimiento > **Llamadas** |
| Clics diarios en el botón de llamada, para software | Sí | API Business Profile Performance, métrica [`CALL_CLICKS`](https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric) |
| Lista de llamadas (historial de llamadas) | No. Terminó el 31 de julio de 2024 | La descarga de registros antiguos con Google Takeout cerró el 30 de agosto de 2024 ([Google](https://support.google.com/business/answer/14919056?hl=es-419)) |
| Número de quien llama, contestada o perdida, duración | No en su Perfil de Negocio | El registro de llamadas de su operador, su conmutador o su servicio de contestación |

## ¿Cómo rastreo las llamadas de mi Perfil de Negocio de Google?

Rastréelas en dos lugares. La métrica Llamadas de Google le dice cuántas personas hicieron clic en el botón de llamada. Sus registros telefónicos le dicen cuántas llamadas llegaron y cuántas contestó alguien. Compare las dos cifras cada mes: una brecha que crece puede indicar que la gente cuelga antes de que alguien conteste, aunque algunos clics nunca terminan en una llamada.

1. **Lea la cifra de Google.** Anote las Llamadas del mes pasado en Rendimiento.
2. **Lea la suya.** Saque el mismo mes del registro de su operador, su conmutador o su servicio de contestación: llamadas recibidas, contestadas y perdidas.
3. **Pregunte a los clientes nuevos cómo lo encontraron.** Quien contesta anota "Google" en la nota de la llamada cuando el cliente lo dice.
4. **Automatícelo si reporta varias sucursales.** La API de rendimiento devuelve `CALL_CLICKS` diarios por perfil, que un tablero puede consultar.

Las páginas de ayuda del Perfil de Negocio no hablan de números de seguimiento de llamadas. Los lineamientos de arriba aplican a cualquier número que ponga: bajo su control directo y sin redirigir a otro número que no sea el de su negocio. Lea [los lineamientos](https://support.google.com/business/answer/3038177?hl=es-419) antes de cambiar el número. Si desvía su propio número hacia un respaldo, el número del perfil no cambia.

Si desvía sus llamadas a LobbyStack, cada llamada que contesta queda con un resumen, una transcripción y una grabación en el panel, y eso le da el registro del paso 2. Webhooks firmados para 6 eventos y una API REST conectan LobbyStack con sus otras herramientas.

## ¿Cómo afectan el horario y el filtro de abiertos a las llamadas?

Su horario le dice a quien busca cuándo atiende a sus clientes. En computadora, Google Maps tiene un [filtro Horarios](https://support.google.com/gmm/answer/2839844?hl=es-419) que muestra los lugares abiertos en ese momento, así que un horario que lo marca como cerrado puede ocultarlo a quien use ese filtro. Mantenga al día su horario normal, especial y de días festivos, y ponga las horas en que atiende a sus clientes.

Los [pasos de Google para el horario normal](https://support.google.com/business/answer/15300403?hl=es-419):

1. Abra su Perfil de Negocio y seleccione **Editar perfil** y luego **Horario**.
2. En la sección **Horario de atención**, junto a **Horario**, seleccione **Editar** y luego **Abierto, con horarios de atención**. **Abierto, sin horarios de atención** oculta su horario.
3. Marque cada día que abre y ponga las horas. Para la hora de comida, cree dos entradas el mismo día. Para un día abierto sin cierre, seleccione **Abre a la(s)** y luego **24 horas**.
4. Seleccione **Guardar**.

Después de actualizar su horario, Google puede mostrar en su perfil un mensaje que confirma el cambio.

### Días festivos y cierres cortos

El [horario especial](https://support.google.com/business/answer/6303076?hl=es-419) cubre cambios temporales, incluidos cierres de hasta 6 días seguidos. Para 7 días o más, o por un periodo desconocido, Google recomienda marcar el negocio como cerrado temporalmente. El horario especial solo aparece si su horario está en **Abierto, con horarios de atención**. Google sugiere confirmar el horario de los días festivos oficiales aunque coincida con su horario normal.

[Más horarios](https://support.google.com/business/answer/9876800?hl=es-419) indica las horas de servicios específicos, como entrega a domicilio, para llevar, pedidos desde el auto o retiro. Solo aparece una vez que configuró su horario normal.

### ¿Debe poner 24 horas porque alguien contesta de noche?

Solo si atiende a clientes a toda hora. Los [lineamientos de Google](https://support.google.com/business/answer/3038177?hl=es-419) piden su horario normal de atención al público y dicen que los negocios que trabajan solo con cita no deben poner horario. Si contesta el teléfono de noche pero sus técnicos salen en la mañana, ponga su horario real y deje que la contestación nocturna agende para mañana a quien llama a las 9 p. m.

## ¿Cómo me aseguro de contestar las llamadas de mi Perfil de Negocio de Google?

Desvíe el número de su perfil a un respaldo para las llamadas que no puede tomar: las que no contesta de día, las que llegan fuera de horario o todas. El respaldo puede ser el celular de un compañero, un servicio de contestación con personas o una recepcionista con IA. El número del perfil sigue igual, así que no cambia nada en Google.

### 1. Elija quién contesta

| Respaldo | Qué recibe quien llama | Para quién |
| --- | --- | --- |
| Buzón de voz | Deja un mensaje y espera a que usted devuelva la llamada | Pocas llamadas, llamadas que pueden esperar ([recepcionista con IA o buzón de voz](/es/blog/ai-receptionist-vs-voicemail/)) |
| Celular de un compañero o de guardia | Una persona, si está libre | Equipos pequeños donde alguien puede contestar |
| Servicio de contestación con personas | Una recepcionista remota que toma mensajes y, en muchos planes, agenda citas | Llamadas que necesitan criterio humano ([qué hace un servicio de contestación](/es/blog/what-is-a-phone-answering-service/)) |
| Recepcionista con IA | Responde preguntas, agenda citas y transfiere urgencias | Citas y llamadas fuera de horario |

### 2. Desvíe su número

La regla se configura con su operador: desvío si está ocupado o no contesta para el exceso de llamadas, desvío a la hora de cierre para fuera de horario, o desvío de todas las llamadas. [Cómo desviar las llamadas de su negocio](/es/blog/how-to-forward-business-calls/) explica la configuración.

### 3. Configure la recepcionista

Con LobbyStack como ejemplo:

- Usted obtiene un número de LobbyStack (disponible en Estados Unidos, Canadá, Reino Unido y Australia) y desvía a él el número de su negocio. Puede contestar todas las llamadas o solo las de exceso o fuera de horario.
- Agenda citas en Google Calendar. Con el consentimiento de quien llama, envía por SMS una confirmación y un recordatorio 24 horas antes de la cita a números de Estados Unidos y Canadá.
- Transfiere las llamadas urgentes a un solo número por negocio. Las transferencias son directas, sin aviso previo a la persona que contesta. Si una transferencia no se completa, se lo dice a quien llama, ofrece tomar un mensaje y su equipo puede recibir una alerta de transferencia fallida.
- Cada llamada queda con un resumen, una transcripción y una grabación. Usted recibe una alerta por correo cuando toma un mensaje, y las alertas por SMS son opcionales.
- Las llamadas empiezan en el idioma predeterminado del negocio, inglés o francés, y luego la recepcionista responde en el idioma de quien llama: más de 70 idiomas, incluido el español.
- LobbyStack no cobra las llamadas de spam ni las de menos de 10 segundos.

Conozca los límites antes de desviar una línea: Google Calendar es el único calendario, la IA no responde mensajes de texto y no se sincroniza con un CRM ni con software de servicio en campo. Para una cobertura completa fuera de horario, vea [contestación fuera de horario](/es/solutions/after-hours-answering-service/).

### 4. Pruébelo desde su propio perfil

Después de su hora de cierre, busque su negocio en Google desde un teléfono, toque el botón de llamada y compruebe que la llamada llega a su respaldo. Agende una cita de prueba y pida algo urgente. Luego lea el registro de la llamada. El plan Free de LobbyStack le da 30 minutos de voz en el navegador, sin tarjeta ni número de teléfono, para escuchar a la recepcionista antes de pagar. No puede recibir llamadas reales; el desvío requiere Starter o Pro.

## ¿Son reales las llamadas de Google sobre mi Perfil de Negocio?

Algunas sí. Google dice que puede llamar o enviar mensajes de texto al número de su perfil para confirmar datos como su horario, y para ayudar a clientes a agendar una cita, consultar un tiempo de espera o confirmar precios y existencias ([Google](https://support.google.com/business/answer/7690269?hl=es-419)). Google nunca pide datos de pago por teléfono ni promete un lugar especial en sus productos ([Google](https://support.google.com/business/answer/6212928?hl=es-419)).

- **Desactívelas:** abra su perfil, seleccione **Más** y luego **Configuración del Perfil de Negocio** y **Configuración avanzada**. En **Llamadas y mensajes de texto automatizados de Google**, desactive lo que no quiera. Necesita un perfil verificado, y Google puede seguir llamando de forma manual para confirmar su información. También puede pedirle a quien llama que deje de llamar.
- **Dónde funcionan las llamadas para clientes:** las llamadas de citas, tiempos de espera y precios cubren algunas regiones. En Estados Unidos, todos los estados excepto Indiana, Luisiana, Minnesota, Montana y Nebraska.
- **Denuncie un fraude:** en Estados Unidos, denuncie el fraude a la FTC en ReportFraud.ftc.gov e informe a Google con el formulario enlazado en su [página sobre fraude](https://support.google.com/business/answer/6212928?hl=es-419).

Si una recepcionista o una IA contesta su línea, estas llamadas automatizadas también le llegan. Una llamada de Google para agendar trae la solicitud de un cliente real, así que avise a su recepcionista que puede recibirlas.

## Preguntas sobre las llamadas del Perfil de Negocio de Google

### ¿El Perfil de Negocio de Google todavía muestra el historial de llamadas?

No. Google eliminó el historial de llamadas y el chat el 31 de julio de 2024, y la descarga de registros antiguos con Google Takeout cerró el 30 de agosto de 2024. Los clientes siguen llamándole desde su perfil, y Rendimiento cuenta los clics en el botón de llamada. Para una lista de llamadas, use el registro de su operador.

### ¿Cuántos números puede tener un Perfil de Negocio de Google?

Tres: uno principal y hasta dos más. Google acepta números fijos y celulares, pero no de fax. Se agregan en Editar perfil y luego Contacto. Los lineamientos de Google piden un número local en lugar de la línea de un centro de llamadas cuando sea posible, y el número debe estar bajo el control directo del negocio.

### ¿La métrica Llamadas cuenta las llamadas contestadas?

No. Google define Llamadas como la cantidad de veces que un cliente hizo clic en el botón de llamada de su perfil. Un clic no muestra si la llamada se conectó ni si alguien contestó. Para contar llamadas contestadas y perdidas, compare la métrica con el registro de su conmutador o servicio de contestación en las mismas fechas.

### ¿Necesito un perfil verificado para ver los datos de llamadas?

Sí. Google muestra datos de rendimiento solo para perfiles de negocio verificados, y usted debe acceder con la Cuenta de Google que administra el perfil. Los propietarios y administradores abren Rendimiento en la Búsqueda de Google o en la app de Google Maps, eligen un periodo y leen la cifra de Llamadas de ese periodo.

### ¿Una recepcionista con IA puede contestar las llamadas de mi Perfil de Negocio de Google?

Sí. Deje su número en el perfil y desvíelo a la recepcionista con IA para llamadas perdidas, fuera de horario o todas. LobbyStack contesta las llamadas desviadas, agenda en Google Calendar, transfiere urgencias a un número y guarda resumen, transcripción y grabación de cada llamada. Los planes de pago cuestan desde $30 al mes, o $24 con pago anual.

## Conteste las llamadas que su perfil ya le envía

Su perfil pone su número a un toque de quienes lo buscan. La persona que contesta decide si esas llamadas se vuelven citas. Empiece con el plan Free de LobbyStack: 30 minutos de voz en el navegador, sin tarjeta ni número de teléfono, suficiente para escuchar cómo la recepcionista atiende a alguien que lo encontró en Google. Cuando le convenza, Starter cuesta $30 al mes por 150 minutos, luego $0.20 por minuto, e incluye un número al que desviar su línea. No hay cuota de configuración. [Empiece gratis](https://app.lobbystack.com/es/signup) o compare planes en la [página de precios](/es/pricing/).
