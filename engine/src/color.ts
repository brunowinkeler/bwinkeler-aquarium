export type RGB = readonly [number, number, number];

export const BLACK: RGB = [0, 0, 0];
export const WHITE: RGB = [255, 255, 255];

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgb(color: RGB, alpha = 1): string {
  const channels = Math.round(color[0]) + ', ' + Math.round(color[1]) + ', ' + Math.round(color[2]);
  return alpha >= 1 ? 'rgb(' + channels + ')' : 'rgba(' + channels + ', ' + alpha.toFixed(3) + ')';
}
