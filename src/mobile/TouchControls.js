import * as THREE from '../../node_modules/three/build/three.module.js';
import { Door } from '../entities/Door.js';

const LOOK_SENSITIVITY = 0.0048;
const JOYSTICK_RADIUS = 55;

function ensureTouchRoot() {
  let root = document.getElementById('touch-ui');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'touch-ui';
  root.innerHTML = `
    <div id="touch-move-area" aria-label="Zona de movimiento"></div>
    <div id="touch-joystick" aria-label="Joystick de movimiento">
      <div id="touch-joystick-knob"></div>
    </div>
    <div id="touch-look-area" aria-hidden="true"></div>
    <div id="touch-menu">
      <button id="touch-btn-menu" class="touch-btn touch-btn-menu" aria-label="Abrir menú" title="Menú">☰</button>
    </div>
    <div id="touch-buttons">
      <button id="touch-btn-fire" class="touch-btn touch-btn-fire" aria-label="Disparar">🔥</button>
      <button id="touch-btn-jump" class="touch-btn" aria-label="Saltar">▲</button>
      <button id="touch-btn-reload" class="touch-btn touch-btn-small" aria-label="Recargar">⟳</button>
      <button id="touch-btn-weapon" class="touch-btn touch-btn-small" aria-label="Cambiar arma">🔫</button>
      <button id="touch-btn-use" class="touch-btn touch-btn-small" aria-label="Usar">E</button>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function setKnob(knob, dx, dy) {
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

export function attachTouchControls(player) {
  const root = ensureTouchRoot();
  const camera = player.camera;
  const moveArea = root.querySelector('#touch-move-area');
  const joystick = root.querySelector('#touch-joystick');
  const knob = root.querySelector('#touch-joystick-knob');
  const lookArea = root.querySelector('#touch-look-area');
  const btnMenu = root.querySelector('#touch-btn-menu');
  const btnFire = root.querySelector('#touch-btn-fire');
  const btnJump = root.querySelector('#touch-btn-jump');
  const btnReload = root.querySelector('#touch-btn-reload');
  const btnWeapon = root.querySelector('#touch-btn-weapon');
  const btnUse = root.querySelector('#touch-btn-use');

  player.touchState = player.touchState || { moveX: 0, moveY: 0, active: false };

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const applyLook = (dx, dy) => {
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= dx * LOOK_SENSITIVITY;
    euler.x -= dy * LOOK_SENSITIVITY;
    const limit = Math.PI / 2 - 0.05;
    euler.x = Math.max(-limit, Math.min(limit, euler.x));
    euler.z = 0;
    camera.quaternion.setFromEuler(euler);
    camera.updateMatrixWorld(true);
  };

  // --- Joystick flotante (toda la mitad izquierda) ---
  // El origen aparece donde apoya el dedo: así funciona aunque no se
  // acierte en el círculo, que antes era la única zona que respondía.
  let joyTouchId = null;
  let joyCenter = { x: 0, y: 0 };

  const placeJoystickBase = (x, y) => {
    joystick.style.left = `${x}px`;
    joystick.style.top = `${y}px`;
    joystick.style.bottom = 'auto';
    joystick.style.transform = 'translate(-50%, -50%)';
  };

  const onJoyStart = (e) => {
    if (joyTouchId !== null) return;
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    joyCenter = { x: t.clientX, y: t.clientY };
    placeJoystickBase(t.clientX, t.clientY);
    setKnob(knob, 0, 0);
    player.audioManager?.resume?.();
    e.preventDefault();
  };
  const onJoyMove = (e) => {
    if (joyTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== joyTouchId) continue;
      let dx = t.clientX - joyCenter.x;
      let dy = t.clientY - joyCenter.y;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }
      setKnob(knob, dx, dy);
      player.touchState.moveX = dx / JOYSTICK_RADIUS;
      player.touchState.moveY = dy / JOYSTICK_RADIUS;
      player.touchState.active = true;
    }
    e.preventDefault();
  };
  const onJoyEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyTouchId) continue;
      joyTouchId = null;
      setKnob(knob, 0, 0);
      player.touchState.moveX = 0;
      player.touchState.moveY = 0;
      player.touchState.active = false;
    }
  };

  // --- Mirar (mitad derecha, arrastrar; no dispara) ---
  let lookTouchId = null;
  let lastLook = { x: 0, y: 0 };
  const onLookStart = (e) => {
    if (lookTouchId !== null) return;
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLook = { x: t.clientX, y: t.clientY };
    player.audioManager?.resume?.();
  };
  const onLookMove = (e) => {
    if (lookTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      applyLook(t.clientX - lastLook.x, t.clientY - lastLook.y);
      lastLook = { x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  };
  const onLookEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) lookTouchId = null;
    }
  };

  // --- Botones ---
  const pressFire = (e) => {
    e.preventDefault();
    player.audioManager?.resume?.();
    if (player.isDead) {
      player.respawn();
      return;
    }
    // Primer toque: disparo inmediato (armas semi), mantener: auto en update()
    if (!player.isShooting) player.onMouseDown({ button: 0 });
    player.isShooting = true;
  };
  const releaseFire = (e) => {
    if (e) e.preventDefault();
    player.onMouseUp();
  };
  const pressJump = (e) => {
    e.preventDefault();
    player.audioManager?.resume?.();
    player.jumpPressed();
  };
  const pressReload = (e) => {
    e.preventDefault();
    if (player.controls.isLocked && !player.isGameOver) {
      player.weaponSystem.reloadCurrentWeapon();
    }
  };
  const pressWeapon = (e) => {
    e.preventDefault();
    if (player.controls.isLocked && !player.isGameOver) {
      player.weaponSystem.switchWeapon(1);
    }
  };
  const pressUse = (e) => {
    e.preventDefault();
    if (player.controls.isLocked && !player.isGameOver) {
      player.tryInteract();
    }
  };
  const pressMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!player.controls.isLocked || player.isGameOver) return;

    player.audioManager?.resume?.();
    player.onMouseUp();
    player.controls.unlock();
  };

  moveArea.addEventListener('touchstart', onJoyStart, { passive: false });
  window.addEventListener('touchmove', onJoyMove, { passive: false });
  window.addEventListener('touchend', onJoyEnd);
  window.addEventListener('touchcancel', onJoyEnd);
  lookArea.addEventListener('touchstart', onLookStart, { passive: true });
  window.addEventListener('touchmove', onLookMove, { passive: false });
  window.addEventListener('touchend', onLookEnd);
  window.addEventListener('touchcancel', onLookEnd);

  btnFire.addEventListener('touchstart', pressFire, { passive: false });
  btnFire.addEventListener('touchend', releaseFire);
  btnFire.addEventListener('touchcancel', releaseFire);
  btnJump.addEventListener('touchstart', pressJump, { passive: false });
  btnReload.addEventListener('touchstart', pressReload, { passive: false });
  btnWeapon.addEventListener('touchstart', pressWeapon, { passive: false });
  btnUse.addEventListener('touchstart', pressUse, { passive: false });
  btnMenu.addEventListener('touchstart', pressMenu, { passive: false });

  // Mostrar UI táctil solo cuando el juego está en marcha (lock).
  const syncVisibility = () => {
    root.classList.toggle('visible', Boolean(player.controls.isLocked));
  };
  player.controls.addEventListener('lock', syncVisibility);
  player.controls.addEventListener('unlock', syncVisibility);
  syncVisibility();

  // Textos adaptados a móvil.
  const subtitle = document.querySelector('#start-screen .pause-subtitle');
  if (subtitle) subtitle.textContent = 'Toca para jugar';
  const respawnHint = document.getElementById('respawn-hint');
  if (respawnHint) respawnHint.textContent = 'Toca 🔥 para reaparecer';
  document.querySelectorAll('#start-screen .controls-info').forEach((el) => {
    el.textContent = 'Izquierda: moverse · Derecha: arrastrar = mirar · 🔥: disparar';
  });

  return () => {
    moveArea.removeEventListener('touchstart', onJoyStart);
    window.removeEventListener('touchmove', onJoyMove);
    window.removeEventListener('touchend', onJoyEnd);
    window.removeEventListener('touchcancel', onJoyEnd);
    lookArea.removeEventListener('touchstart', onLookStart);
    window.removeEventListener('touchmove', onLookMove);
    window.removeEventListener('touchend', onLookEnd);
    window.removeEventListener('touchcancel', onLookEnd);
    btnFire.removeEventListener('touchstart', pressFire);
    btnFire.removeEventListener('touchend', releaseFire);
    btnFire.removeEventListener('touchcancel', releaseFire);
    btnJump.removeEventListener('touchstart', pressJump);
    btnReload.removeEventListener('touchstart', pressReload);
    btnWeapon.removeEventListener('touchstart', pressWeapon);
    btnUse.removeEventListener('touchstart', pressUse);
    btnMenu.removeEventListener('touchstart', pressMenu);
    player.controls.removeEventListener('lock', syncVisibility);
    player.controls.removeEventListener('unlock', syncVisibility);
    root.classList.remove('visible');
  };
}

export { Door };
