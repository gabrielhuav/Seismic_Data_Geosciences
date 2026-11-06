# Continuar desde otra PC

## Estado inicial

Este proyecto se preparó localmente el 5 nov 2026. Después Gabriel autorizó crear y
conectar el remoto público https://github.com/gabrielhuav/Seismic_Data_Geosciences.
Después se autorizó un commit inicial y un push con excepciones concretas.
Comprueba si ya se ejecutaron: una autorización consumida no permite repetirlos.
Un clon sólo recupera los archivos efectivamente incluidos en el remoto.

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
