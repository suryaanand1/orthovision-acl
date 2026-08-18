export type Point3D = { x: number; y: number; z?: number; visibility?: number; presence?: number };

export function kneeFlexion3D(hip: Point3D, knee: Point3D, ankle: Point3D) {
  const thigh = { x: hip.x - knee.x, y: hip.y - knee.y, z: (hip.z ?? 0) - (knee.z ?? 0) };
  const shin = { x: ankle.x - knee.x, y: ankle.y - knee.y, z: (ankle.z ?? 0) - (knee.z ?? 0) };
  const thighLength = Math.hypot(thigh.x, thigh.y, thigh.z);
  const shinLength = Math.hypot(shin.x, shin.y, shin.z);
  if (thighLength < 0.001 || shinLength < 0.001) return null;
  const cosine = (thigh.x * shin.x + thigh.y * shin.y + thigh.z * shin.z) / (thighLength * shinLength);
  const geometricAngle = Math.acos(Math.max(-1, Math.min(1, cosine))) * (180 / Math.PI);
  return 180 - geometricAngle;
}

export function percentile(values: number[], quantile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}
