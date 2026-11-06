# Memoria compartida: sismos para Computers & Geosciences

Actualizada: 5 de noviembre de 2026. Hablar con Gabriel en español y brevemente.
Leer AGENTS.md completo. Los resultados de antecedentes no son verificaciones nuevas.

## Estado actual

- Gabriel autorizó expresamente un commit inicial humano y un push a origin/main,
  además de publicar el sistema. Aceptó para ESE push los cuatro HTTP 403
  editoriales documentados y el muestreo de 264 de 24,994 rutas de eventos:
  «Sí: autorizo el commit, el push y esas excepciones». Plan concreto local:
  outputs/publication/initial_release_plan.md. No se autorizan commits adicionales,
  amend, otros pushes, releases ni envío editorial. El apagado sigue condicionado
  a terminar el trabajo y guardar los archivos; todavía no se ha ejecutado.
- Sistema preparado en system/dist: mapa Leaflet 1.9.4 y Natural Earth local,
  ES/EN con español por defecto, filtros, buscador, gráfico anual, fichas con
  fuentes y hashes, CSV, 36 historiales de origen, vistas restaurables por URL
  y descarga JSON de consultas locales con hashes e IDs ordenados. Contiene
  24,994 earthquake de 46 CSV fijados. El encuadre no limita el CSV, las magnitudes
  no se convierten y no se infiere país, predicción ni daño.
- Host elegido: GitHub Pages gratuito de ESTE repositorio público; workflow
  manual .github/workflows/pages.yml que sólo sube system/dist. No hay Site de
  Sites. Contexto, paper, figuras y crudos históricos SSN quedan fuera de la web.
  Comprobar estado Git real: la autorización inicial puede estar consumida.
  Identidad: Gabriel Hurtado <gabrielhurtadoaviles@gmail.com>, sin firmas,
  asistentes, coautores ni trailers automáticos.
- Selección pública preparada: código y documentación propios bajo MIT de Gabriel,
  pruebas, artefacto web, AGENTS.md, tres Markdown de continuidad, procedencia de
  plantilla y research-data/comcat con 40 respuestas oficiales originales
  (35,641,601 bytes) y manifiestos. prepare_public_evidence.py verifica y restaura
  los bytes sin red ni sobrescritura de evidencia diferente. Los derechos de
  fuentes y contribuyentes no se sustituyen por MIT. Plantilla Word original,
  figuras y fuente del manuscrito, outputs, tmp, data/raw y prompts quedan locales.
- Verificaciones: 36 tests científicos; seis grupos Node de URL/filtros/JSON;
  102 etiquetas bilingües, 53 IDs y diez assets cartográficos coherentes. Cero
  fallos de referencias locales, privacidad o integridad. Red: 171 literales y
  264 rutas; 423 de 435 pasan HTTP, ocho TLS de GitHub verificados por conector
  con contenido recuperado, cuatro HTTP 403 exceptuados para el push autorizado.
  Recibos actuales en outputs/links/connector_receipts_current.json. No se
  certifican las otras 24,730 rutas. Comparar el grafo de URLs y hashes actuales
  con el informe antes de empujar; los fallos HTTP originales siguen registrados.
- Edge está autorizado por Gabriel, pero Computer Use detuvo dos turnos porque
  no pudo identificar su URL actual con confianza suficiente para la política.
  No seguir intentando ni eludir el control. La UI nueva carece de revisión
  visual/interactiva completa: sólo revisión independiente de código, lógica y
  carga HTTP 200. Word sí funciona como aplicación independiente por Computer Use.
