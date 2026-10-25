export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pt-10 sm:px-6 sm:pt-14" aria-busy="true">
      <p className="sr-only" role="status">
        Cargando la previsión…
      </p>
      <div className="h-10 w-72 animate-pulse rounded-lg bg-surface-muted motion-reduce:animate-none" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-muted motion-reduce:animate-none" />
      <div className="h-80 animate-pulse rounded-2xl bg-surface-muted motion-reduce:animate-none" />
    </div>
  );
}
