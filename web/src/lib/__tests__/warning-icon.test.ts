import type { Map as MapLibreMap } from "maplibre-gl";

import { addWarningIcon, WARNING_ICON } from "@/lib/warning-icon";

function fakeMap(has = false) {
  const images = new Map<string, unknown>();
  const map = {
    hasImage: (name: string) => has || images.has(name),
    addImage: vi.fn((name: string, image: unknown) => images.set(name, image)),
  };
  return { map, images, asMap: map as unknown as MapLibreMap };
}

describe("addWarningIcon", () => {
  it("draws the warning sign once, at double resolution", () => {
    const image = { width: 60, height: 60 };
    const ctx = new Proxy(
      { getImageData: () => image },
      { get: (target, key) => (key in target ? target[key as "getImageData"] : vi.fn()) },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const { map, asMap } = fakeMap();

    expect(addWarningIcon(asMap)).toBe(true);
    expect(map.addImage).toHaveBeenCalledWith(WARNING_ICON, image, { pixelRatio: 2 });
    expect(addWarningIcon(asMap)).toBe(true);
    expect(map.addImage).toHaveBeenCalledOnce();
  });

  it("says so when the browser cannot draw", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { map, asMap } = fakeMap();
    expect(addWarningIcon(asMap)).toBe(false);
    expect(map.addImage).not.toHaveBeenCalled();
  });
});