- Manuscrito completo de 17 páginas y tres figuras, fuente privada
  paper/drafts/manuscript.md, SHA-256
  68e71a07345d5b172fe1f5bdaa6584ae4684f3ff969da769c415659cab283cc0.
  Resumen 254 palabras, cuerpo aproximado 3,920. Se revisaron las 17 páginas y
  highlights de una página tras exportación nativa Word y Poppler. Algunos renders
  omiten el texto opcional del pie. El generador ya deja ese slot vacío conservando
  los campos PAGE y la autoría de portada. DOCX regenerado con esa corrección:
  REQUIERE nueva exportación y revisión; el PDF actual aún es anterior a ella.
  Actualizar disponibilidad sólo después de publicación real y regenerar/revisar.
  La versión de 15 páginas es obsoleta; copia privada en
  outputs/paper/reviewed_before_declarations/. No afirmar envío ni visto bueno
  de coautores como consecuencia de autorizar el trabajo técnico.
- Metadatos confirmados: José Manuel Villa Vargas primero, sin afiliación,
  ORCID 0009-0009-2401-0661; Gabriel Hurtado Avilés segundo y de correspondencia,
  Escuela Superior de Cómputo (ESCOM), Instituto Politécnico Nacional,
  Mexico City, Mexico; ghurtadoa@ipn.mx; ORCID 0009-0002-5686-1822. ORCID
  contrastados con AZCATL. Sin financiación específica ni conflictos.
  CRediT de José Manuel: Conceptualization, Formal analysis, Supervision,
  Writing-original draft, Writing-review & editing. Gabriel: Data curation,
  Investigation, Methodology, Project administration, Resources, Software,
  Validation, Visualization. Sin Funding acquisition. Registro privado:
  paper/drafts/author_metadata.json.
- Afirmaciones científicas acotadas fundamentadas: 36 eventos, 236 versiones de
  origin, 205 en rama US, 31 pares de igual tipo, 13 cambios, cuatro cruces de 5.5,
  desplazamiento mediano 12.339 km y máximo 79.684 km entre soluciones, no errores
  contra verdad. SQL independiente: 472 cortes por diez consultas, 4,720
  comparaciones y cero discrepancias. Ocho historias sintéticas y 24 casos:
  cero discrepancias de proyección; políticas ilustrativas con 10/11/10
  discrepancias contra replay conocido, sin interpretación como tasa operativa
  o benchmark de otros programas. Se rechazaron estados de producto desconocidos.
  No se reclama precisión de reconstrucción histórica. Riesgo editorial concreto:
  C&G puede considerar incremental el contrato ejecutable; la validación no
  demuestra por sí sola avance sobre el estado del arte.
- Históricos de sismos, agua y obras, sitios, ramas, bases y contenedores intactos.
  Vía Subscription sin cargo al autor; sin pagos ni envíos. Revalidar costos antes
  de enviar. AZCATL 2026, DOI 10.24275/AZC2026E1004, sólo citado como antecedente;
  no se reciclaron sus textos o figuras como inéditos.

## Revista, costos y plantilla

Portada: https://www.sciencedirect.com/journal/computers-and-geosciences
Guía: https://www.sciencedirect.com/journal/computers-and-geosciences/publish/guide-for-authors
Alcance alternativo oficial: https://shop.elsevier.com/journals/computers-and-geosciences/0098-3004

Verificados el 5 nov 2026: la portada ofrece Subscription sin cargo de publicación al
autor y OA de pago como opción separada. La condición de Gabriel es costo personal cero.
Reconfirmar al iniciar y antes de enviar. No elegir OA con APC, color impreso de pago,
coenvíos a Data in Brief/MethodsX ni otros servicios pagados. No asumir cobertura por
convenio institucional o exención sin confirmación completa. No aceptar compromisos
contractuales ni pagos por Gabriel. No cambiar de revista automáticamente.

Applied Computing and Geosciences es otro título: su APC observado fue USD 2,230 sin
impuestos. Computers and Geotechnics se descartó por encaje débil del enfoque actual.
No confundir los tres títulos. Si ScienceDirect da 403 al cliente automático, probar
el navegador y distinguir el bloqueo de una caída; no ocultar enlaces fallidos.

