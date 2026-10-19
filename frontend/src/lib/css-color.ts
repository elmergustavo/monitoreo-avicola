/**
 * Resolves a CSS custom property (which may use oklch) to an rgba() string.
 * ECharts manipulates colors internally and only understands sRGB notations.
 */
let context: CanvasRenderingContext2D | null = null;

export function cssVarToRgba(name: string, alpha = 1): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  context ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!context || !value) return `rgba(128,128,128,${alpha})`;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${((a / 255) * alpha).toFixed(3)})`;
}
