# Barrido y recubrir (0.5)

Las dos operaciones construyen BRep con OpenCascade, a partir de los croquis resueltos por el solver y de sus sistemas de coordenadas asociativos. La malla sólo sirve para visualizar. Los perfiles clásicos y las claves de referencias de operaciones 0.2–0.4 conservan su comportamiento anterior.

## Barrido

- Un contorno cerrado simple de líneas, arcos y/o círculo; sin agujeros ni islas.
- Una selección explícita de 1–128 líneas/arcos del croquis de recorrido. Los identificadores y sentidos fijan el orden, con independencia del orden del array de entidades.
- La selección debe formar una cadena abierta continua, sin ramificaciones, duplicados, superposiciones ni intersecciones. La construcción queda excluida. Se pueden seleccionar sólo algunas entidades del recorrido.
- El inicio del recorrido debe pertenecer a la región del perfil. La normal de su plano debe ser paralela a la tangente inicial, en cualquiera de sus dos sentidos. No se desplaza ni gira el perfil automáticamente.
- `BRepOffsetAPI_MakePipeShell`, triedro Frenet corregido, sin ley de torsión adicional. Esquinas con transición `RightCorner` (inglete), no redondeo automático.
- Una guardia analítica calcula la extensión real del perfil en la dirección interior de cada arco. Rechaza alcanzar o cruzar el centro de curvatura: `BRepCheck_Analyzer` por sí solo acepta algunos toros autointersectados.

El recorrido sigue siendo plano porque pertenece a un croquis 2D. No hay hélices, trayectorias 3D, guías, leyes de escala ni controles de torsión. Una discontinuidad difícil en el recorrido puede producir un error nativo; no se sustituye el resultado por una aproximación visual.

## Recubrir

- De 2 a 32 croquis distintos, con un contorno cerrado simple cada uno, en planos resueltos arbitrarios. No exige coaxialidad ni paralelismo.
- Las secciones deben tener idéntica secuencia de tipos de arista (línea/arco/círculo), contada desde la entidad inicial y en el sentido indicado. No se inventa correspondencia entre agujeros, islas, distintos números de aristas ni distintos tipos.
- En perfiles multientidad, `startEntityId` fija la primera arista; `reversed` indica recorrer esa arista desde su extremo final. El resto se deduce por continuidad. En un círculo, la unión está en el radio local +X. El rectángulo clásico empieza en la esquina inferior izquierda, hacia la derecha; `null` usa esa unión local.
- `BRepOffsetAPI_ThruSections` recibe `CheckCompatibility(false)`: OpenCascade no puede girar uniones, invertir contornos ni dividir aristas para cambiar silenciosamente la correspondencia guardada.
- `ruled=true` une secciones consecutivas con superficies regladas. `false` utiliza el recubrimiento suave nativo. No hay condiciones de tangencia terminal, guías ni secciones puntuales.
- Las regiones de secciones distintas no pueden tocarse ni intersectarse. Un orden o una correspondencia que impida construir un sólido válido genera un error recuperable.
- Cada terna de planos paralelos debe avanzar monótonamente en su dirección normal, ascendente o descendente. Se bloquea, por ejemplo, el orden de alturas 0→55→25: los intervalos vuelven hacia el mismo lado de la sección compartida y pliegan el recubrimiento. Esta guardia se aplica a los modos reglado y suave; no impone monotonía de Z global a secciones de distinta inclinación.
- En cada intervalo reglado (y en el caso de sólo dos secciones), se rechaza la anulación interior de la tangente interpolada. Para líneas la comprobación es exacta en toda la cara: bloquea, por ejemplo, cuadrados con desfase de unión de 180°, que crearían una cintura puntual aunque el analizador nativo los aceptara. Los arcos/círculos comprueban además nueve parámetros correspondientes de su contorno. El giro de unión de 90° de un cuadrado sigue permitido si produce un sólido válido.

## Validación, cuerpos y referencias

Cada herramienta debe contener exactamente un sólido, tener volumen positivo y superar `BRepCheck_Analyzer` con controles geométricos. `merge=true` debe producir una única fusión conectada con el cuerpo anterior. `merge=false` conserva los cuerpos como compuesto y muestra el aviso de varios sólidos existente. Los STEP contienen la geometría BRep resultante.

La validación nativa comprueba cierre, coherencia topológica y curvas sobre superficies. No constituye una prueba matemática exhaustiva contra toda posible autointersección global de un barrido muy plegado o de un recubrimiento suave; las guardias analíticas de entrada y curvatura cubren los casos descritos arriba.

La supresión de cualquier croquis o de su soporte omite transitivamente la operación y sus hijos. Las caras para soportes posteriores se catalogan en el punto histórico correspondiente. La estructura persistente incluye los croquis, soporte, orden, sentido, unión, modo de fusión y tipo reglado/suave; no incluye cotas. Cambiar una cota simple puede conservar referencias, pero cambiar una correspondencia invalida referencias de forma conservadora. No es un sistema de nombres topológicos general.

## Evidencia

`kernel.sweep-loft.test.ts` prueba líneas, arcos, cadena mixta, inglete, recorrido invertido, restricciones, fallos de entrada, singularidad de curvatura, lofts de 2/3/32 secciones, desplazamiento lateral, planos inclinados e invertidos, correspondencia de líneas/arcos, soporte asociativo, supresión, multicuerpo y STEP. Las factorías de ejemplo de la UI se serializan y reabren antes de construirlas.

En superficies regladas oblicuas y superficies suaves, la integración nativa del volumen es numérica. Por ejemplo, el ensayo de tres círculos desplazados difiere de su fórmula analítica en aproximadamente 3e-5 mm³; su umbral absoluto es 1e-4 mm³.
