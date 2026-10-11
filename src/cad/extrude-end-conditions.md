# Condiciones finales de extrusión y corte · 0.8

Implementación: `kernel.extrusion-limits.ts`, integrada en `kernel.engine.ts`. Contrato serializable: `kernel.types.ts`. Regresiones: `kernel.extrusion-limits.test.ts`.

## Contrato e historial

`ExtrudeFeature` conserva `depth` firmado y `symmetric`. La ausencia de `endCondition` mantiene exactamente la definición anterior de profundidad fija o plano medio. Las condiciones nuevas requieren `symmetric:false`; el signo de `depth` selecciona el sentido local y su magnitud se conserva para volver a profundidad fija, pero no limita la geometría.

```ts
type ExtrudeEndCondition =
  | { kind: 'throughAll'; baseFeatureId: string; bothDirections: boolean }
  | { kind: 'untilNext'; baseFeatureId: string }
  | { kind: 'upToSurface'; target: PlaneSupport };
```

`PlaneSupport` identifica un plano principal, un plano de referencia histórico o una cara histórica mediante `FaceReference`. Una cara curva puede ser un destino, aunque no pueda apoyar un croquis plano. Hasta una superficie puede ser la primera extrusión si el destino es un plano anterior.

Las condiciones automáticas quedan ancladas a la operación sólida anterior indicada por `baseFeatureId`. Si esa operación está suprimida, se omite la operación dependiente con aviso; si existe otro cuerpo activo en su lugar, se exige recuperar la base. La supresión del plano/cara destino también se propaga. Las caras perdidas o ambiguas producen un error y bloquean la exportación.

Sólo se conservan catálogos de caras nativas para fuentes referenciadas por destinos. Se capturan cuando el historial alcanza cada fuente y se liberan al terminar la reconstrucción. Así, una cara del bloque base sigue siendo aquella superficie histórica aunque un saliente posterior modifique el cuerpo actual. No se guardan punteros, índices nativos ni coordenadas como sustituto de la referencia. Los límites nuevos se añaden al descriptor de linaje; las operaciones anteriores sin `endCondition` mantienen sus claves byte por byte.

## Construcción geométrica

Los prismas usan el frame real del croquis resuelto: origen, dirección X y normal. Se mantiene la compatibilidad XY/XZ/YZ y los croquis apoyados en caras o planos inclinados. Los perfiles multientidad pasan por el mismo solver y constructor de contornos que las extrusiones anteriores, con agujeros e islas.

### Por todo

En un **corte**, se construye un prisma suficientemente largo para contener el cuerpo en la dirección solicitada y se resta mediante booleanas B-rep. Las proyecciones de la caja envolvente sólo dimensionan la herramienta auxiliar; nunca definen una cara final visible. En ambos sentidos se extiende desde antes del extremo inferior hasta después del extremo superior proyectados. Un sentido sin material o un corte que no intersecta el cuerpo produce un error.

En un **saliente**, no se utiliza el margen de esa herramienta como remate. Se divide el prisma por caras reales del cuerpo y se busca la última salida que cierre todo el perfil. Se consideran también las sucesivas salidas de una misma superficie: una cara toroidal puede cruzar el prisma cuatro veces. Una comprobación booleana exige que no quede material del cuerpo más allá del límite elegido dentro de la columna extruida. La unión añade el material entre el croquis y ese límite exacto. Ambas direcciones se construyen separadamente y se fusionan.

La versión actual exige una cara de salida que cierre el perfil completo en cada dirección pertinente. Una envolvente que sólo pueda formarse combinando varios límites parciales sin una cara completa se rechaza explícitamente. No se reemplaza por una tapa plana en la envolvente global.

### Hasta la siguiente

Se examinan caras **recortadas reales** del único cuerpo activo. La condición requiere una superficie que intercepte todo el perfil; no usa una profundidad mínima global ni combina primeros impactos de rayos independientes.

El prisma se divide con `BRepAlgoAPI_Splitter`. Los componentes comparten las caras creadas por la división. El recorrido desde la tapa inicial cruza las entradas de material y termina en la primera salida completa para un corte; un saliente termina en la primera entrada completa. Esto permite que un corte iniciado fuera del cuerpo atraviese la primera pared, mientras un saliente desde el suelo de una cavidad llegue a su techo interior.

La normal orientada de la cara histórica distingue entrada y salida. Se comprueba su signo en tres posiciones UV del fragmento compartido; signos contradictorios producen un error. Esto es una guardia conservadora, no una prueba general de monotonía de cualquier superficie libre recortada. Los casos contrastados abarcan caras planas, cilindros y múltiples cruces de un toro. No se garantiza resolver todas las superficies libres con repliegues.

