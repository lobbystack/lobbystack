import type { LegalDocument } from "./types"

const support = `<a href="mailto:support@lobbystack.com">support@lobbystack.com</a>`

export const termsEs: LegalDocument = {
  updated: "Última actualización: 26 de septiembre de 2026",
  h1: "Términos del servicio",
  intro: `Estos Términos del servicio (los “Términos”) rigen el uso que usted hace del servicio alojado, los sitios web y el soporte de LobbyStack. Le rogamos que los lea antes de utilizar LobbyStack. Limitan nuestra responsabilidad, le atribuyen a usted la responsabilidad por el consentimiento para la grabación de llamadas y por el cumplimiento normativo de los mensajes de texto, y establecen cómo resolvemos las controversias.`,
  sections: [
    {
      id: "agreement",
      nav: "Acuerdo",
      title: "1. Acuerdo y requisitos",
      blocks: [
        `1.1 Estos Términos constituyen un contrato entre usted y Lobbystack Inc. (“LobbyStack”, “nosotros”, “nuestro” o “nos”). Usted los acepta cuando crea una cuenta, marca una casilla o hace clic en un botón que hace referencia a ellos, compra un plan o utiliza el Servicio. Si no está de acuerdo, no utilice el Servicio.`,
        `1.2 LobbyStack está destinado exclusivamente a negocios. Usted confirma que utiliza el Servicio para un negocio, oficio o profesión, y no con fines personales, familiares o domésticos. Cuando usted utiliza el Servicio, no es un consumidor en el sentido de la Ley de protección del consumidor de Quebec ni de ninguna ley similar.`,
        `1.3 Si usted acepta estos Términos en nombre de una sociedad u otra organización, confirma que tiene facultades para obligarla. En ese caso, “usted” y “Cliente” se refieren a dicha organización. Usted debe tener al menos 18 años y haber alcanzado la mayoría de edad en el lugar donde vive.`,
        `1.4 Si usted y LobbyStack firman un formulario de pedido u otro acuerdo por escrito relativo al Servicio (un “Pedido”), el Pedido prevalecerá sobre estos Términos en caso de conflicto entre ambos, pero únicamente respecto del objeto que abarca el Pedido.`,
      ],
    },
    {
      id: "definitions",
      nav: "Definiciones",
      title: "2. Definiciones",
      blocks: [
        {
          ul: [
            `<strong>Servicio</strong> significa la recepcionista con IA alojada de LobbyStack, el panel, el widget de chat y llamadas para sitios web, nuestros sitios web, nuestras API y el soporte relacionado que le prestamos.`,
            `<strong>Usuarios Autorizados</strong> significa sus empleados y contratistas a quienes usted permite utilizar su cuenta.`,
            `<strong>Llamantes</strong> significa las personas que interactúan con su recepcionista con IA mediante una llamada telefónica, una llamada desde el navegador o el chat del sitio web, y las personas que reciben mensajes de texto enviados a través del Servicio.`,
            `<strong>Datos del Cliente</strong> significa los datos que usted o sus Llamantes envían al Servicio, incluidos la información del negocio, el contenido de conocimiento, el audio de las llamadas, las grabaciones, las transcripciones, los mensajes, las conversaciones de chat, los datos de contacto y los registros de citas.`,
            `<strong>Resultados de IA</strong> significa todo lo que el Servicio genera mediante inteligencia artificial, incluidas las respuestas habladas, las respuestas de chat, los resúmenes y las acciones de reserva.`,
            `<strong>Servicios de Terceros</strong> significa los productos y servicios que no son de nuestra propiedad ni están bajo nuestro control, como los operadores telefónicos, los proveedores de modelos de IA, los calendarios y los procesadores de pagos.`,
          ],
        },
      ],
    },
    {
      id: "service",
      nav: "Servicio",
      title: "3. El Servicio",
      blocks: [
        `3.1 LobbyStack es una recepcionista con IA para pequeños negocios. Según su plan y su configuración, el Servicio puede responder llamadas telefónicas entrantes y llamadas desde el navegador con un agente de voz con IA, responder preguntas en el chat del sitio web, reservar, cancelar y reprogramar citas tras verificar al Llamante, tomar mensajes, transferir llamadas a su personal, grabar y transcribir llamadas, enviar mensajes de texto de alerta a su equipo y enviar un mensaje de texto opcional de recordatorio de cita a los Llamantes que acepten recibirlo.`,
        `3.2 Las funciones, los límites y el uso incluido varían según el plan. La <a href="/es/pricing/">página de precios</a> o su Pedido los describen. Podemos agregar, modificar o eliminar funciones. Si eliminamos una función importante de un plan de pago que usted utiliza, le daremos un aviso previo razonable. No prometemos ninguna función futura, y usted no debe comprar un plan basándose en una de ellas.`,
        `3.3 Le otorgamos un derecho limitado, no exclusivo, intransferible y no sublicenciable a utilizar el Servicio para los fines internos de su negocio durante su suscripción, con sujeción a estos Términos. Esto incluye el derecho a colocar nuestro widget para sitios web en los sitios que usted controla.`,
      ],
    },
    {
      id: "accounts",
      nav: "Cuentas",
      title: "4. Cuentas y seguridad",
      blocks: [
        `4.1 Usted debe proporcionarnos información exacta sobre la cuenta, el negocio y la facturación, y mantenerla actualizada.`,
        `4.2 Usted es responsable de sus Usuarios Autorizados y de todo lo que ocurra en su cuenta. Mantenga protegidos las contraseñas y el acceso. Avísenos de inmediato en ${support} si sospecha de un acceso no autorizado.`,
        `4.3 Podemos rechazar, suspender o cerrar una cuenta que utilice información falsa, que parezca ser un duplicado creado para obtener más uso gratuito o que genere riesgos para LobbyStack, nuestros proveedores o terceros.`,
      ],
    },
    {
      id: "ai",
      nav: "Resultados de IA",
      title: "5. Recepcionista con IA y Resultados de IA",
      blocks: [
        `5.1 El Servicio utiliza inteligencia artificial, incluidos modelos de OpenAI. Los Resultados de IA pueden ser erróneos, incompletos, incoherentes o inapropiados. La recepcionista con IA puede malinterpretar a un Llamante, dar una respuesta que su negocio no daría, indicar un precio o una política incorrectos, reservar un horario equivocado, no transferir una llamada o no registrar un mensaje.`,
        `5.2 Usted controla lo que la recepcionista con IA sabe y hace. Usted es responsable de la información de su negocio, el contenido de conocimiento, las instrucciones, los saludos, los precios, los horarios, los servicios, las reglas de reserva, los números de transferencia y la configuración de las alertas. Usted debe probar el Servicio antes de confiar en él y supervisarlo mientras lo utiliza.`,
        `5.3 Usted es responsable de cualquier declaración, cotización, promesa o reserva que la recepcionista con IA haga en nombre de su negocio, así como de cumplirla o corregirla ante sus Llamantes. LobbyStack no es parte en sus relaciones con los Llamantes.`,
        `5.4 El Servicio no brinda asesoramiento médico, jurídico, financiero, fiscal, de seguridad ni ningún otro asesoramiento profesional. No lo configure para brindar ese tipo de asesoramiento ni para tomar decisiones que requieran un profesional cualificado o una revisión humana.`,
        `5.5 Algunas leyes le exigen informar a las personas de que están hablando con un sistema de IA. Usted debe realizar esas divulgaciones. La recepcionista con IA no debe afirmar que es un ser humano cuando un Llamante lo pregunte sinceramente.`,
      ],
    },
    {
      id: "emergencies",
      nav: "Sin emergencias",
      title: "6. Sin servicios de emergencia",
      blocks: [
        `<strong>6.1 LobbyStack no es un servicio de emergencia y no admite llamadas al 911, al 999, al 112 ni a ningún otro número de emergencia.</strong> El Servicio no puede enviar ayuda, localizar a un Llamante ni tratar ninguna llamada como urgente.`,
        `6.2 No utilice el Servicio, ni permita que los Llamantes confíen en él, para emergencias, líneas de crisis o situaciones en las que esté en juego la vida o la seguridad de las personas. Si su negocio puede recibir llamadas urgentes, su saludo o sus instrucciones deben indicar a los Llamantes que cuelguen y marquen el número de emergencia local, y usted debe mantener un procedimiento atendido por personas para esas llamadas.`,
      ],
    },
    {
      id: "recording",
      nav: "Grabación de llamadas",
      title: "7. Grabación y transcripción de llamadas, y avisos a los Llamantes",
      blocks: [
        `7.1 El Servicio graba y transcribe llamadas, almacena las conversaciones del chat del sitio web y utiliza IA para tratar lo que dicen los Llamantes. Usted decide utilizar estas funciones y es usted quien las pone a disposición de sus Llamantes.`,
        `7.2 <strong>Usted es el único responsable de dar todos los avisos y obtener todos los consentimientos que exija la ley</strong> antes de que una llamada o un chat se grabe, se transcriba o se trate mediante IA. Esto incluye las leyes que exigen el consentimiento de todas las partes de una llamada, como las de California, Florida, Illinois, Maryland, Massachusetts, Pensilvania y Washington, así como las leyes de privacidad de Canadá y de Quebec. También incluye las leyes sobre intervención de comunicaciones, escuchas y divulgación del uso de IA de todos los lugares donde usted o sus Llamantes se encuentren.`,
        `7.3 El Servicio no utiliza la voz de los Llamantes para identificarlos. Si su uso del Servicio está sujeto a leyes de privacidad biométrica, como la Ley de Privacidad de la Información Biométrica de Illinois o leyes similares de Texas y Washington, usted es responsable de cumplirlas, incluidos los avisos, el consentimiento por escrito y la política de conservación que exijan.`,
        `7.4 Usted debe configurar su saludo o los avisos de su sitio web para que los Llamantes sepan, antes de que comience la conversación, que la llamada o el chat puede ser grabado y gestionado por un sistema de IA. Un saludo o una plantilla predeterminados de LobbyStack no nos transfieren esta responsabilidad. Si usted coloca nuestro widget en su sitio web, también es responsable de cualquier aviso y consentimiento relativos a las cookies o al almacenamiento del navegador que necesite su sitio web, ya que el widget almacena un identificador aleatorio del visitante en el navegador de este.`,
        `7.5 Usted no debe utilizar el Servicio para recopilar números de tarjetas de pago, números de documentos de identidad oficiales, información de salud u otra información sensible, salvo que la ley lo permita y usted cuente con todas las garantías y consentimientos exigidos. LobbyStack no está diseñado para tratar información de salud protegida en virtud de la HIPAA. No firmamos acuerdos de socio comercial (business associate agreements) salvo que aceptemos uno mediante un documento escrito y firmado.`,
      ],
    },
    {
      id: "telephony",
      nav: "Números de teléfono",
      title: "8. Números de teléfono y telefonía",
      blocks: [
        `8.1 Proporcionamos números de teléfono y servicios de llamadas a través de operadores externos, actualmente Twilio. Los planes Starter y Pro incluyen un número de teléfono del negocio. El plan Free incluye únicamente llamadas desde el navegador y no incluye número de teléfono.`,
        `8.2 Usted no es propietario de un número de teléfono que nosotros proporcionamos. Usted obtiene el derecho a utilizarlo mientras su suscripción de pago esté activa y al corriente. Los operadores, los reguladores o nuestros proveedores pueden exigirnos que cambiemos, recuperemos o restrinjamos un número, y no somos responsables de ello.`,
        `8.3 No garantizamos que un número, un código de área o un país determinados estén disponibles, ni que un número pueda portarse al Servicio o desde él. Cuando admitamos la portabilidad saliente, usted debe solicitarla antes del cierre de su cuenta y pagar las tarifas del operador.`,
        `8.4 Cuando su suscripción finalice, se cambie al plan Free o se suspenda por falta de pago, podemos liberar su número. Un número liberado puede asignarse a otra persona. No somos responsables de las llamadas ni de los mensajes de texto que lleguen a un número después de su liberación.`,
        `8.5 La calidad de las llamadas, la conexión, el identificador de llamadas y las transferencias dependen de operadores y redes que no controlamos. Usted es responsable de desviar las llamadas desde sus líneas existentes, de proporcionar números de transferencia exactos y de que haya personal para atenderlos. Las transferencias pueden fallar, y el Servicio no garantiza que se responda una llamada transferida.`,
      ],
    },
    {
      id: "sms",
      nav: "Mensajes de texto",
      title: "9. Mensajes de texto",
      blocks: [
        { h3: "Programa de SMS de LobbyStack" },
        `9.1 Nombre del programa: LobbyStack. LobbyStack envía mensajes de texto transaccionales, no publicitarios, en nombre de los negocios que utilizan el Servicio. Estos incluyen alertas al personal de un negocio sobre llamadas, mensajes y reservas; un recordatorio de cita enviado aproximadamente 24 horas antes de la cita, únicamente a los Llamantes que aceptaron recibirlo al reservar; y códigos de un solo uso que verifican el número de teléfono de una persona o la identidad de un Llamante antes de modificar una cita. LobbyStack no envía mensajes de texto publicitarios y no responde a mensajes de texto con IA.`,
        `9.2 La frecuencia de los mensajes varía según su actividad. Pueden aplicarse tarifas de mensajes y datos. Responda <strong>STOP</strong> para dejar de recibir mensajes de texto y <strong>HELP</strong> para obtener ayuda, o escriba a ${support}. Después de responder STOP, es posible que reciba un mensaje de confirmación, y no enviaremos más mensajes de texto a ese número salvo que usted vuelva a darse de alta. Los operadores no son responsables de los mensajes retrasados o no entregados.`,
        { h3: "Sus responsabilidades" },
        `9.3 Usted solo debe agregar como destinatarios de alertas a miembros de su personal o contratistas que hayan aceptado recibir mensajes de texto de alerta. Usted es responsable de cualquier mensaje de texto enviado a un número que introduzca en el Servicio.`,
        `9.4 Usted es responsable de cumplir la Ley de Protección al Consumidor Telefónico (TCPA), la Ley Antispam de Canadá (CASL), las directrices de la CTIA, las normas de los operadores, los requisitos de registro A2P 10DLC y cualquier otra ley aplicable a los mensajes de texto enviados en nombre de su negocio. Usted debe proporcionarnos información veraz para el registro ante los operadores. Los operadores pueden filtrar, retrasar o bloquear mensajes de texto, y podemos pausar el envío de mensajes de texto mientras un registro esté pendiente o haya sido rechazado.`,
      ],
    },
    {
      id: "acceptable-use",
      nav: "Uso aceptable",
      title: "10. Uso aceptable",
      blocks: [
        `10.1 Usted no debe utilizar el Servicio, ni permitir que otra persona lo utilice, para:`,
        {
          ul: [
            `realizar o intentar realizar llamadas o enviar mensajes de texto no solicitados, llamadas automatizadas (robocalls) o telemarketing;`,
            `enviar spam, phishing o contenido fraudulento;`,
            `suplantar la identidad de una persona, un negocio o un organismo público, o engañar a los Llamantes sobre con quién están hablando;`,
            `infringir cualquier ley, incluidas las leyes de privacidad, protección del consumidor, telemarketing, antispam, grabación, discriminación y propiedad intelectual;`,
            `acosar, amenazar o maltratar a cualquier persona, o promover la violencia o el odio;`,
            `ofrecer o promocionar bienes o servicios ilegales;`,
            `gestionar emergencias o líneas de crisis, brindar asesoramiento médico, jurídico o financiero, o tomar decisiones sobre crédito, empleo, vivienda, seguros, educación o acceso a servicios esenciales;`,
            `ofrecer un servicio dirigido a menores de 16 años;`,
            `subir contenido que usted no tenga derecho a utilizar o que infrinja los derechos de otra persona;`,
            `enviar malware, sondear o probar la seguridad del Servicio sin nuestro permiso por escrito, o interferir en su funcionamiento;`,
            `eludir los límites de uso, los límites de gasto, la facturación, el registro ante los operadores o los controles de seguridad;`,
            `extraer datos del Servicio mediante scraping, realizar pruebas de carga contra él o acceder a él por medios automatizados distintos de nuestras interfaces publicadas;`,
            `revender, alquilar u ofrecer el Servicio alojado a terceros sin un acuerdo por escrito con nosotros; o`,
            `infringir las políticas de uso de OpenAI, Twilio o cualquier otro Servicio de Terceros utilizado para prestar el Servicio.`,
          ],
        },
        `10.2 Podemos investigar presuntas infracciones. Podemos eliminar contenido, bloquear números, desactivar funciones o suspender cuentas para poner fin a una infracción o para cumplir un requisito de un operador, de un proveedor o legal. No estamos obligados a supervisar su uso, y no somos responsables del contenido que usted o sus Llamantes envíen.`,
      ],
    },
    {
      id: "third-party",
      nav: "Terceros",
      title: "11. Servicios de Terceros",
      blocks: [
        `11.1 El Servicio depende de Servicios de Terceros, incluidos OpenAI para la voz y el texto con IA, Twilio para los números de teléfono, las llamadas y los mensajes de texto, Google Calendar cuando usted lo conecta, Polar para la facturación y Firecrawl cuando usted importa su sitio web. La <a href="/es/privacy/">Política de privacidad</a> enumera los proveedores que tratan datos personales.`,
        `11.2 Cuando usted conecta o utiliza un Servicio de Terceros, también se le aplican los términos y las políticas propios de ese servicio. Usted es responsable de cumplirlos y de cualquier cuenta que tenga con ese proveedor.`,
        `11.3 No controlamos los Servicios de Terceros y no somos responsables de su disponibilidad, exactitud, seguridad, precios o cambios. Si un proveedor modifica o interrumpe un servicio del que dependemos, podemos modificar o eliminar la función relacionada.`,
      ],
    },
    {
      id: "billing",
      nav: "Tarifas y facturación",
      title: "12. Planes, tarifas y facturación",
      blocks: [
        `12.1 <strong>Planes.</strong> Ofrecemos un plan Free, los planes de pago Starter y Pro, y planes Enterprise en virtud de un Pedido. La <a href="/es/pricing/">página de precios</a>, el proceso de pago en línea o su Pedido establecen los precios vigentes, el uso incluido y las tarifas por excedente.`,
        `12.2 <strong>Pago.</strong> Nuestro procesador de pagos, actualmente Polar, gestiona el proceso de pago en línea y los cargos. Usted nos autoriza a nosotros y a Polar a cargar en su método de pago las cuotas de suscripción, los cargos por uso y los impuestos a su vencimiento. Los términos propios de Polar se aplican a su compra.`,
        `12.3 <strong>Renovación automática.</strong> Los planes de pago se renuevan automáticamente al final de cada periodo mensual o anual al precio vigente en ese momento, hasta que usted los cancele. Puede cancelar desde el panel o comunicándose con el soporte. La cancelación surte efecto al final del periodo en curso.`,
        `12.4 <strong>Cargos por uso.</strong> Los planes de pago incluyen cantidades determinadas de uso, como minutos de voz y mensajes de texto de alerta. El uso que supere esas cantidades se factura como excedente a las tarifas indicadas en la página de precios o en su Pedido. Nuestros registros de uso, y los de nuestros proveedores, prevalecen salvo que contengan un error evidente.`,
        `12.5 <strong>Límites de gasto.</strong> En los planes Starter y Pro, usted puede establecer un límite de gasto por excedentes. Cuando lo alcanza, el Servicio detiene las funciones que generarían más cargos por excedente hasta el siguiente periodo de facturación o hasta que usted aumente el límite. <strong>Esto significa que la recepcionista con IA puede dejar de responder llamadas.</strong> Un límite solo restringe los cargos por excedente. No restringe las cuotas de suscripción ni los impuestos. No somos responsables de las llamadas perdidas a causa de un límite o porque usted haya agotado el uso incluido.`,
        `12.6 <strong>Impuestos.</strong> Los precios no incluyen impuestos, salvo que se indique lo contrario. Usted paga todos los impuestos sobre las ventas, sobre el uso, sobre bienes y servicios, sobre el valor añadido y otros impuestos similares, salvo los impuestos sobre nuestros ingresos.`,
        `12.7 <strong>Pagos atrasados o fallidos.</strong> Si un pago falla, nosotros o Polar podemos volver a intentarlo. Podemos suspender su cuenta o cambiarla a un plan inferior, liberar su número de teléfono o cerrar su cuenta si el importe sigue impago.`,
        `12.8 <strong>Reembolsos.</strong> Las tarifas no son reembolsables, incluso en el caso de periodos parciales, uso no consumido, cambios a un plan inferior y cancelaciones, salvo que la ley disponga otra cosa o que lo aceptemos por escrito.`,
        `12.9 <strong>Cambios de precio.</strong> Podemos modificar los precios y el uso incluido. En el caso de un plan de pago activo, le daremos un aviso previo de al menos 30 días, y el cambio se aplicará a partir de su próxima renovación. Si no está de acuerdo, cancele antes de la renovación.`,
        `12.10 <strong>Controversias sobre la facturación.</strong> Usted debe informarnos de cualquier controversia sobre la facturación dentro de los 60 días siguientes al cargo. Le rogamos que se comunique con nosotros antes de iniciar un contracargo.`,
        `12.11 <strong>Plan Free.</strong> El plan Free incluye minutos limitados de llamadas desde el navegador y no incluye número de teléfono. Podemos modificar sus límites, o ponerle fin, en cualquier momento. Podemos cerrar las cuentas gratuitas que permanezcan inactivas durante un periodo prolongado. No ofrecemos ningún compromiso de soporte para el plan Free.`,
      ],
    },
    {
      id: "affiliate-program",
      nav: "Programa de afiliados",
      title: "13. Programa de afiliados",
      blocks: [
        `13.1 LobbyStack puede ofrecer un programa de afiliados que paga comisiones por referir nuevos clientes. Si usted participa, esta sección se aplica además del resto de estos Términos.`,
        `13.2 Salvo que el Servicio indique otra cosa, los afiliados que cumplan los requisitos obtienen una comisión del 20% sobre los pagos que reúnan los requisitos realizados por un cliente referido durante los primeros 12 meses posteriores a la atribución. Hacemos el seguimiento de los referidos mediante los enlaces o códigos que proporcionamos. Nuestros registros determinan la atribución, el cumplimiento de los requisitos y los importes de las comisiones.`,
        `13.3 Las comisiones tienen un periodo de retención de 30 días. Una comisión solo pasa a ser pagadera después de que el pago del cliente referido supere ese periodo sin reembolso, contracargo, controversia, reversión, crédito ni cancelación. Podemos anular, reducir, retener o revertir las comisiones no pagadas correspondientes a pagos o referidos que no reúnan los requisitos.`,
        `13.4 Pagamos a los afiliados a través de PayPal, utilizando el correo electrónico de PayPal guardado en el panel de afiliados. El pago mínimo es de USD $100 en comisiones elegibles no pagadas. El plazo de pago puede variar en función de la revisión, los controles antifraude, la disponibilidad del procesador de pagos y la exactitud de los datos de pago. Usted es responsable de sus impuestos, declaraciones, comisiones, conversión de divisas y cuenta de pago.`,
        `13.5 Usted no debe referirse a sí mismo, crear cuentas falsas, hacer afirmaciones engañosas, enviar spam, suplantar la identidad de LobbyStack, pujar por las marcas comerciales de LobbyStack o términos similares en búsquedas de pago, publicar reseñas falsas, abusar de los descuentos, generar tráfico artificial ni promocionar LobbyStack de una forma que infrinja la ley, las normas de las plataformas o estos Términos. Usted debe indicar claramente que puede recibir un pago cuando recomienda LobbyStack.`,
        `13.6 Podemos rechazar, suspender o poner fin a su participación y retener las comisiones no pagadas en caso de fraude, abuso, incumplimiento o riesgo. Podemos modificar, pausar o poner fin al programa, a sus tarifas, a las reglas de atribución, a los periodos de retención, a los umbrales de pago o a los métodos de pago en cualquier momento, con sujeción a la ley aplicable.`,
      ],
    },
    {
      id: "data",
      nav: "Datos del Cliente",
      title: "14. Datos del Cliente",
      blocks: [
        `14.1 <strong>Titularidad.</strong> En la relación entre usted y LobbyStack, usted es el titular de los Datos del Cliente.`,
        `14.2 <strong>Nuestra licencia.</strong> Usted nos otorga una licencia mundial, no exclusiva y libre de regalías para alojar, copiar, tratar, transmitir, mostrar y adaptar los Datos del Cliente en la medida necesaria para prestar, proteger, respaldar, diagnosticar y mejorar el Servicio, para prevenir abusos, para cumplir la ley y para hacer cumplir estos Términos. Nuestros proveedores pueden ejercer esta licencia en nuestro nombre únicamente para ayudarnos a realizar esas actividades.`,
        `14.3 <strong>Sus declaraciones.</strong> Usted confirma que cuenta con todos los derechos, avisos y consentimientos necesarios para que tratemos los Datos del Cliente conforme a estos Términos y a la <a href="/es/privacy/">Política de privacidad</a>, y que los Datos del Cliente no infringen los derechos de ninguna persona ni ninguna ley.`,
        `14.4 <strong>Nuestra función.</strong> En lo que respecta a los datos personales de sus Llamantes, actuamos como su proveedor de servicios o encargado del tratamiento. Los tratamos en su nombre y conforme a sus instrucciones, según se describe en la Política de privacidad. Usted es responsable de sus propios avisos de privacidad a los Llamantes y de responder a sus solicitudes.`,
        `14.5 <strong>Sin entrenamiento de modelos.</strong> No utilizamos los Datos del Cliente para entrenar modelos de IA. Nuestros proveedores de IA tratan los Datos del Cliente conforme a condiciones para empresas que, a la fecha de estos Términos, no les permiten entrenar sus modelos con ellos.`,
        `14.6 <strong>Acceso del personal.</strong> Nuestro personal accede a los Datos del Cliente únicamente cuando es necesario para prestar el soporte que usted solicita, mantener el Servicio en funcionamiento, investigar problemas de seguridad o abusos, o cumplir la ley.`,
        `14.7 <strong>Datos de uso y datos desidentificados.</strong> Recopilamos datos sobre el rendimiento y el uso del Servicio, como el número de llamadas, las duraciones, las tasas de error y el uso de las funciones. También podemos crear datos agregados o desidentificados a partir de los Datos del Cliente. Somos titulares de estos datos y podemos utilizarlos para operar, facturar, proteger, analizar y mejorar el Servicio. Estos datos no lo identificarán a usted, a sus Usuarios Autorizados ni a sus Llamantes.`,
      ],
    },
    {
      id: "retention",
      nav: "Conservación",
      title: "15. Conservación, exportación y eliminación de datos",
      blocks: [
        `15.1 El Servicio elimina automáticamente las grabaciones, las transcripciones, los mensajes y contenidos similares una vez transcurrido el periodo de conservación de su plan. La <a href="/es/privacy/#retention">Política de privacidad</a> indica los periodos vigentes. El contenido eliminado no se puede recuperar.`,
        `15.2 LobbyStack no es un servicio de copia de seguridad ni de archivo. Usted es responsable de exportar y conservar los registros que necesite, incluidos los registros que la ley le exige conservar.`,
        `15.3 Una vez cerrada su cuenta, podemos eliminar los Datos del Cliente sin previo aviso adicional. Pueden quedar copias en las copias de seguridad hasta que estas caduquen según su ciclo normal, y podemos conservar los registros que necesitemos con fines legales, fiscales, de facturación, de seguridad o de resolución de controversias.`,
      ],
    },
    {
      id: "feedback",
      nav: "Comentarios",
      title: "16. Comentarios",
      blocks: [
        `Si usted nos envía ideas, sugerencias u otros comentarios, podemos utilizarlos para cualquier fin sin pagarle ni deberle nada. No lo nombraremos públicamente como su autor sin su permiso.`,
      ],
    },
    {
      id: "open-source",
      nav: "Código abierto",
      title: "17. Código abierto y marcas comerciales",
      blocks: [
        `17.1 El código fuente de LobbyStack publicado en nuestro repositorio público está licenciado bajo la Licencia MIT. Esa licencia rige su uso, copia, modificación y distribución de dicho código. Estos Términos no limitan los derechos que le otorga dicha licencia.`,
        `17.2 La Licencia MIT abarca únicamente el código. No le otorga ningún derecho sobre el Servicio alojado, nuestros servidores, cuentas, números de teléfono, acuerdos con proveedores o datos, ni ningún derecho a recibir soporte.`,
        `17.3 El nombre, los logotipos y la marca LobbyStack son marcas comerciales nuestras. La Licencia MIT no otorga licencia sobre ellos. Usted no puede utilizarlos de una forma que sugiera que nosotros hemos creado, respaldamos o apoyamos su producto o servicio, incluida una copia modificada o alojada de LobbyStack, sin nuestro permiso por escrito. Usted puede hacer referencias exactas y objetivas a LobbyStack.`,
      ],
    },
    {
      id: "self-hosted",
      nav: "Autoalojamiento",
      title: "18. Implementaciones autoalojadas",
      blocks: [
        `18.1 Si usted ejecuta LobbyStack en su propia infraestructura, lo hace conforme a la Licencia MIT, no conforme a estos Términos. No tenemos acceso a su implementación ni a sus datos, no tratamos esos datos y no somos responsables de ellos.`,
        `18.2 Usted es responsable de sus servidores, la seguridad, las copias de seguridad, las actualizaciones, las cuentas con proveedores, los números de teléfono, los registros ante los operadores, los avisos, los consentimientos y el cumplimiento legal. Su uso de OpenAI, Twilio y otros proveedores es un asunto entre usted y ellos.`,
        `18.3 No ofrecemos soporte, garantía ni compromiso de servicio para las implementaciones autoalojadas, salvo que aceptemos uno mediante un documento escrito y firmado.`,
      ],
    },
    {
      id: "ip",
      nav: "Propiedad intelectual",
      title: "19. Propiedad intelectual",
      blocks: [
        `19.1 Salvo los Datos del Cliente y el código abierto descrito en la sección 17, LobbyStack y sus licenciantes son titulares de todos los derechos sobre el Servicio, nuestros sitios web, la documentación, los diseños, los prompts, las plantillas y la marca. Estos Términos solo le otorgan los derechos que en ellos se indican.`,
        `19.2 Usted no puede copiar, modificar ni crear obras derivadas del Servicio alojado, ni aplicarle ingeniería inversa o descompilarlo, salvo en la medida en que la Licencia MIT lo permita para nuestro código publicado o en que la ley lo permita a pesar de esta restricción.`,
      ],
    },
    {
      id: "confidentiality",
      nav: "Confidencialidad",
      title: "20. Confidencialidad",
      blocks: [
        `20.1 Cada parte puede recibir de la otra información no pública que esté marcada como confidencial o que una persona razonable trataría como confidencial (“Información Confidencial”). Los Datos del Cliente son Información Confidencial de usted. La información no pública sobre precios, seguridad y productos es nuestra.`,
        `20.2 La parte receptora utilizará la Información Confidencial únicamente para cumplir sus obligaciones conforme a estos Términos, la protegerá con un cuidado razonable y solo la compartirá con su personal, asesores y proveedores que la necesiten y estén sujetos a obligaciones similares.`,
        `20.3 Estas obligaciones no abarcan la información que sea o pase a ser pública sin culpa de la parte receptora, que esta ya conociera o hubiera desarrollado por sí misma, o que haya recibido lícitamente de un tercero. Una parte puede divulgar Información Confidencial cuando la ley lo exija, tras avisar a la otra parte cuando la ley lo permita.`,
      ],
    },
    {
      id: "beta",
      nav: "Funciones beta",
      title: "21. Funciones beta",
      blocks: [
        `Podemos ofrecer funciones etiquetadas como beta, vista previa, acceso anticipado o similares. Usted puede optar por utilizarlas. Pueden ser poco fiables, cambiar o desaparecer sin previo aviso, y pueden tener límites adicionales. Las proporcionamos “tal cual”, sin ninguna garantía ni compromiso, y podemos dejar de ofrecerlas en cualquier momento.`,
      ],
    },
    {
      id: "availability",
      nav: "Disponibilidad",
      title: "22. Disponibilidad y soporte",
      blocks: [
        `22.1 Trabajamos para mantener el Servicio disponible, pero no prometemos que funcione sin interrupciones ni errores, ni que esté disponible en un momento determinado. No tenemos un acuerdo de nivel de servicio, salvo que un Pedido incluya uno.`,
        `22.2 Podemos realizar tareas de mantenimiento, que pueden interrumpir el Servicio. Las interrupciones de los operadores, los proveedores de IA, los proveedores de alojamiento u otros Servicios de Terceros también pueden interrumpirlo.`,
        `22.3 Prestamos soporte por correo electrónico en ${support}. El horario de soporte, los tiempos de respuesta y los canales dependen de su plan y no están garantizados, salvo que un Pedido indique otra cosa.`,
      ],
    },
    {
      id: "termination",
      nav: "Terminación",
      title: "23. Suspensión y terminación",
      blocks: [
        `23.1 Usted puede dejar de utilizar el Servicio y cancelar su plan en cualquier momento. Las tarifas ya pagadas o adeudadas siguen siendo pagaderas.`,
        `23.2 Podemos suspender o limitar el Servicio de inmediato, con aviso cuando sea posible, si usted incumple estos Términos, no paga, genera riesgos de seguridad, legales o relacionados con los operadores, o si un proveedor, un operador o una autoridad lo exige. Restableceremos el acceso una vez resuelto el problema, salvo que pongamos fin al acuerdo conforme a la sección 23.3.`,
        `23.3 Podemos poner fin a estos Términos o a su cuenta por cualquier motivo con un aviso previo de 30 días, o de inmediato si usted incumple de forma sustancial estos Términos. Si los terminamos por conveniencia, reembolsaremos las cuotas de suscripción pagadas por adelantado correspondientes a la parte no utilizada del periodo.`,
        `23.4 Cuando se cierre su cuenta, su derecho a utilizar el Servicio finaliza, usted debe pagar todos los importes adeudados, podemos liberar su número de teléfono y la sección 15 se aplica a sus datos. Las secciones que por su naturaleza deban subsistir seguirán vigentes, incluidas las secciones 5, 7, 9.3, 9.4, 12, 14 a 20 y 24 a 32.`,
      ],
    },
    {
      id: "disclaimers",
      nav: "Exenciones",
      title: "24. Exenciones de garantía",
      blocks: [
        `<strong>24.1 En la máxima medida permitida por la ley, el Servicio se proporciona “tal cual” y “según disponibilidad”. LobbyStack excluye todas las garantías y condiciones, ya sean expresas, implícitas o legales, incluidas las de comerciabilidad, idoneidad para un fin determinado, titularidad, no infracción y calidad.</strong>`,
        `24.2 Sin limitar la sección 24.1, no garantizamos que los Resultados de IA sean exactos o adecuados, que todas las llamadas se respondan, gestionen, graben o transfieran correctamente, que los mensajes de texto se entreguen, que las reservas coincidan con su calendario ni que el Servicio produzca ningún resultado comercial.`,
      ],
    },
    {
      id: "liability",
      nav: "Responsabilidad",
      title: "25. Limitación de responsabilidad",
      blocks: [
        `<strong>25.1 En la máxima medida permitida por la ley, ni LobbyStack ni sus afiliadas, directivos, administradores, empleados, contratistas o proveedores serán responsables de ningún daño indirecto, incidental, especial, consecuente, ejemplar o punitivo, ni de ninguna pérdida de beneficios, ingresos, negocio, clientes, fondo de comercio o datos, ni del costo de servicios sustitutivos. Esto incluye las pérdidas derivadas de llamadas perdidas, cortadas, mal enrutadas o mal gestionadas, respuestas incorrectas, reservas incorrectas o no realizadas y mensajes de texto no entregados.</strong>`,
        `<strong>25.2 En la máxima medida permitida por la ley, la responsabilidad total de LobbyStack por todas las reclamaciones relacionadas con estos Términos o con el Servicio se limita al mayor de los siguientes importes: (a) los importes que usted pagó a LobbyStack por el Servicio en los 12 meses anteriores al hecho que dio lugar a la reclamación y (b) CAD $100.</strong>`,
        `25.3 Estos límites se aplican a todo tipo de reclamación, ya sea contractual, de responsabilidad extracontractual, por ilícito civil, por negligencia o basada en cualquier otro fundamento, aunque se nos haya advertido de la posibilidad de la pérdida y aunque un recurso no cumpla su finalidad esencial.`,
        `25.4 Nada de lo dispuesto en estos Términos limita la responsabilidad que la ley no permite limitar a una parte, como la responsabilidad por dolo o culpa grave, o por daños corporales o morales causados a una persona.`,
      ],
    },
    {
      id: "indemnity",
      nav: "Indemnización",
      title: "26. Indemnización",
      blocks: [
        `26.1 Usted defenderá a LobbyStack y a sus afiliadas, directivos, administradores, empleados y contratistas frente a cualquier reclamación, investigación o procedimiento de terceros, y pagará los daños, multas, sanciones, acuerdos transaccionales y honorarios legales razonables resultantes, en la medida en que se deriven de:`,
        {
          ul: [
            `los Datos del Cliente, o la información, las instrucciones y la configuración de su negocio;`,
            `el hecho de que usted no haya dado los avisos u obtenido los consentimientos para la grabación, la transcripción, el tratamiento mediante IA o los mensajes de texto;`,
            `reclamaciones en virtud de la TCPA, la CASL o las leyes sobre intervención de comunicaciones, escuchas, datos biométricos, privacidad o protección del consumidor relacionadas con su uso del Servicio;`,
            `declaraciones, cotizaciones, reservas u otras relaciones entre usted y sus Llamantes;`,
            `su incumplimiento de estos Términos o de los términos de un Servicio de Terceros; o`,
            `el uso indebido del Servicio por parte de usted o de sus Usuarios Autorizados.`,
          ],
        },
        `26.2 Le informaremos sin demora de cualquier reclamación, le permitiremos dirigir su defensa y le prestaremos una ayuda razonable a su cargo. Usted no puede llegar a un acuerdo transaccional sobre una reclamación que nos imponga una obligación o un reconocimiento sin nuestro consentimiento por escrito. Podemos participar con nuestros propios abogados a nuestro cargo.`,
      ],
    },
    {
      id: "force-majeure",
      nav: "Fuerza mayor",
      title: "27. Fuerza mayor",
      blocks: [
        `Ninguna de las partes es responsable de un retraso o incumplimiento causado por hechos que escapen a su control razonable, incluidas las interrupciones de los operadores, los proveedores de IA, los proveedores de alojamiento o de internet, los desastres naturales, las epidemias, la guerra, el terrorismo, los conflictos laborales, las medidas gubernamentales y los ciberataques. Esta sección no exime de las obligaciones de pago.`,
      ],
    },
    {
      id: "export",
      nav: "Exportación y sanciones",
      title: "28. Controles de exportación y sanciones",
      blocks: [
        `Usted debe cumplir las leyes de control de exportaciones y de sanciones de Canadá, de los Estados Unidos y demás leyes aplicables. Usted confirma que no se encuentra en un país o región sujeto a sanciones integrales, que no está constituido conforme a las leyes de dicho país o región ni es propiedad de, ni está controlado por, ninguna persona que se encuentre en él, y que no figura en ninguna lista gubernamental de partes restringidas. Usted no debe utilizar el Servicio para ninguna persona que se encuentre en esa situación.`,
      ],
    },
    {
      id: "changes",
      nav: "Cambios",
      title: "29. Cambios en estos Términos",
      blocks: [
        `29.1 Podemos actualizar estos Términos. Publicaremos la nueva versión en esta página y cambiaremos la fecha que figura en la parte superior.`,
        `29.2 Si un cambio es sustancial, le daremos un aviso previo de al menos 30 días por correo electrónico o en el Servicio antes de que entre en vigor, salvo que el cambio sea necesario antes por motivos legales, de seguridad o relacionados con los operadores. Si usted no está de acuerdo con un cambio, deje de utilizar el Servicio y cancele antes de que entre en vigor. Si sigue utilizando el Servicio después de esa fecha, acepta los Términos actualizados.`,
      ],
    },
    {
      id: "law",
      nav: "Ley aplicable",
      title: "30. Ley aplicable y controversias",
      blocks: [
        `30.1 Estos Términos se rigen por las leyes de la Provincia de Quebec y las leyes federales de Canadá aplicables en ella, sin tener en cuenta las normas sobre conflicto de leyes. No se aplica la Convención de las Naciones Unidas sobre los Contratos de Compraventa Internacional de Mercaderías.`,
        `30.2 Antes de iniciar un procedimiento judicial, una parte debe primero comunicarse por escrito con la otra e intentar de buena fe resolver la controversia durante al menos 30 días. Cualquiera de las partes puede, no obstante, solicitar medidas cautelares urgentes.`,
        `30.3 Sin perjuicio de los derechos que no puedan renunciarse, los tribunales situados en la Provincia de Quebec, Canadá, tienen competencia exclusiva sobre cualquier controversia relacionada con estos Términos o con el Servicio, y cada parte se somete a su jurisdicción.`,
        `30.4 En la máxima medida permitida por la ley, cada parte solo puede presentar reclamaciones contra la otra a título individual, y no como demandante o miembro de un grupo en una acción colectiva u otro procedimiento representativo.`,
      ],
    },
    {
      id: "general",
      nav: "Disposiciones generales",
      title: "31. Disposiciones generales",
      blocks: [
        `31.1 <strong>Acuerdo íntegro.</strong> Estos Términos, la Política de privacidad, cualquier Pedido y los documentos a los que hacen referencia constituyen el acuerdo íntegro entre usted y LobbyStack en relación con el Servicio. Sustituyen cualquier acuerdo anterior sobre esa materia. Los términos de sus órdenes de compra u otros documentos no se aplican.`,
        `31.2 <strong>Cesión.</strong> Usted no puede ceder ni transferir estos Términos sin nuestro consentimiento por escrito. Nosotros podemos cederlos a una afiliada o a un sucesor en el marco de una fusión, adquisición, reorganización o venta de activos.`,
        `31.3 <strong>Divisibilidad y renuncia.</strong> Si un tribunal determina que una parte de estos Términos no es exigible, esa parte se aplicará en la medida de lo posible y el resto seguirá en vigor. No ejercer un derecho no constituye una renuncia a él.`,
        `31.4 <strong>Relación entre las partes.</strong> Las partes son contratistas independientes. Estos Términos no crean ninguna relación de sociedad, empresa conjunta, empleo o mandato, ni ningún tercero beneficiario.`,
        `31.5 <strong>Notificaciones.</strong> Podemos enviar notificaciones a la dirección de correo electrónico de su cuenta o a través del Servicio. Usted debe enviar las notificaciones legales a ${support}. Las notificaciones por correo electrónico surten efecto en el momento de su envío.`,
        `31.6 <strong>Idioma.</strong> Publicamos estos Términos en inglés y en francés en <a href="/fr/terms/">lobbystack.com/fr/terms/</a>. Ambas versiones tienen el mismo valor.`,
        `31.7 <strong>Interpretación.</strong> Los títulos tienen un fin exclusivamente práctico. “Incluido” significa “incluido, sin carácter limitativo”.`,
      ],
    },
    {
      id: "contact",
      nav: "Contacto",
      title: "32. Contacto",
      blocks: [
        `Envíe sus preguntas sobre estos Términos a Lobbystack Inc. en ${support}.`,
      ],
    },
  ],
}
