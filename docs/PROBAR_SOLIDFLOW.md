# Probar SolidFlow

SolidFlow es un prototipo CAD en desarrollo. La entrega local indica su fecha y
versión de origen; los resultados de una demo corresponden a esa entrega.
El [registro de validación](VALIDATION.md) y los
[criterios de la versión utilizable](USABLE_VERSION_ACCEPTANCE.md) recogen los
casos comprobados y el trabajo pendiente.

## Abrir la demo local

Abre el acceso de escritorio que acompaña a la entrega. Si recibes una carpeta
de aplicación, abre `SolidFlow.exe` y conserva los demás archivos de esa carpeta.
Guarda el documento que tengas abierto antes de comenzar la prueba.
Una sesión recuperada puede aparecer como **Sin guardar**: usa **Guardar como…**
para asociar esa copia a un archivo de tu carpeta.

## Primera pieza

1. Pulsa **Ctrl+N** y elige **Pieza**.
2. En la pestaña **Croquis**, pulsa **Nuevo croquis**. Selecciona el soporte
   principal **XY** en el panel lateral.
3. Elige **Rectángulo** y marca sus dos esquinas en el área de dibujo.
4. Pulsa **Salir del croquis**. Selecciona el croquis en el árbol de la izquierda.
5. En **Operaciones**, pulsa **Saliente/Base extruido**, escribe una profundidad
   y confirma el campo. Comprueba la vista previa y pulsa la marca verde
   **Aceptar operación**.
6. Crea otro croquis cerrado, selecciónalo y prueba **Corte extruido**. El perfil
   debe atravesar material para que el corte produzca un cambio.
7. Repite el recorrido para añadir más salientes y cortes. Selecciona el croquis
   que quieres utilizar antes de iniciar cada operación.

Para cambiar una operación, selecciónala en el árbol y usa **Editar operación**.
La flecha de la operación muestra sus croquis consumidos. Puedes editar un
croquis anterior y comprobar la reconstrucción de las operaciones posteriores.
La cruz del editor cancela el cambio; la marca verde lo acepta cuando la vista
previa es válida. **Ctrl+Z** y **Ctrl+Y** recorren el historial del documento.

## Selección y navegación

| Acción | Control |
| --- | --- |
| Acercar o alejar | Rueda del ratón |
| Girar la vista | Mantener pulsada la rueda y arrastrar |
| Desplazar la vista | Mayús + rueda pulsada y arrastrar |
| Seleccionar | Clic izquierdo |
| Elegir caras, aristas o cuerpos | Filtro de la barra del visor |
| Mostrar acciones del elemento o del fondo | Clic derecho |
| Ajustar el modelo a la pantalla | **F** |

Los campos activos de una operación determinan qué referencias puedes escoger.
Termina o cancela la edición para volver a la selección normal del modelo.
Las vistas estándar, **Normal a** y **Vista anterior** tienen un historial de
cámara separado del historial de operaciones.

## Material y apariencia

Pulsa la fila **Material** del árbol para abrir **Propiedades físicas**. Activa
**Asignar material**, introduce un nombre y una densidad, y acepta el cambio.
El color personalizado de la pieza se configura en el mismo panel. La masa se
muestra cuando la geometría actual y la densidad permiten calcularla.

El fondo del visor se cambia desde **Ver → Fondo del visor…**. Se guarda como
preferencia de la aplicación; el material y el color pertenecen al documento.

## Ensamblaje y archivos

Con una pieza terminada puedes usar **Crear ensamblaje con esta pieza**. El
primer componente queda fijo en el origen. Inserta o reutiliza componentes y
añade relaciones desde el panel de ensamblaje. El
[recorrido de tres componentes](DEMO_ASSEMBLIES.md#from-a-modeled-part-to-a-constrained-three-component-assembly)
explica la prueba con planos y ejes de origen, relaciones entre componentes y
edición de una distancia.

Usa **Archivo → Guardar como…** para crear un archivo `.solidflow`. Después
ábrelo con **Archivo → Abrir** y comprueba las operaciones, cotas y componentes.
Los formatos de intercambio tienen sus propios límites, descritos en los
[flujos de modelado](CORE_WORKFLOWS.md) y el registro de validación.

Si encuentras un fallo, anota la fecha de la demo, los pasos, lo que esperabas y
lo que ocurrió. Un modelo pequeño de prueba permite reproducirlo; incluye
únicamente archivos que puedas compartir públicamente.
