import { HUD } from './HUD.js';
import { Menus } from './Menus.js';

// ─────────────────────────────────────────────────────────────
//  UIManager · raíz de la interfaz DOM (HUD + menús)
// ─────────────────────────────────────────────────────────────

export class UIManager {
  constructor(game, gm) {
    this.root = document.getElementById('ui');
    this.hud = new HUD(this.root, game);
    this.menus = new Menus(this.root, game, gm);
  }

  update(rdt) {
    this.hud.update(rdt);
    this.menus.update(rdt);
  }
}
