# Primeros pasos con SolidFlow

SolidFlow es un CAD paramétrico libre, con interfaz azul y controles actualmente
en español. El proyecto está en desarrollo; los módulos desactivados todavía
no están implementados. Consulta el [alcance](ROADMAP.md) y la [validación](VALIDATION.md).

## Abrir desde el código

Instala Git y Node.js 24. En una terminal:

```sh
git clone https://github.com/angelcp2802/solidflow.git
cd solidflow
npm ci
npm run desktop
```

En la biblioteca puedes abrir una pieza de ejemplo, editar su croquis y cambiar
las cotas. Acepta el croquis para reconstruir el sólido. Usa Ctrl+Z/Ctrl+Y para
deshacer y rehacer, F para encuadrar y Ctrl+7 para la vista isométrica.
Guarda el documento editable como `.solidflow`. Desde Archivo puedes exportar
la geometría a STEP o STL. La exportación no conserva el historial paramétrico.

Para partir de geometría existente, elige **Archivo → Importar STEP…** y un
archivo `.step` o `.stp` de hasta 8 MiB con un único sólido cerrado. El programa
valida la pieza antes de pedir sustituir el documento actual. Selecciona sus
caras para añadir croquis o taladros y guarda el resultado como `.solidflow`;
los datos importados quedan dentro del documento. No se recupera el historial
de diseño original. Consulta las unidades admitidas y límites en la
[guía de importación](STEP_IMPORT.md).

Para practicar la simetría, abre **Simetría de medio perfil** en la biblioteca,
edita su croquis y elige **Simetría de croquis**. Selecciona los tres tramos y
el eje de construcción en **Con respecto a**, mantén los puntos sobre el eje
compartidos y aplica. Pulsa Esc para terminar la herramienta y acepta el
croquis; después puedes extruir 4 mm y editar la cota de semianchura.
Las copias siguen las cotas de las fuentes. El [contrato de simetría](SKETCH_MIRROR.md)
detalla las relaciones, la compatibilidad y la validación disponible.

Para practicar la equidistancia, abre **Equidistancia de una placa**, edita el
croquis y elige **Equidistancia**. Selecciona un lado del rectángulo y mantén
**Seleccionar cadena conectada**. Con distancia 1 mm, la vista previa muestra
el contorno exterior de 12 × 8 mm. Aplica, pulsa Esc y acepta el croquis.
Al extruir 4 mm, los dos contornos ordinarios producen un anillo de
144 mm³. Si eliges **Entidades originales** como geometría de construcción,
el contorno exterior produce una placa llena. La cota de equidistancia queda
editable en el inspector. Consulta los cierres, las cotas conducidas y los
límites en la [guía de equidistancia](SKETCH_OFFSET.md).

Para probar la compilación de producción, ejecuta `npm run build` y `npm start`.
Los paquetes de desarrollo se generan en el sistema correspondiente con
`npm run package:win`, `npm run package:mac` o `npm run package:linux`.
Son paquetes sin firma; revisa los resultados de CI antes de asumir soporte en
un sistema concreto.

Las incidencias y PR pueden escribirse en español o inglés. La
[guía de contribución](../CONTRIBUTING.md) explica cómo colaborar.
