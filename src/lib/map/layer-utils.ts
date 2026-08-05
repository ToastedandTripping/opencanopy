export function getFirstSymbolId(
  layers: { id: string; type: string }[],
): string | undefined {
  return layers.find((l) => l.type === "symbol")?.id;
}
