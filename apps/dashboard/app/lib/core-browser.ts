import type { OrchestrationPlane } from "@immaculate/core";

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function planeColor(plane: OrchestrationPlane): string {
  switch (plane) {
    case "reflex":
      return "#5ef2c7";
    case "cognitive":
      return "#ffd166";
    case "offline":
      return "#7cb7ff";
  }
}
