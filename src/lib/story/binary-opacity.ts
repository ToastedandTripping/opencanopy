/**
 * Pure helper: compute the per-frame opacity for story-binary-reveal.
 *
 * Extracted for testability. This function is the SOLE authority on binary
 * reveal opacity and is consumed by useScrollytelling's per-frame update.
 * applyLayerVisibility does NOT set story-binary-reveal; that path has been
 * removed. The per-frame effect in StoryMap is the only writer.
 *
 * @param revealBinary   - Whether the current chapter activates the binary reveal.
 * @param fadeIn         - Optional [startProg, endProg] window for the fade.
 *                         When omitted, binary is at full 0.85 immediately.
 * @param prog           - Current scroll progress [0, 1] within the chapter.
 * @param reducedMotion  - User prefers-reduced-motion: skip the ramp → 0.85 immediately.
 */
export function computeBinaryRevealOpacity(
  revealBinary: boolean | undefined,
  fadeIn: [number, number] | undefined,
  prog: number,
  reducedMotion: boolean,
): number {
  if (!revealBinary) return 0;
  if (reducedMotion || !fadeIn) return 0.85;
  const [start, end] = fadeIn;
  // Degenerate window (start === end): step at the boundary rather than divide
  // by zero (which would yield NaN and propagate to setPaintProperty).
  if (end <= start) return prog >= start ? 0.85 : 0;
  const t = (prog - start) / (end - start);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return 0.85 * clamped;
}
