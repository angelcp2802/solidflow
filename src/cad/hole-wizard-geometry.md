# Asistente para taladro geométrico · 0.9

Implementación B-rep: `kernel.holes.ts`; historial: `kernel.engine.ts`; contrato serializable: `kernel.types.ts`; pruebas: `kernel.holes.test.ts`.

## Definición

Un `HoleFeature` registra una base sólida anterior, un `PlaneSupport`, entre 1 y 128 centros `{id,x,y}`, sentido, diámetro, condición final y cabeza. Las posiciones se expresan en milímetros dentro del frame del soporte. Los identificadores permiten editar/reordenar centros sin persistir índices de caras o punteros nativos.

El soporte puede ser un plano principal, un plano de referencia anterior o una cara **plana** histórica. `reversed:false` perfora hacia la normal negativa del soporte; al seleccionar una cara exterior esto apunta al interior de la pieza. `reversed:true` invierte el sentido. Los puntos conservan los ejes X/Y del soporte incluso al invertir la perforación.

```ts
type HoleEndCondition =
  | { kind: 'blind'; depth: number; depthReference: 'shoulder' | 'tip';
      tip: { kind: 'flat' } | { kind: 'conical'; angle: number } }
  | { kind: 'throughAll' }
  | { kind: 'untilNext' };

type HoleHead =
  | { kind: 'simple' }
  | { kind: 'counterbore'; diameter: number; depth: number }
  | { kind: 'countersink'; diameter: number; angle: number };
```

Los ángulos son **incluidos** y se expresan en grados, entre 1° y 179°. La punta plana es una opción propia, no un cono de 180° degenerado. Los diámetros/profundidades introducidos admiten 0,01–100.000 mm; las coordenadas locales, ±1.000.000 mm. La profundidad cónica derivada tiene un límite de 10.000.000 mm. El tramo cilíndrico debe ser positivo por encima de la tolerancia de construcción.

## Punta y cabezas exactas

Para diámetro `d`, radio `r=d/2` y ángulo incluido de punta `a`, su altura es `h=r/tan(a/2)`:

- Profundidad **al hombro**: el cilindro mide `depth` y el ápice queda a `depth+h` desde la entrada.
- Profundidad **a la punta**: el cilindro mide `depth−h` y el ápice queda a `depth`.
- Punta plana: el cilindro mide `depth` con ambas referencias.

La punta se construye por revolución de un triángulo de líneas exactas. El resultado contiene una superficie cónica nativa, no una malla ni un conjunto de escalones.

El **refrentado** es un cilindro de diámetro mayor `D` y profundidad propia medida desde la misma entrada. El **avellanado** es un tronco de cono que empieza con diámetro `D` y termina con `d`, con altura `(D−d)/(2 tan(a/2))`. Ambos se unen a la herramienta principal y se restan del cuerpo mediante booleanas B-rep.

En ciego, la profundidad del rebaje no puede superar la longitud cilíndrica efectiva. Esta es una **restricción propia de SolidFlow 0.9** para conservar un perfil de taladro convencional. Los perfiles replegados con poste central están fuera del alcance actual.

## Condiciones automáticas

Por todo reutiliza la herramienta exacta de `kernel.extrusion-limits.ts`, siguiendo la dirección local. La longitud auxiliar sólo garantiza atravesar el cuerpo; no se deriva de una altura global Z. Las condiciones automáticas no incluyen una punta ciega.

Hasta siguiente utiliza la búsqueda geométrica de 0.8: se resuelve, para cada círculo, una salida de material que cierre todo ese perfil. Cada centro se resuelve contra la **base original de la operación**, de forma que añadir o reordenar centros no altera la superficie encontrada por otro taladro.

Como restricción propia para perfiles convencionales, la profundidad del rebaje tampoco puede superar la salida Hasta siguiente en el cilindro central del taladro. Se comprueba mediante una diferencia B-rep: el cilindro de diámetro `d` y altura del rebaje debe estar contenido en la herramienta resuelta. Así se respetan salidas inclinadas o curvas sin reducirlas a una profundidad central ni a una caja envolvente. Si no cabe, la operación se rechaza entera con un mensaje para reducir el rebaje o cambiar la condición final. El diámetro exterior del rebaje no gobierna la búsqueda de salida y su herramienta no se recorta a esa superficie; mantiene su geometría y profundidad propia, incluyendo posibles recortes laterales. La cobertura actual no verifica todas las combinaciones de rebaje ancho y salida inclinada.

## Contacto, solapes y validez

