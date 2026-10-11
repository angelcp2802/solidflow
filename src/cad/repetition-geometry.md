# Matrices y simetría de geometría (0.6)

El contrato distingue `source.mode='features'` con `geometryPattern:true` y `source.mode='body'`. Son dos operaciones distintas sobre BRep real; el modo de operaciones nunca se sustituye por una copia del cuerpo completo. Este algoritmo de deltas es una implementación propia con OpenCascade.

## Aportación histórica de una operación

Para una semilla seleccionada se retienen las diferencias de conjuntos entre el cuerpo inmediatamente anterior y el resultado validado:

```
added   = after − before
removed = before − after
```

Sin cuerpo anterior, `added` es el primer sólido. Las diferencias vacías se omiten. Una semilla sin aportación, con deltas inválidos o con volumen incompatible con esa diferencia se rechaza explícitamente. El balance de volumen detecta, entre otros casos, cuerpos superpuestos que no pueden tratarse como una simple diferencia de conjuntos; requieren un futuro gestor de cuerpos individuales.

Cada instancia transforma estos BRep con traslación, rotación o reflexión. Las semillas se aplican en el orden del historial, retirando material y añadiéndolo después. El croquis resuelto y sus cotas se reconstruyen antes de capturar la aportación, de modo que editar la semilla actualiza las instancias.

Esto admite extrusión, corte, revolución, barrido, recubrir, redondeos, chaflanes y matrices anteriores. Un redondeo convexo aporta material retirado; uno cóncavo puede aportar material añadido. Una matriz anidada aporta sus instancias nuevas y no vuelve a incluir su semilla original.

No se regeneran condiciones finales, referencias locales ni croquis en cada posición. Por ejemplo, un corte original de herramienta30mm que sólo retiró10mm de una placa copia esos10mm de material retirado. Si su nueva posición coincide con un saliente más alto, no alarga automáticamente el corte para atravesarlo. El test correspondiente diferencia explícitamente el resultado de reutilizar una herramienta sin recortar.

El modo de operaciones exige un único cuerpo de partida y un resultado conectado después de cada efecto booleano. Un efecto que no cambia material o elimina todo el sólido genera un error recuperable. Estas condiciones son conservadoras: no admiten todas las estrategias de reconstrucción de un CAD con gestión individual de cuerpos.

## Copia de cuerpos

El modo cuerpo captura el resultado completo en el punto histórico indicado por `sourceFeatureId`, aunque después haya otras operaciones sobre el documento. Esa fuente debe contener exactamente un sólido.

Las matrices lineales y circulares conservan las copias como cuerpos separados. La simetría también puede fusionarlas con `mergeBodies:true`, siempre que el resultado quede conectado. Se rechazan las copias geométricamente coincidentes con un cuerpo existente; una transformación no trivial de un cuerpo simétrico también puede ser una duplicación. No hay selección de un cuerpo individual dentro de una fuente histórica multicuerpo.

## Instancias y soportes

- Los recuentos incluyen la semilla original; la identidad no se vuelve a aplicar.
- La matriz lineal normaliza sus direcciones. Con segunda dirección repite la retícula completa, o sólo la semilla en esa dirección cuando `secondSeedOnly=true` (total `n+m−1`). Las omisiones conservan direcciones enteras `[i,j]`, no índices de enumeración nativa.
- En la matriz circular con distribución uniforme, el paso es `360/count` para una vuelta completa, y `angle/(count−1)` para un arco parcial. Sin distribución uniforme, `angle` es el incremento entre instancias. `reversed` cambia el signo. La rotación usa regla de la mano derecha alrededor del eje indicado.
- La simetría resuelve un plano principal, plano de referencia o cara plana histórica con las mismas reglas asociativas de0.4.
- Límite256 instancias incluida la semilla antes de omisiones; máximo32 operaciones seleccionadas y512 aplicaciones semilla×copia después de omisiones. Las direcciones nulas, pasos degenerados, direcciones/ángulos que duplican instancias y omisiones inválidas se rechazan.

