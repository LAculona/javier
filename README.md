# INKRUSH · vertical slice

Shooter arcade en tercera persona, 3 vs 3: dos equipos (Naranja y Azul) pintan el mapa **Puerto Croma** durante 3 minutos. Gana quien cubra más suelo.

Three.js + pmndrs/postprocessing + Vite. Todos los modelos, texturas, sonidos y música se generan por código.

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview   # versión de producción
```

Usa un navegador de escritorio con WebGL2 (Chrome, Edge o Firefox). Al pulsar **JUGAR** se captura el ratón.

## Controles

| Tecla | Acción |
| --- | --- |
| WASD / ratón | moverse / apuntar |
| clic izq. | disparar (Roller: mantener para rodar, clic para barrido) |
| clic dcho. | apuntar con precisión |
| Espacio | saltar |
| Shift | correr · **surf** sobre tu pintura |
| R | recargar |
| 1 / 2 / 3 o rueda | cambiar de arma |
| F | cuerpo a cuerpo |
| ESC | pausa |
| F3 | estadísticas de rendimiento |

## Estructura

```
src/
  main.js, Game.js, config.js     arranque, bucle y ajustes de juego
  core/     Input, Time, EventBus, AssetLoader
  render/   Renderer, PostFX, Lighting, ToonMaterial, Sky, Water, TextureFactory
  paint/    PaintSystem, SplatShader, PaintAtlas, TerritoryTracker
  player/   PlayerController, CameraController, CharacterRig, CharacterAnimator, Character
  combat/   WeaponSystem, weapons/*, Projectile, HealthSystem, RespawnSystem
  ai/       EnemyAI, NavGraph, BotPersonalities
  world/    MapBuilder, Collision, GeometryKit, Materials, StaticBatcher, MenuStage, props/*
  match/    GameManager, MatchManager, Stats
  ui/       UIManager, HUD, Menus, Icons, styles.css
  audio/    AudioManager, SynthSFX, MusicGenerator
  fx/       Particles, ScreenShake, HitStop
```

## Parámetros de depuración (URL)

`?autostart` salta el menú · `?autoplay` la IA juega por ti · `?follow=NOMBRE` cámara sobre un bot · `?bots=0` sin bots · `?fixedres` desactiva la resolución adaptativa.
