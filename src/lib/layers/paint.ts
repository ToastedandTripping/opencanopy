/**
 * pickDefinedPaint — centralize architecture invariant #4.
 *
 * MapLibre will throw or render incorrectly if paint properties are explicitly
 * set to `undefined`. This helper strips all undefined-valued keys from a paint
 * object before it is passed to addLayer / setPaintProperty.
 *
 * Usage:
 *   const paint = pickDefinedPaint(layer.style.paint);
 *   mapInstance.addLayer({ ..., paint });
 *
 * The generic overload lets callers carry through their MapLibre paint type
 * without losing the type information:
 *   pickDefinedPaint<FillLayerSpecification["paint"]>(rawPaint)
 */
export function pickDefinedPaint<T extends Record<string, unknown>>(
  paint: T
): Partial<T> {
  const result = {} as Partial<T>;
  for (const key in paint) {
    if (Object.prototype.hasOwnProperty.call(paint, key)) {
      const value = paint[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }
  return result;
}
