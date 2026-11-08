// Minimal typing of js-aruco2 (a script-style CommonJS package), used only by the tests.
declare module 'js-aruco2' {
  interface ArucoPoint {
    x: number;
    y: number;
  }

  interface ArucoMarker {
    id: number;
    corners: ArucoPoint[];
    hammingDistance: number;
  }

  const aruco: {
    AR: {
      Dictionary: new (name: string) => { codeList: string[] };
      Detector: new (config?: { dictionaryName?: string; maxHammingDistance?: number }) => {
        detect(image: { width: number; height: number; data: Uint8ClampedArray }): ArucoMarker[];
      };
    };
  };
  export = aruco;
}
