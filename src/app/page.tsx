import { KuroSkeleton } from "@/components/kuro/kuro-skeleton";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-[840px] px-3 py-4 sm:px-6 sm:py-6">
      <header className="mb-3.5 sm:mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Kuro
          </h1>
          <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-950">
            Hosted audio
          </span>
        </div>
        <p className="mt-0.5 text-sm font-semibold text-blue-800">
          More voices. Clearer ideas.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Turn a difficult college topic, class reading, or pasted study material into a short,
          engaging visual-audio conversation.
        </p>
      </header>

      <KuroSkeleton />
    </main>
  );
}
