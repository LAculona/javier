# INKRUSH

Shooter 3D en tercera persona de pintura por territorios (4 vs 4 contra bots), hecho con Three.js + WebGL. Todo es original: personajes, mapa, armas, interfaz y sonidos (sintetizados en tiempo real con WebAudio).

## Cómo ejecutar

- **Directo:** abre `index.html` en Chrome, Edge o Firefox. El juego ya compilado está en `dist/inkrush.js` y no necesita servidor ni backend.
- **Desarrollo:** `npm install` y luego `npm run build` (o `npm run watch`). Opcional: `npm run serve` y abre http://localhost:8080

## Controles

| Tecla | Acción |
|---|---|
| WASD | Moverse |
| Ratón | Cámara |
| Clic izq. | Disparar (Roller: mantener para rodar) |
| Clic der. | Apuntar |
| Espacio | Saltar |
| Shift | Correr |
| R | Recargar |
| F | Cuerpo a cuerpo |
| 1 / 2 / 3 | Blaster / Roller / Splasher |
| ESC | Pausa |

## Estructura

```
index.html, css/style.css      Interfaz (menús, HUD)
src/main.js                    Punto de entrada
src/core/      GameManager, MatchManager, Input, config
src/world/     MapBuilder (mapa), CollisionWorld, Colliders, Environment
src/paint/     PaintSystem (atlas de pintura en GPU + rejilla de territorio)
src/player/    PlayerController, CameraController, Character, CharacterMotor, CharacterModel
src/combat/    WeaponSystem, weapons, ProjectileSystem, HealthSystem
src/ai/        EnemyAI (bots), NavGraph (waypoints + A*)
src/systems/   RespawnSystem
src/fx/        EffectsSystem (partículas, anillos, haces)
src/ui/        UIManager (HUD, minimapa, marcadores)
src/audio/     AudioManager (efectos y música procedurales)
```

## Qué incluye

- Menú principal (Jugar, Controles, Opciones: volumen, música, sensibilidad, calidad gráfica, dificultad, invertir Y, FPS) y un menú de pausa.
- Cuenta atrás, partida de 3 minutos, porcentaje de territorio en directo, pantalla final con ganador, estadísticas y botón para volver a jugar.
- Pintura en suelo, paredes, rampas y obstáculos (un atlas en GPU con una llamada de dibujo por frame). Tu pintura te acelera, recarga tu tanque y te deja trepar paredes. La pintura enemiga te frena.
- 3 armas: Blaster, Roller (lanzamiento y rodillo) y Splasher. Cada una con retroceso, partículas y sonido. También hay ataque cuerpo a cuerpo.
- Tanque de pintura con recarga, vida con regeneración, indicadores de daño, muerte, cámara hacia quien te eliminó, reaparición con protección.
- 7 bots (3 aliados y 4 enemigos) que navegan, pintan, combaten, recargan y se desatascan solos.
- Arena urbana simétrica con plaza central, rampas, plataformas, contenedores y un callejón estrecho.
- Animaciones procedurales, sombras, bloom (calidad alta), minimapa de territorio y nombres sobre los personajes.
