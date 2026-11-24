# Conectar el correo de Bre-B a caja

El buzón central es **avenacubanapop@gmail.com**. El conector admite el aviso de Nequi con asunto **¡Recibiste plata por Bre-B!** y remitente **notificaciones@nequi.com.co**. El nombre se toma de «Recibiste … de …». Si Nequi proporciona una cuenta receptora, el historial conserva únicamente sus últimos cuatro dígitos. Un aviso nunca cambia el estado de pago de un pedido.

También admite pagos QR de Bancolombia enviados por **alertasynotificaciones@ayn.notificacionesbancolombia.com** con asunto **Alertas y Notificaciones**. El lector busca «recibiste un pago de … por $… en tu cuenta» y conserva el nombre, valor y los últimos cuatro dígitos. Para el filtro de Gmail, añade **recibiste un pago de** en **Contiene las palabras**.

### Activación por la persona que administra el buzón

1. Entra en [Google Apps Script](https://script.google.com/home) con **avenacubanapop@gmail.com** y crea un proyecto privado. Copia [Correo.gs](./Correo.gs) y [Nequi.gs](./Nequi.gs) como archivos de secuencia de comandos. En **Configuración del proyecto**, habilita la vista del manifiesto y sustituye su contenido por [appsscript.json](./appsscript.json). El manifiesto activa el servicio avanzado de Gmail. Si usas un proyecto de Google Cloud propio, habilita también la API de Gmail en ese proyecto.
2. En **Propiedades de la secuencia de comandos**, añade estas tres propiedades.

   | Propiedad | Valor |
   | --- | --- |
   | `CORREOS_RECEPTORES` | Direcciones personales autorizadas que figuran en el campo **Para** del correo original del banco, separadas por comas. Incluye el correo central si también recibe avisos directos. |
   | `SUPABASE_PUBLISHABLE_KEY` | La clave pública del proyecto Avena Cubana Pop, la misma que usa la web. |
   | `BREB_INGEST_KEY` | Desde el editor SQL del proyecto, ejecuta `select ingestion_key from breb_private.inbox;` y copia el resultado directamente aquí. Esta clave privada solo autoriza el ingreso de avisos. |

3. Ejecuta **activarBreb** y acepta la autorización de Google. Se crea un disparador cada minuto. Puedes ver los resultados en **Ejecuciones**. El conector procesa los avisos nuevos, con dos minutos de solapamiento. Los reintentos usan el identificador original del mensaje y, si existe, la referencia de la transacción. Dos pagos diferentes del mismo valor y persona se conservan por separado.
4. En cada Gmail personal, añade **avenacubanapop@gmail.com** como dirección de reenvío y confirma la solicitud en el buzón central. Crea un filtro con el remitente y el asunto indicados arriba y elige **Reenviarlo a**. Usa el reenvío automático que conserva el mensaje bancario original. Deja el reenvío general desactivado para que solo pasen los avisos seleccionados. [Guía de Gmail](https://support.google.com/mail/answer/10957?hl=es)
5. Entra con el perfil de caja o administrador y abre **Avisos Bre-B → Activar voz en este equipo**. Mantén abierta la pestaña de trabajo. La lectura continúa al pasar a ventas o inventario dentro del panel. Si hay varios equipos activos, solo uno reclama cada aviso. **Repetir último aviso** lee el más reciente sin cambiar el historial.
6. Comprueba la primera notificación real comparándola con los movimientos del banco. Si falta un aviso, revisa el buzón central, el filtro, el destinatario original y las ejecuciones del script. Una firma que no se pueda verificar o un formato distinto a los admitidos se descarta. Si otro banco también enviará avisos, se necesita una muestra de su formato y remitente.

Para detener la lectura del buzón, elimina el disparador **leerBreb** en Apps Script. Para retirar una cuenta personal, quítala de **CORREOS_RECEPTORES** y desactiva su filtro de reenvío.