`baseFeatureId` debe corresponder a la operación sólida activa inmediatamente anterior. Base, semilla o plano suprimidos omiten transitivamente la operación; identificadores inexistentes, posteriores o referencias caducadas bloquean la reconstrucción/exportación. No se aplica una matriz silenciosamente sobre un cuerpo alternativo.

Sólo se retienen los cuerpos y deltas necesarios para referencias posteriores; todos se liberan al terminar la reconstrucción, también tras errores. La exportación atómica conserva el mecanismo existente.

## Referencias y alcance de validación

Las claves de operaciones0.2–0.5 se mantienen byte a byte. El historial estructural de las nuevas operaciones incorpora semillas, orden, soportes, recuentos, sentidos y omisiones. Los catálogos de caras/aristas siguen usando correspondencia geométrica conservadora y única; no se introduce búsqueda por cercanía ni por índice nativo.

Cambiar una cota puede conservar una referencia si sigue existiendo una coincidencia única. No se garantiza identidad general de una cara de instancia después de editar separaciones, ángulos, número de copias o topología; una referencia que no coincide exige reselección. La validez nativa y las guardias descritas no son una demostración universal contra autointersecciones para todas las operaciones generadoras.

## Evidencia

`kernel.patterns.test.ts` cubre matrices2D, sólo semilla, omisiones, distribución circular completa/parcial/incremental e invertida, simetría asociativa, edición de semilla, matrices anidadas, acabado convexo/cóncavo, fuente de cuerpo histórica, fusión de simetría, supresión, límites, errores y STEP. Las tres factorías de la UI se serializan y reabren antes de construirlas.

Los ensayos de fillet y chamfer en un saliente comparan la copia de su aporte con terminar directamente las aristas de ambos salientes. Coinciden tanto en volumen como en diferencia simétrica BRep0. Esto incluye un fillet cóncavo que añade material.

### Archivos guardados desde la interfaz

Las seis piezas reales de `examples/` se leen sin modificarlas, pasan por `parseDocument` y por una nueva serialización, y se reconstruyen con el motor WASM. Cada una conserva sus parámetros y se exporta a STEP; su reimportación produce un BRep válido con un solo sólido, volumen y límites coincidentes. La copia exacta del STEP de la brida exportado desde la interfaz y su hash están en [fixtures/solidflow-ui](fixtures/solidflow-ui/README.md).

| Documento guardado | Volumen reconstruido (mm³) | Límites Z (mm) |
|---|---:|---:|
| Placa con matriz de cinco taladros | 82303.53996706153 | 0 a 12 |
| Brida circular de tres taladros inversa | 39006.01438697086 | 0 a 8 |
| Placa con salientes simétricos | 87392.92006587698 | 0 a 27 |
| Simetría de cuerpo fusionada | 171392.92006587697 | −27 a 27 |
| Simetría de cuerpo sobre cara | 168678.58401317542 | −3 a 27 |
| Matriz de cinco taladros R4 | 80984.07105257736 | 0 a 12 |

El STEP de la brida exportado directamente por la UI, de 17097 bytes, mide 39006.0143869719 mm³. Su diferencia respecto a la reconstrucción es 1.04046193882823e−9 mm³; los límites coinciden exactamente y la diferencia simétrica BRep frente a una nueva exportación es 0 mm³. La diferencia de 2.36e−8 mm³ del ejemplo R4 respecto al valor analítico nominal se debe al radio resuelto guardado, 3.9999999999843956 mm, dentro de la tolerancia del solver.

La clave de la cara guardada en el ejemplo de simetría se reutiliza literalmente al escalar todas las cotas Z por 4/3: cambia el plano de reflexión de Z12 a Z16, sin volver a seleccionar la cara, y los límites pasan a −4 y 36 mm. Cambiar después sólo la profundidad de la placa altera la firma geométrica normalizada: la prueba verifica un error explícito de reselección y el bloqueo de exportación. Este último caso documenta el límite conservador del identificador, sin atribuirle persistencia general ante cualquier edición dimensional.

Las regresiones se ejecutan en `kernel.patterns.test.ts`. Para regenerar el informe local, ejecutar esa suite con `SOLIDFLOW_CAD_REPORT=1`; la ejecución habitual no sobrescribe artefactos.
