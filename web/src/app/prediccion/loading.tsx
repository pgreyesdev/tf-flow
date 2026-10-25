import { Sky } from "@/components/sky";
const pulse = "animate-pulse bg-glass motion-reduce:animate-none";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 pt-2 sm:px-6" aria-busy="true">
      <Sky />
      <p className="sr-only" role="status">
        Cargando la previsión…
      </p>
      <div className={`mx-auto h-12 max-w-xl rounded-3xl ${pulse}`} />
      <div className="flex flex-col items-center gap-3 pt-6 pb-4 sm:pt-10 sm:pb-8">
        <div className={`h-4 w-24 rounded-full ${pulse}`} />
        <div className={`h-9 w-64 rounded-full ${pulse}`} />
        <div className={`h-24 w-44 rounded-3xl ${pulse}`} />
        <div className={`h-6 w-56 rounded-full ${pulse}`} />
      </div>
      <div className={`h-44 rounded-3xl ${pulse}`} />
      <div className={`h-80 rounded-3xl ${pulse}`} />
    </div>
  );
}
