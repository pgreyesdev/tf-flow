import { ViewTransition } from "react";

/**
 * Envuelve el contenido de cada página para que, al navegar, la anterior se desvanezca y la nueva
 * entre subiendo (ver las clases `page-exit` y `page-enter` en globals.css). Va en cada página y no
 * en el layout porque el layout no se desmonta al cambiar de ruta.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
