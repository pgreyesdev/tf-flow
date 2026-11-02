import type { Map as MapLibreMap } from "maplibre-gl";

/** Nombre de la señal de peligro dentro de los mapas. */
export const WARNING_ICON = "alerta";

/** Tamaño en píxeles de pantalla; se dibuja al doble para que se vea nítida en pantallas retina. */
const SIZE = 30;
const SCALE = 2;

/**
 * Dibuja la señal de peligro de tráfico (triángulo naranja con borde blanco y un «!») y la añade
 * al mapa. Devuelve `false` si el navegador no puede dibujarla: entonces el mapa usa un círculo.
 */
export function addWarningIcon(map: MapLibreMap): boolean {
  if (map.hasImage(WARNING_ICON)) {
    return true;
  }
  const size = SIZE * SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const pad = 3 * SCALE;
  const top = pad;
  const bottom = size - pad - 1 * SCALE;
  ctx.beginPath();
  ctx.moveTo(size / 2, top);
  ctx.lineTo(size - pad, bottom);
  ctx.lineTo(pad, bottom);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 * SCALE;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#f97316";
  ctx.shadowColor = "rgba(2, 6, 23, 0.55)";
  ctx.shadowBlur = 3 * SCALE;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fill();
  ctx.fillStyle = "#1c0a00";
  const cx = size / 2;
  ctx.fillRect(cx - 1.5 * SCALE, top + 8 * SCALE, 3 * SCALE, 9 * SCALE);
  ctx.beginPath();
  ctx.arc(cx, bottom - 4.5 * SCALE, 1.8 * SCALE, 0, Math.PI * 2);
  ctx.fill();
  map.addImage(WARNING_ICON, ctx.getImageData(0, 0, size, size), { pixelRatio: SCALE });
  return true;
}