La revista exige novedad tanto computacional/informática como geocientífica. ETL,
DWH, mapa, interfaz o aplicar un método estándar no bastan por sí solos. Código público
documentado al enviar es requisito editorial, no autorización para publicarlo ahora.

Plantillas específicas enlazadas por la guía:
- Word: https://github.com/cageo/CAGEO_WordTemplate (C&G_WordTemplate.docx).
- LaTeX: https://github.com/cageo/CAGEO_LaTeXTemplate.

Registrar versión/commit, fecha y hash al descargarlas. Priorizar Word y mantener una
fuente/generador reproducible, ecuaciones y tablas editables; revisar el PDF página a página.
Reglas verificadas: una columna, doble espacio y numeración de líneas; Research/Application
inicial 5,500 palabras, versión revisada tras evaluación 6,500, con tolerancia de 10 %.
No es el límite de Review Article. El conteo excluye resumen, keywords, highlights,
referencias y pies de figura. Trabajar dentro del límite base y revalidar la guía vigente.
Resumen máximo 300 palabras; 1–6 keywords; highlights obligatorios, 3–5 puntos de hasta
85 caracteres con espacios cada uno, en archivo editable separado. Resumen gráfico recomendado.
Referencias autor–fecha, lista alfabética/cronológica y nombres completos de revistas,
sin abreviar. No trasladar APA 7, 15 páginas, 40 % de ampliación ni amarillo de IJCOPI.

Preparar declaraciones de código/datos, financiación, conflictos, CRediT y asistencia
académica de IA veraz. No inventar aprobaciones ni roles humanos. Datos (Option C):
depósito y cita/enlace al dataset, o explicación de por qué no puede compartirse, más
declaración de disponibilidad. Elegir depósito sin costo. Repositorio de código con
licencia, README en inglés, dependencias, instalación, requisitos, tutorial, guía de
entradas/salidas y ejemplos reproducibles; comentarios del código en inglés. No basta
un ZIP único. Preparar localmente y pedir autorización de publicación antes del envío.

## Históricos y artículo base

Solo lectura; localizar carpetas hermanas si cambia la PC:
- DWSismos: https://github.com/gabrielhuav/Seismic-Data-Visualization-System
  Referencia consultada el 5 nov: main limpio en
  8569667cf4f46fab640dba3f82a7b324ca7efaf7. Revalidar. El README contiene una URL vieja.
- Agua: Data_Warehouse_IJCOPI y su fuente Data_Warehouse_static, rama ijcopi-zmvm.
- Obras: PublicMunicipalWorks_IJCOPI y PublicMunicipalWorks_DWH; revisar PROMPT_RELEVO.md
  y lakehouse/sitio como referencias de procedimiento cuando sea pertinente.

No modificar sus main, historia, tags, releases, sitios ni enlaces previos; tampoco los
de Data_Warehouse_ZMVM o ICOKG. No importar sus .git ni instrucciones de publicación.
Reutilizar código exige conservar licencias/créditos humanos. No copiar texto, cifras
o resultados de los manuscritos de agua/obras. El compose sísmico histórico usa 80 y 5433:
comprobar recursos antes de Docker; no detener ni resembrar servicios de otros proyectos.

Antecedente identificado, pendiente de confirmar con Gabriel que sea el artículo base:
Villa Vargas, J. M., Hurtado Avilés, G., y Climent Hernández, J. A. (2026).
Cuando México tiembla: la historia contada por los datos. AZCATL, 4(6), 28–33.
https://doi.org/10.24275/AZC2026E1004
https://azcatl.azc.uam.mx/index.php/azcatl/article/view/75

Leer el artículo completo y delimitar lo publicado frente a investigación nueva. La
editorial registra CC BY-NC-ND 4.0; verificar permisos de reutilización. No traducir ni
reciclar texto/figuras como inéditos. El tercer autor es del antecedente y no se incorpora
automáticamente al nuevo artículo. MIT del código no equivale a licencia de artículo/datos.

## Fuentes y precauciones científicas

