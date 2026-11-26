// off = no 3D (posters only), lite = fewer effects for weaker phones, full = everything.
export type GLMode = 'off' | 'lite' | 'full';
let cached: GLMode | null = null;

export function glMode(): GLMode {
  if (cached) return cached;
  const root = document.documentElement;
  if (root.classList.contains('still-mode') || root.classList.contains('lite')) return (cached = 'off'); // ?still, data saver, 2G, 1 GB phones
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return (cached = 'off');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { return (cached = 'off'); }
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  return (cached = mem <= 4 || cores <= 4 ? 'lite' : 'full');
}
