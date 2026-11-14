# Punto de venta para tienda

Aplicación de escritorio para Windows que cubre el ciclo de una tienda: venta con lector de código de barras, caja, inventario, compras, clientes y reportes. Funciona sin internet y guarda todo en una base SQLite local con respaldos diarios.

> **Estado:** prototipo funcional, pendiente de piloto en una tienda real. No emite boleta electrónica del SII (entrega un comprobante interno) y la impresora térmica y el cajón de dinero no se han probado con equipos reales.

## Qué hace
- **Venta:** escaneo con pistola (funciona como teclado), carrito, acceso rápido, ventas en espera, descuentos, promociones por pack, pago mixto (efectivo, tarjeta, transferencia y fiado) y vuelto.
- **Caja:** apertura, ingresos y retiros, cierre con arqueo y control de diferencias por cajero.
- **Inventario y compras:** stock y costos, alertas de stock bajo y vencimientos, conteo físico, mermas, proveedores, cuentas por pagar, reposición sugerida y cambio masivo de precios.
- **Clientes:** ficha, fiado con abonos, puntos y ticket por WhatsApp.
- **Reportes:** panel de inicio, ventas por día y hora, utilidad real con gastos, exportación a Excel (.xlsx), registro de auditoría.
- **Ticket e impresión:** vista previa, impresión por el diálogo de Windows o directa a una impresora térmica ESC/POS, apertura de cajón y etiquetas con código de barras Code 128.

## Decisiones técnicas
- **Local-first:** la caja nunca depende de internet.
- **SQLite** (módulo `node:sqlite` incluido en Electron, sin compilar nada): solo se escriben las filas que cambian, dentro de una transacción.
- **Seguridad:** PIN cifrados con scrypt y sal, bloqueo tras 5 intentos fallidos, sesión validada en el proceso principal y permisos por rol aplicados en la capa de datos, no solo en la pantalla.
- **Lógica de dinero aislada** en `renderer/logic.js` y cubierta por pruebas.
- **24 pruebas automáticas** (lógica, base de datos, PIN, permisos y un recorrido completo de la pantalla contra la base real).

## Estructura
| Archivo | Qué contiene |
|---|---|
| `main.js` | Ventana, impresora, Excel y comunicación con la pantalla. Exige sesión iniciada. |
| `preload.js` | Puente seguro entre la pantalla y el proceso principal. |
| `db.js` | Base SQLite, permisos del cajero y migración desde versiones anteriores. |
| `auth.js` | Usuarios, PIN cifrados y bloqueo por intentos. |
| `renderer/logic.js` | Cálculos de dinero: promociones, descuentos, pago mixto, caja, puntos y reposición. |
| `renderer/app.js`, `styles.css`, `index.html` | Pantalla. |
| `test/` | Pruebas automáticas. |

## Cómo usarlo
Requiere [Node.js](https://nodejs.org) (versión LTS).

```
npm install
npm start          # abre la aplicación
npm test           # corre las pruebas
npm run dist       # genera el instalador de Windows en dist/
```

Primer inicio: usuario **Dueño**, PIN **1234**. Cámbialo en la pestaña Tienda. Los datos quedan en `%APPDATA%\pos-tienda\datos.db`, con copias diarias en la carpeta `respaldos`.

La impresora térmica se comparte en Windows con un nombre sin espacios (por ejemplo `TICKET`) y se escribe en Tienda.

## Cómo se construyó
Desarrollado con apoyo de IA (Claude) bajo mi dirección: requisitos, decisiones de diseño, revisión y pruebas.

## Pendiente
Piloto en una tienda real, boleta electrónica con un proveedor autorizado por el SII, respaldo en la nube y división de `app.js` en módulos.