Datos permitidos como candidatos, todavía no auditados:
https://github.com/Actronix09/fuentes-alternas/tree/sismos-norteamerica
Referencia consultada: 8fe055ffe635875f7290906d45f70562a7896621.
Leer sismos-usgs/README.md, PROCEDENCIA_ORIGINALES.md, LICENSE y procedencia.json.
Fijar versión; comprobar licencias por fuente y conservar créditos. Revisar código
antes de ejecutar; no copiar/ejecutar .pyc ni importar historiales.

Auditar SSN/USGS-ComCat: IDs, procedencia, revisiones, fechas/husos, duplicados, tipos
de magnitud, cobertura y completitud. USGS puede republicar soluciones SSN: coincidencia
no siempre es validación independiente. No equiparar escalas sin justificación ni aceptar
desfases/cifras del README sin recalcularlos. Auditar impactos imputados históricos;
población regional no equivale a afectados, exposición o daños. No asignar automáticamente
eventos al país más cercano. Distinguir sismicidad, amenaza, vulnerabilidad y riesgo.

Guardar parámetros/consulta, fecha, fuente original, hashes y versiones; preservar
crudos, registrar transformaciones y exclusiones, y proteger bytes con .gitattributes.
Cada cifra nueva se recalcula con scripts/consultas. No afirmar predicción de terremotos
o daños desde el catálogo. Si se propone ML, controlar fuga temporal/espacial y validar
fuera de muestra. No agregar ML ni modelos geotécnicos sin necesidad científica.

## Siguiente paso

1. Verificar si ya se consumieron el commit inicial y push autorizados. Si aún no,
   comprobar selección, hashes y Git humano; ejecutar una sola vez con las
   excepciones exactas. Configurar Pages sólo aquí, disparar el workflow manual,
   esperar éxito y verificar URL y assets antes de entregar el enlace final.
   Ningún amend ni push adicional queda autorizado automáticamente.
2. Tras publicación efectiva, actualizar disponibilidad del paper con URL y versión
   reales. Regenerar Word/highlights; cerrar los archivos antes de reemplazarlos,
   exportar con Word nativo y desmarcar apertura automática del PDF en navegador.
   Rasterizar con Poppler y revisar todas las páginas. Edge sigue bloqueado.
3. Entregar documentos vigentes y enlace alojado verificado. Distinguir riesgo
   editorial de afirmaciones no validadas; no enviar ni inventar aprobación de
   coautores. Apagar sólo después del cierre completo y archivos guardados.

## Bitácora

- 2026-11-05: autoría, financiación y CRediT confirmados; validación SQL y
  sintética integrada; 36 tests y seis checks Node pasan. Sistema bilingüe con
  vistas y consulta reproducible listo. Paquete oficial de 40 respuestas y
  workflow manual Pages preparados. Autorizados expresamente un commit inicial
  y un push con cuatro HTTP 403 y 264 de 24,994 rutas muestreadas. Manuscrito
  de 17 páginas revisado; corrección posterior de pie pendiente de exportación.
  Edge bloqueado por URL no identificable; Word nativo sí funciona.

- 2026-11-05: Gabriel preguntó por qué faltaba el mapa. Se reconoció la omisión de
  cartografía base y se implementó mapa geográfico local navegable con Leaflet
  1.9.4/Natural Earth, manteniendo filtros, tabla, fuentes y datos científicos.
  27 polígonos de contexto; fuente NE fijada a ca96624a56bd078437bca8184e78163e5039ad19;
  licencias y hashes preservados. Revisión estática independiente sin bloqueantes,
  JS válido, cuatro hashes correctos, verificador local con cero fallos y seis
  rutas del servidor HTTP200. La UI nueva quedó pendiente de revisión visual por
  «Computer Use app approval timed out»; no se eludió el control de la aplicación.
  Se solicitó abrir la URL local en panel mediante open_in_codex (estado queued).
  Sin commit, push, publicación ni apagado; históricos intactos.
