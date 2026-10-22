declare module "libheif-js/wasm-bundle" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void
    ): void;
  }
  class HeifDecoder {
    decode(buffer: ArrayBuffer | Uint8Array): HeifImage[];
  }
  const libheif: { HeifDecoder: typeof HeifDecoder };
  export default libheif;
}
