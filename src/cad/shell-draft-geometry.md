# Vaciado y desmoldeo con caras persistentes — 0.7

El contrato serializado está en `kernel.types.ts`: `ShellFeature`, `DraftFeature` y la unión `FaceOperationFeature`. La geometría se construye con BRep de OpenCascade; los triángulos de pantalla no intervienen en las operaciones ni en la exportación STEP. Las longitudes son milímetros y los ángulos se guardan en grados.

## Datos y referencias

Ambas operaciones guardan `baseFeatureId`, el identificador de la operación sólida activa inmediatamente anterior. Las referencias de selección usan el catálogo `face-v1` existente, con `sourceFeatureId` igual a esa base. El motor exige correspondencia única de la clave completa: nunca escoge una cara por índice, cercanía o posición aproximada.

`ShellFeature` contiene `thickness` entre 0,01 y 100.000 mm, `direction: 'inward' | 'outward'` y `removedFaces`, una lista sin duplicados de hasta 256 referencias. Una lista vacía significa cavidad cerrada. No se permite eliminar todas las caras del sólido.

`DraftFeature` contiene `angle` entre 0,01° y 89,9°, `reversed`, `faces` con entre 1 y 256 referencias, `support` para el plano neutro y `propagation: 'tangent'`. El soporte admite un plano principal, un plano de referencia o una cara plana histórica. Su normal define la dirección de extracción; `reversed` cambia el signo del ángulo. No se guarda un vector de extracción independiente. En una cara que ya es cónica, el ángulo solicitado es el desmoldeo respecto a esa dirección, no un incremento que se sume al anterior.

La supresión de una base o de un soporte omite transitivamente la operación. Una referencia inexistente, posterior, ambigua o incompatible detiene la reconstrucción y bloquea la exportación. La UI conserva los parámetros para que se pueda corregir la selección. Las estructuras y claves de operaciones anteriores a 0.7 no cambian.

## Vaciado

Las aperturas planas usan `BRepOffsetAPI_MakeThickSolid.MakeThickSolidByJoin`, con `GeomAbs_Intersection`, tolerancia de 1e−6 mm y espesor nativo negativo para el interior. La unión por intersección conserva las esquinas de los casos comparados; la unión `GeomAbs_Arc` redondearía determinadas esquinas exteriores y daría un volumen distinto. Se pasa el único `Solid` contenido en el resultado, aunque el contenedor procedente de una fusión o un redondeo sea un `Compound`.

Una cavidad cerrada se forma mediante la diferencia de conjuntos entre el sólido original y su offset nativo completo. Para el interior se resta el offset al original; para el exterior se resta el original al offset. Usar `MakeThickSolidByJoin` con una lista de cierre vacía no basta: puede devolver solamente el offset. La regresión comprueba que la exportación del resultado cerrado contiene **un sólido con dos envolventes**, además de su volumen y validez.

Las aperturas que incluyen caras curvas se construyen desde la pared cerrada. En el sentido interior, el historial nativo `Generated(face)` identifica una única cara del offset para cada selección. Esa cara paralela se engrosa hacia fuera mediante `MakeThickSolidBySimple` y su volumen se retira de la pared. En el sentido exterior se engrosa la cara original. Se corrige la orientación del sólido de apertura cuando la API nativa devuelve volumen firmado negativo. Es una composición de offsets y booleanas exactas; no hay una herramienta prismática o una malla que sustituya a la superficie curva.

Esta ruta resuelve el caso de una esquina cilíndrica de una caja redondeada que la llamada directa de vaciado no resolvía correctamente. También se prueban dos aperturas curvas separadas y el sentido exterior. Se rechaza una correspondencia del offset que pierda o divida la cara seleccionada, porque no habría una identificación única de la apertura.

Las aperturas que incluyen curvas y comparten una arista entre sí se rechazan explícitamente. Aplicar engrosamientos independientes en ese caso podría dejar un nervio artificial en la esquina común. Esta limitación no afecta a las aperturas múltiples exclusivamente planas de la ruta nativa, incluidas dos caras adyacentes verificadas desde la UI.

Se comprueban BRep válido, volumen positivo, un solo sólido y material en el lado correcto. Cuando existe un offset interior cerrado válido, la cavidad abierta debe retirar también ese núcleo completo. Esta comprobación adicional evita aceptar un resultado casi macizo sólo porque `BRepCheck_Analyzer` lo considere válido. Un espesor que hace desaparecer el offset produce un diagnóstico en español antes de intentar convertir el resultado nulo.