- 2026-11-05: contexto completo leído; main sin commits, origin e identidad humana
  comprobados. Gabriel amplió a paper/sistema. Revisión primaria y artículo AZCATL
  completo; DWSismos limpio en 8569667cf4f46fab640dba3f82a7b324ca7efaf7 sólo lectura.
  No se ejecutaron servicios ni contenedores históricos.
- 2026-11-05: auditoría fijada a 8fe055ffe635875f7290906d45f70562a7896621:
  46 CSV, 4,403,193 bytes, 24,996 IDs únicos (24,994 earthquake; 2 quarry blast).
  9,858 terremotos con UNM/us_unm en locationSource o magSource; 17,971 sin error
  horizontal. SQL derivado: 319,592 filas sin IDs originales/tipo de magnitud;
  no se confundieron imputaciones con daños observados ni fechas hipotéticas con UTC.
- 2026-11-05: piloto oficial ComCat capturado 19:53:15.316–19:53:54.609 UTC:
  selección ACTUAL 2017=22, 2022=14, M>=5.5, lat14..33/lon-118..-86. 236 origin
  versiones, 205 en rama US; 31 pares de igual tipo (30mww+1mb), 13 cambios y
  4 cruces de 5.5. Desplazamiento mediano 12.339 km, máximo 79.684 km. Cambios
  no son errores/mejoras contra verdad; selección actual y retención limitan inferencias.
  21 origins ISC-GEM distribuidos por us; 52/169 transiciones sin cambio de campos
  seleccionados. Versiones UPDATE sustituidas no son soluciones activas simultáneas.
- 2026-11-05: guía y vía Subscription sin cargo verificados en navegador oficial
  tras 403 automático. Plantilla commit6c95188814973fba89ce1ac8911726b6e1e8f4f5,
  SHA2568f46981fb4e73b6ffeb911f1078529d0e38844213d32fbfab8e762cddfdfb95f.
  Referencia intacta, ocho páginas inspeccionadas. Windows no dispone de LibreOffice
  empaquetado: PDF generado con exportador nativo de Word, rasterizado con Poppler;
  todas las 15 páginas finales revisadas. Preservados 17 componentes originales del
  paquete, añadidas figuras y actualizado texto de pies para no fingir envío.
- 2026-11-05: verificador propio: cero fallos locales; 132/142 enlaces literales
  externos pasan cliente HTTP. Siete GitHub con fallo TLS del cliente se verificaron
  por conector, sin desactivar TLS. Dos destinos DOI editoriales y ScienceDirect
  devolvieron403; ScienceDirect sí fue visto en navegador. No hay excepción ni gate
  de push aprobado; rutas dinámicas de 24,994 eventos no comprobadas exhaustivamente.
  Informes privados en outputs/links/. Sin commit, push, publicación ni apagado.
- 2026-11-05: repetición final separada en report_network.json: 131/142 pasan;
  además de los bloqueos anteriores apareció timeout transitorio del DOI AZCATL,
  que había pasado en la primera ejecución. No se considera enlace caído ni se
  concede excepción. report_local.json se reserva para assets locales; un chequeo
  local no sobrescribirá el informe de red. Servidor local reiniciado oculto y
  comprobado HTTP200 en / y /data/revisions.json; PID propio31004. DOCX/PDF vigentes
  preservan hashes de outputs/delivery_manifest.json. PC sigue encendida.
- 2026-11-05: Gabriel autorizó crear el remoto público Seismic_Data_Geosciences y
  conectarlo a la carpeta local. Repo vacío, identidad humana; sin commit ni push.
- 2026-11-05: Gabriel eligió Computers & Geosciences por encaje temático y vía de suscripción
  sin cargo al autor. Preparados prompt/mensaje con las reglas específicas de la revista.
- 2026-11-05: autorizada creación de carpeta y repo local desde cero; preparada continuidad
  autónoma, identidad humana y protección de históricos. Sin commit, push o publicación.
