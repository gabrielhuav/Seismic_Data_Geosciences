# Continuar desde otra PC

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

Revisión posterior terminada sólo LOCAL: tres paletas y modo sistema/claro/oscuro,
filtros removibles, foco coordinado y mapa expandido. Paper actualizado con
USGS/NRCan, cuatro tablas y cinco figuras; Word/PDF de 23 páginas revisadas una a una.
41 pruebas Python y 27 checks Node pasan. El remoto sigue en 7009 hasta nueva
autorización específica; las dos anteriores ya se consumieron. Plan privado
outputs/publication/presentation_update_plan.md y gate nuevo de 540 destinos,
536 verificados/cuatro HTTP403, muestra 339/36,872. No inferir despliegue del candidato.

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
