import { bus } from './EventBus.js';

// Entrada de teclado y ratón con detección de flancos y pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.releasedKeys = new Set();
    this.buttons = new Set();
    this.pressedButtons = new Set();
    this.releasedButtons = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this._lockPending = false;

    this._onKeyDown = (e) => {
      if (this._shouldPrevent(e)) e.preventDefault();
      if (e.repeat) return;
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      bus.emit('input:key', e.code);
    };
    this._onKeyUp = (e) => {
      if (this._shouldPrevent(e)) e.preventDefault();
      this.keys.delete(e.code);
      this.releasedKeys.add(e.code);
    };
    this._onMouseDown = (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.pressedButtons.add(e.button);
    };
    this._onMouseUp = (e) => {
      if (this.buttons.has(e.button)) this.releasedButtons.add(e.button);
      this.buttons.delete(e.button);
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      // Algunos navegadores devuelven picos absurdos al bloquear el puntero
      const dx = Math.max(-250, Math.min(250, e.movementX || 0));
      const dy = Math.max(-250, Math.min(250, e.movementY || 0));
      this.mouseDX += dx;
      this.mouseDY += dy;
    };
    this._onWheel = (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
    };
    this._onContext = (e) => e.preventDefault();
    this._onBlur = () => this.releaseAll();
    this._onLockChange = () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      this._lockPending = false;
      if (!this.locked) this.releaseAll();
      if (was !== this.locked) bus.emit('input:lock', this.locked);
    };
    this._onLockError = () => {
      this._lockPending = false;
      bus.emit('input:lockerror');
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('contextmenu', this._onContext);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
  }

  _shouldPrevent(e) {
    const c = e.code;
    return (
      c === 'Space' ||
      c === 'Tab' ||
      c === 'F3' ||
      c === 'ArrowUp' ||
      c === 'ArrowDown' ||
      (this.locked && (c.startsWith('Key') || c.startsWith('Digit') || c.startsWith('Shift')))
    );
  }

  requestLock() {
    if (this.locked || this._lockPending) return;
    if (!this.canvas.requestPointerLock) return;
    this._lockPending = true;
    try {
      const res = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (res && typeof res.catch === 'function') {
        res.catch(() => {
          this._lockPending = false;
          bus.emit('input:lockerror');
        });
      }
    } catch {
      this._lockPending = false;
      bus.emit('input:lockerror');
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  releaseAll() {
    for (const k of this.keys) this.releasedKeys.add(k);
    for (const b of this.buttons) this.releasedButtons.add(b);
    this.keys.clear();
    this.buttons.clear();
  }

  isDown(code) {
    return this.enabled && this.keys.has(code);
  }

  wasPressed(code) {
    return this.enabled && this.pressedKeys.has(code);
  }

  wasReleased(code) {
    return this.releasedKeys.has(code);
  }

  mouseDown(b) {
    return this.enabled && this.buttons.has(b);
  }

  mousePressed(b) {
    return this.enabled && this.pressedButtons.has(b);
  }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('contextmenu', this._onContext);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
  }
}