## Desmoldeo

Se usa directamente `BRepOffsetAPI_DraftAngle`, comprobando `AddDone()` tras cada cara e `IsDone()` tras construir. Se admiten caras planas, cilíndricas y cónicas. El plano neutro mantiene su intersección con las caras y puede estar desplazado, inclinado u orientado mediante los soportes existentes.

La propagación a caras tangentes es parte del algoritmo nativo; no se ofrece un modo independiente sin propagación. El parámetro nativo `Flag` no es un selector de propagación. Se utiliza `Flag=true`, que permite el tratamiento directo del cilindro y el cono; el wrapper de alto nivel de Replicad 1.1.0 usa `false`, que falla en el cilindro ensayado. El motor verifica además que el resultado conserve los recuentos de caras y aristas, sea un sólido válido y cambie material. La comprobación de cambio usa diferencia simétrica, ya que un desmoldeo alrededor de un plano intermedio puede añadir y retirar exactamente el mismo volumen.

Hay una guardia específica contra el cruce del vértice de una superficie cónica. Dos generatrices muestreadas en los extremos de su intervalo paramétrico permiten detectar el punto interior donde se anula su separación. El caso cilindro R15, altura 20, desmoldeo 45° cruza el vértice y se rechaza aunque la validación básica nativa lo acepte. La guardia es conservadora respecto al intervalo paramétrico de caras recortadas complejas.

No se incluyen desmoldeo por línea de partición, escalonado, dirección de extracción independiente, distintos ángulos por cara ni superficies arbitrarias. El algoritmo nativo y estas guardias no constituyen una demostración universal contra cualquier autointersección de un modelo complejo.

## Historial y memoria nativa

El motor registra estas operaciones igual que los demás cambios de sólido. Pueden ser semillas de una matriz de geometría: se copia su aportación histórica real de material añadido y retirado. Las regresiones prueban la cavidad de un vaciado y la retirada de un desmoldeo sobre un segundo bloque conectado. No se copia el cuerpo completo para simular una semilla de operación.

`kernel.native.ts` define la conversión que consume un handle nativo. En Replicad, `cast(raw)` crea otro wrapper al hacer el downcast y no libera `raw`. Se liberan expresamente los retornos de `Shape()`, `Reversed()` y `Generated(face).First()` después de convertirlos, incluidos resultados nulos y errores de tipo. Una prueba WASM verifica que el raw se borra, el wrapper resultante sigue válido y el contenido de la lista nativa permanece accesible. Los builders, catálogos y herramientas temporales se liberan también al fallar.

## Evidencia geométrica

`kernel.face-operations.test.ts` cubre casos analíticos, fábrica asíncrona usada por la UI, espesores y ángulos editados, soportes, supresión, referencias conservadas, errores, matriz de operaciones, exportación STEP, handles nativos y documentos reales guardados.

Ocho `.solidflow` reales se reconstruyen desde `examples/`. Las copias exactas de los tres STEP exportados desde la interfaz y sus hashes están en [fixtures/solidflow-ui](fixtures/solidflow-ui/README.md). Los tres STEP tienen diferencia simétrica 0 respecto a la nueva exportación. Sus diferencias absolutas de volumen respecto a la reconstrucción son 0 mm³ para la caja exterior con dos aperturas, 8,15e−10 mm³ para el desmoldeo asociado a la cara superior editado a 50 mm y 1,13e−10 mm³ para la apertura curva. El ejemplo de 40 a 50 mm conserva literalmente la referencia de su cara neutra; produce 205468.04147037026 mm³.

Las ejecuciones normales no reescriben los informes. Se regeneran con `SOLIDFLOW_CAD_REPORT=1` al ejecutar esta suite. La correspondencia geométrica de caras sigue siendo conservadora: algunas ediciones que un CAD con identificación topológica general resolvería requieren reselección explícita.

Fuentes primarias del motor abierto: API y código de Replicad 1.1.0 y replicad-opencascadejs 1.1.0; [referencia de BRepOffsetAPI_DraftAngle](https://occt3d.com/dev/doc/refman/html/class_b_rep_offset_a_p_i___draft_angle.html); [implementación de Draft_Modification de OCCT](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_8_0/src/Draft/Draft_Modification_1.cxx).
