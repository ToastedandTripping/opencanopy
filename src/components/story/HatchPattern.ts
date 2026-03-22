/**
 * Canvas hatch pattern generator for MapLibre.
 *
 * Creates a 16x16 seamlessly-tiling diagonal line pattern
 * suitable for use with map.addImage("hatch-pattern", ...).
 */

export function createHatchPattern(): ImageData {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(200, 200, 200, 0.2)";
  ctx.lineWidth = 2;

  // Draw diagonal lines at 45 degrees.
  // To tile seamlessly, draw the main diagonal plus offset copies
  // that wrap around the edges.
  for (let offset = -size; offset <= size * 2; offset += size) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}
