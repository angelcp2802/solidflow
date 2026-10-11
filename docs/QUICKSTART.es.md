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

Para probar la compilación de producción, ejecuta `npm run build` y `npm start`.
Los paquetes de desarrollo se generan en el sistema correspondiente con
`npm run package:win`, `npm run package:mac` o `npm run package:linux`.
Son paquetes sin firma; revisa los resultados de CI antes de asumir soporte en
un sistema concreto.

Las incidencias y PR pueden escribirse en español o inglés. La
[guía de contribución](../CONTRIBUTING.md) explica cómo colaborar.