Cuando varias caras pueden cerrar el perfil, se exige mediante diferencia booleana que el candidato más cercano quede contenido en todos los demás. Límites que se cruzan o no admiten una ordenación inequívoca se rechazan. Un perfil sobre pared y hueco puede saltarse la tapa interior parcial y terminar en una cara posterior completa; un perfil que desborda todas las caras falla.

### Hasta superficie

Se divide el prisma por la superficie B-rep de destino y se retiene el componente conectado al croquis. Un cilindro completo puede crear tres tramos: debajo, dentro y encima. Un croquis exterior conserva el primero; uno dentro del cilindro termina en su siguiente rama. No se usa el centro, una altura media ni el extremo de la caja de la cara.

Los planos de referencia y las caras planas se extienden analíticamente con `BRepBuilderAPI_MakeFace`. Se admite que el perfil desborde el contorno de la cara plana. Las **caras curvas conservan su recorte y rama seleccionada**: esta versión no extiende automáticamente caras curvas recortadas. Una cara curva insuficiente debe ampliarse en el modelo o reemplazarse por otro destino; la operación informa de que no cierra todo el perfil.

La validación exige conservar toda el área de la tapa inicial y eliminar toda la tapa final artificial, para cada región del perfil. Si queda una isla sin cerrar, o el destino atraviesa parcialmente el croquis inicial, se rechaza toda la operación. Los planos paralelos al sentido de extrusión y los destinos detrás del croquis también se rechazan. La longitud auxiliar tiene un límite de 10.000.000 mm para evitar operaciones numéricamente desproporcionadas.

## Validez, medición y matrices

Cada herramienta y cada resultado pasan por `BRepCheck_Analyzer`, volumen positivo y las comprobaciones booleanas indicadas. Los salientes avanzados sin aportación de material se rechazan. El motor exporta la geometría B-rep en STEP; la malla visible no interviene en estas operaciones.

Replicad mide volumen por defecto sin integración adaptativa. En curvas recortadas, esa medición puede variar apreciablemente tras una fusión aunque la superficie sea la misma. Los historiales con condiciones nuevas activas usan `BRepGProp.VolumeProperties` con tolerancia solicitada `1e-10`. Los documentos exclusivamente legacy mantienen su medición anterior. La tolerancia de integración no equivale a una garantía de diez decimales para toda geometría o representación STEP.

Las matrices en modo `geometryPattern:true` siguen copiando las aportaciones geométricas añadidas y retiradas por la operación histórica. Una semilla terminada con Por todo/Hasta siguiente/Hasta superficie guarda su aporte real; no vuelve a resolver su condición final en cada copia. El recálculo de condiciones por instancia sigue fuera de alcance.

## Evidencia y regresiones

Las pruebas verifican sentidos positivo/negativo y ambos sentidos desde dentro y fuera del cuerpo, planos XZ/YZ, soporte inclinado, agujeros e islas, pérdida de cobertura, caras históricas, cambios de profundidad, supresión, semillas de matriz, la primera/última salida de un toro y las tres fábricas públicas de ejemplos. Se importan los STEP exportados y se comprueba B-rep válido, volumen y número de sólidos.

Se añaden ocho regresiones de documentos guardados desde la interfaz, con sus claves de cara serializadas: placa de 12 mm, cambio a 35 mm, corte en ambos sentidos desde su plano interior, caja con corte Hasta siguiente, cambio a las dos paredes, salientes hasta techo cilíndrico R5/R7 y primera extrusión de un rectángulo acotado 40 × 30 hasta un plano a 45 mm. Este último mantiene el nombre interno `Pieza1` de la copia UI, conserva cuatro entidades/seis restricciones y reconstruye `54000,00000125143 mm³`; cambiar el plano a 30 mm recompone 36000 mm³ dentro de la tolerancia del solver.

Los ocho documentos reabren sin errores y exportan un sólido válido; los tres STEP realmente exportados desde la UI tienen diferencia de volumen, envolvente y diferencia simétrica **0** respecto a la reconstrucción exportada en pruebas. Las copias exactas de esos STEP y sus hashes están en [fixtures/solidflow-ui](fixtures/solidflow-ui/README.md); los documentos permanecen en `examples/`.

`BRepFeat_MakeDPrism.Perform(Until)` no se usa como sustituto general: un ensayo curvo de viabilidad eligió otra intersección. La solución implementada usa división B-rep exacta y selección explícita de componentes.

Referencia del motor: [OCCT BRepAlgoAPI_Splitter](https://occt3d.com/doc/refman/html/class_b_rep_algo_a_p_i___splitter.html).
