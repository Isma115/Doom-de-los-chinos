export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints || 0) > 0 ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches)
  );
}

export function isCapacitorNative() {
  if (typeof window === 'undefined') return false;
  const protocol = window.location?.protocol || '';
  return (
    protocol === 'capacitor:' ||
    protocol === 'file:' ||
    Boolean(window.Capacitor?.isNativePlatform?.())
  );
}

export function isMobileMode() {
  if (typeof window === 'undefined') return false;
  // Dentro del APK siempre es modo móvil.
  if (isCapacitorNative()) return true;
  // En navegador: exigir puntero "coarse" ADEMÁS de táctil para no
  // activar el modo móvil en portátiles con pantalla táctil (siguen
  // usando teclado + ratón con Pointer Lock).
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const touch = isTouchDevice();
  return Boolean(coarse && touch);
}
