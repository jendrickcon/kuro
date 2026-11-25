"use client";

export interface OptionItem<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

export interface OptionSelectorProps<T extends string | number> {
  legend: string;
  options: [OptionItem<T>, OptionItem<T>];
  selected: T;
  disabled?: boolean;
  onSelect: (value: T) => void;
}

/** Accessible binary option selector with non-color selected cues and 44px touch targets. */
export function OptionSelector<T extends string | number>({
  legend,
  options,
  selected,
  disabled = false,
  onSelect,
}: OptionSelectorProps<T>) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(opt.value)}
              className={`min-h-11 rounded-xl border-2 px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-300 bg-white text-slate-900 hover:border-slate-500"
              }`}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                <span aria-hidden="true" className="text-xs">
                  {isSelected ? "✓" : "○"}
                </span>
                <span className="truncate">{opt.label}</span>
              </span>
              {opt.hint ? (
                <span
                  className={`mt-0.5 block pl-4 text-[11px] ${
                    isSelected ? "text-slate-200" : "text-slate-600"
                  }`}
                >
                  {opt.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
