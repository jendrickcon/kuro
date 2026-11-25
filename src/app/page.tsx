import { KuroSkeleton } from "@/components/kuro/kuro-skeleton";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-3 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Kuro</h1>
        <p className="text-sm font-medium text-blue-800">More voices. Clearer ideas.</p>
        <p className="mt-2 text-sm text-slate-700">
          Turn a difficult college topic, class reading, or pasted study material into a short
          multi-host conversation.
        </p>
      </header>

      <KuroSkeleton />
    </main>
  );
}
