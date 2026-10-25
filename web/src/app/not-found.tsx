import Link from "next/link";

import { buttonStyles } from "@/lib/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="font-semibold text-accent">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Esta página no existe</h1>
      <p className="mt-3 text-lg text-muted">
        Puede que el enlace esté mal o que la hayamos movido.
      </p>
      <Link href="/" className={`${buttonStyles.primary} mt-8`}>
        Volver al inicio
      </Link>
    </div>
  );
}
