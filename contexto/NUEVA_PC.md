# Continuar desde otra PC

## Candidato local terminado, publicación pendiente

La consulta oficial SSN ya se descargó por Gabriel y se auditó:402082 filas,CSV45.95MB;
paquete cartográficoM>=3.5 completo242288filas/27 campos,71.32MB. Copia y términos
en research-data/catalogs/ssn-mx/. Regeneración offline: build_ssn_catalog.py y
build_catalogs.py; ocho hashes válidos, cuatro catálogos / tres distribuidores.
USGS NA permanece default; la atribución SSN/UNAM vía USGS no es SSN nativo.

Paper final privado: outputs/paper/ sóloWord+PDF26p,7 figuras integradas/4 tablas,
captura 204 SSN 2026 parcial corregida. QA completa y hashes en memoria y
outputs/ssn_recent_2026-11-06/final_document_qa.json. Conservar fuente, plantilla,
capturas y figuras en respaldo privado: no viajan con el clon. La tesis privada
no se ejecuta ni publica; no transferir sus cifras como resultados del artículo.

UI local5bases y retorno/Escape/foco desktop/móvil verificados.51 Python/45 JS y
4720 SQL / 24 sintéticos pasan. El remoto actual 5efc795 NOcontieneSSN nativo ni esta
actualización: autorización 5 pendiente para33rutas,UNcommit,UNpush,UNdespliegue
manual. Plan outputs/publication/native_ssn_update_plan.md; gate553/547/6 con
4HTTP 403,timeoutAZCATL,copiaSSNAPI 404antes del push y muestra339/36872,sinexcepciones
aceptadas. No heredar permisos. PC ENCENDIDA; no pagos/envíos/correos/release.

## Estado inicial

Este proyecto se preparó localmente el 5 nov 2026. Después Gabriel autorizó crear y
conectar el remoto público https://github.com/gabrielhuav/Seismic_Data_Geosciences.
El commit inicial 6b74f733628b41ab02816d6ba955739d0f22706c y su push
ya se ejecutaron con autorización expresa. GitHub Pages está publicado.
La autorización quedó consumida y no permite repetir esas acciones.
Un clon sólo recupera los archivos efectivamente incluidos en el remoto.

Actualización del 6 nov publicada: tres catálogos (USGS México/NA y NRCan Canadá),
dos proveedores y tres bases revisadas en navegador público. Segundo commit
7009d7de8c4addcf71dbe968deab18ea935c0c8e y push autorizados ejecutados;
workflow 42252874583 success; 25 assets coinciden. No repetir autorizaciones consumidas.
outputs/paper/ sólo conserva Word final y PDF; auxiliares en outputs/archive/.
La última instrucción es mantener la PC encendida; no programar apagado.

Revisión posterior PUBLICADA: tres paletas y modo sistema/claro/oscuro,
filtros removibles, foco coordinado y mapa expandido. Paper actualizado con
USGS/NRCan; su paper de 23 páginas fue sustituido por la revisión local indicada abajo.
41 pruebas Python y 27 checks Node pasan. Remoto en 53dba7b569bbeaa5d8d07edcb2bd8367e145bc9e,
workflow 42269837342 success; 26 assets coinciden y tres exclusiones HTTP404, Edge
público revisado. La tercera autorización específica y las anteriores ya se
consumieron; no repetir commit/push/despliegue. Plan privado
outputs/publication/presentation_update_plan.md y gate nuevo de 540 destinos,
536 verificados/cuatro HTTP 403, muestra 339/36,872 aceptados para ese push únicamente.
Recibo: outputs/publication/presentation_update_execution.json. Continuidad posterior
sólo local; un clon conserva la versión de continuidad anterior al resultado observado.

