/** SHA-256 de `display:none`. */
export const HIDDEN_SEGMENT_STYLE = "sha256-aqNNdDLnnrDOnTNdkJpYlAxKVJtLt9CtFLklmInuUAE=";

/** Política de contenido de la web. Solo se ejecutan scripts con el nonce de la petición. */
export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // React usa eval en desarrollo para reconstruir las trazas de error; en producción no.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Al enviar la página por partes, React esconde los trozos SVG que aún no ha colocado con
    // style="display:none". Solo se permite ese atributo exacto, por su huella.
    `style-src-attr 'unsafe-hashes' '${HIDDEN_SEGMENT_STYLE}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // El mapa dibuja el relieve en un worker que MapLibre crea desde un blob.
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