El asistente parte de un único cuerpo conectado. Se valida cada posición contra ese cuerpo original: la herramienta de cada taladro debe retirar material. Dos centros coincidentes, identificadores repetidos o una posición sin contacto producen error en toda la operación. No se acepta silenciosamente una lista porque sólo uno de sus centros funcione.

Los taladros distintos pueden solaparse. Las restas booleanas calculan su unión geométrica efectiva; no se suman volúmenes nominales ni se resta dos veces una región compartida. Los rebajes que desbordan parcialmente el cuerpo también producen recortes B-rep reales si existe contacto; el asistente no exige una pared de material alrededor de todo el círculo. Esto no sustituye comprobaciones de espesor mínimo o diseño para fabricación.

Las herramientas y resultados pasan por `BRepCheck_Analyzer` y volumen positivo. El material retirado se mide directamente sobre `base.cut(resultado)`, evitando depender de una resta numérica entre dos masas grandes para detectar un taladro pequeño. La medición de historiales con taladros usa integración adaptativa OCCT solicitada a `1e-10`; esa cifra no representa una garantía universal de precisión física.

## Historial, referencias y edición

`baseFeatureId` debe identificar el cuerpo activo anterior. Cambiar el historial de modo que haya otra base exige recuperar la selección. La supresión de la base o del soporte omite los taladros dependientes con aviso; referencias de cara perdidas, ambiguas o curvas bloquean la operación y su exportación.

La cara de soporte se resuelve en su posición histórica, incluso si un saliente posterior ya la modificó en el cuerpo final. `CadResult.holes` expone `{id,frame}` para el editor de posiciones. El frame se registra antes de validar la lista de centros, por lo que una lista vacía aún puede editarse sobre el plano correcto.

El linaje incluye los IDs de los centros y sus roles ordinales en los ejes locales. Reordenar la lista no modifica su identidad. Editar dimensiones manteniendo el orden espacial conserva esa estructura; intercambiar dos centros etiquetados o cruzar su orden exige recuperar referencias dependientes. La guardia evita reasignar silenciosamente una cara simétrica a otro taladro. Se mantienen además las guardias geométricas/topológicas conservadoras del catálogo de caras.

Una operación de taladro puede ser semilla de una matriz geométrica. Se copia su aportación retirada real, incluyendo punta y rebaje. Las condiciones finales no se recalculan por instancia: ése sigue siendo el contrato `geometryPattern:true` de 0.6.

## Alcance y evidencia

Esta entrega ofrece taladros geométricos personalizados. No incluye todavía catálogos ISO/ANSI de tornillería, ajustes de holgura por norma, roscas físicas o cosméticas, agujeros ranurados ni centros sobre caras curvas. El editor conserva coordenadas X/Y por centro; no representa restricciones dimensionales entre centros como un solver de croquis completo.

Las pruebas cubren profundidad al hombro/ápice, punta plana/conoidal, refrentado y avellanado, soportes XZ/YZ e inclinados, varios centros, solapes y orden, condiciones automáticas, cambios de espesor, referencia histórica, supresión, pérdida de selección, errores de posición, frame de editor vacío y matrices. Las tres fábricas públicas `createHoleExample` se serializan/reabren y exportan a STEP, con cuatro centros cada una.

## Documentos guardados desde la interfaz

Nueve documentos `.solidflow` reales se leen con `parseDocument`, se serializan/reabren conservando parámetros, posiciones e identificadores de soporte, se reconstruyen sin mutar su historial y se exportan/reimportan como STEP. Todos los resultados son B-rep válidos con un sólido. Las masas reconstruidas son:

| Documento | Volumen mm³ |
| --- | ---: |
| Taladros ciegos hasta hombro | 165828,30044087538 |
| Taladros ciegos hasta punta | 166311,54122335688 |
| Cinco taladros hasta punta | 165889,42652919597 |
| Placa con taladros refrentados | 160761,77052612926 |
| Refrentados de 6 mm | 159555,3989471506 |
| Placa con taladros avellanados | 162102,1833916608 |
| Avellanados de 100 grados | 162274,72173121182 |
| Caja con dos taladros hasta siguiente | 70985,62842102151 |
| Caja con dos taladros pasantes | 70583,50456136206 |

Las copias exactas de los cuatro STEP exportados por la interfaz y sus hashes están en [fixtures/solidflow-ui](fixtures/solidflow-ui/README.md). Cinco taladros hasta punta, refrentados, avellanados y caja pasante tienen respectivamente 50.104, 50.406, 46.551 y 51.272 bytes. Comparados con la regeneración de sus documentos, los cuatro dan diferencias de volumen, área, envolvente y diferencia simétrica iguales a cero. Las nueve regresiones de estos documentos se mantienen en `kernel.holes.test.ts`.