Revisión NUEVA PUBLICADA: acceso SSN/UNAM vía USGS, 9,858 registros de 1990–2017,
chip y URL v3/JSON3 con soporte v1/v2. Tres catálogos y dos distribuidores intactos.
Paper centrado en el sistema, 25 páginas/cuatro tablas/seis figuras integradas,
revisadas individualmente; 41 Python y 32 grupos Node pasan, 131 etiquetas/76 IDs.
Gabriel autorizó el plan outputs/publication/ssn_inline_update_plan.md: UN cuarto
commit humano de 14 archivos, su push y despliegue, con cuatro HTTP 403 y muestra
339/36,872 para ESE push. Ejecutados una vez: commit
5efc7953abc44f96350ca06f4b9a5f1cb6ec60f5, workflow 42282909895 success.
Los 26 assets coinciden y tres rutas excluidas dan HTTP404; Edge público
comprobó SSN, URL v3/recarga y chip, sin errores/avisos. Recibo privado:
outputs/publication/ssn_inline_update_execution.json. Cuarta autorización CONSUMIDA.
Continuidad posterior sólo LOCAL, sin quinto commit. Preview propio cerrado,
PC encendida. No repetir acciones ni excepciones sin autorización nueva.
Conservar fuente, plantilla, capturas y figuras privadas: un clon no las contiene.

Ahora también existen código, crudos, figuras y un manuscrito revisable locales.
La fuente del paper, figuras, plantilla y otros archivos ignorados no viajan con Git.
Conservar copia privada completa de
esta carpeta para transferir el trabajo, incluidos data/raw/, outputs/, la fuente
paper/drafts/manuscript.md y tmp/template-contract/artifact.md. No publicar esa copia
de forma automática. Leer Estado actual de MEMORIA_COMPARTIDA.md antes de continuar.

## Abrir el proyecto

1. En esta PC, agrega como proyecto local en Codex la carpeta
   C:\Users\gabri\Documents\GitHub Desktop\Seismic_Data_Geosciences.
   En otra PC, copia la carpeta si los archivos siguen sin publicar; cuando se confirme
   un push autorizado, clona https://github.com/gabrielhuav/Seismic_Data_Geosciences.
   Antes de afirmar que un archivo viaja con el clon, comprueba que esté en el remoto.
2. Lee AGENTS.md y contexto/MEMORIA_COMPARTIDA.md. Pega el mensaje de
   contexto/INICIAR_CONVERSACION.md en el chat nuevo. El prompt TXT es una ayuda local;
   los tres Markdown y AGENTS.md contienen la continuidad necesaria.
3. Comprueba rama, estado y remoto. Antes de cualquier commit autorizado, configura
   localmente user.name=Gabriel Hurtado y user.email=gabrielhurtadoaviles@gmail.com;
   commit.gpgsign=false y tag.gpgsign=false. Verifica autor/committer y ausencia de
   atribuciones automáticas de asistentes. La configuración .git/config no viaja al clonar.
4. Localiza DWSismos, agua y obras como referencias solo lectura; sus carpetas pueden
   variar entre PCs. La memoria incluye el remoto sísmico y fuentes para recuperarlos.
5. Clonar/copiar no instala Git, Word, Python, Docker ni dependencias, contenedores o
   bases. Las auditorías/test usan biblioteca estándar de Python; figuras usan
   matplotlib y el generador Word usa lxml. Ver docs/REPRODUCIBILITY.md. Los paths
   del runtime de Codex pueden variar: resolverlos nuevamente. No resembrar servicios
   históricos. El render final se hizo en Word nativo por falta de LibreOffice
   empaquetado en Windows, luego Poppler y revisión de todas las páginas.
6. Revalidar guía, plantillas y costo cero por suscripción al iniciar y antes de enviar.
   Cada commit, push, publicación y envío necesita autorización expresa propia.

## Publicación futura

Solo AGENTS.md y los tres Markdown de continuidad están previstos para compartir como
contexto, mediante commit/push autorizado; otros prompts y evidencia quedan ignorados.
Estos archivos sí serían públicos en GitHub al publicar el repo, pero .gitattributes los
excluye de git archive para el sitio. El workflow Pages preparado sólo sirve system/dist; consultar su estado real.
No se trasladan chats, credenciales, hooks ni .git/config con un clon.
