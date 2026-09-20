export function moveListIndex(index: number, direction: "up" | "down", length: number): number {
  if (length <= 0) {
    return 0;
  }

  const currentIndex = Math.max(0, Math.min(index, length - 1));

  return direction === "up"
    ? Math.max(currentIndex - 1, 0)
    : Math.min(currentIndex + 1, length - 1);
}
