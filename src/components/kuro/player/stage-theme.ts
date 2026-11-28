/**
 * Lightweight studio theme boundary for Kuro stages.
 * Future themes plug into this registry and matching `[data-stage-theme="..."]`
 * CSS tokens without changing stage markup or API schemas.
 */
export type StageTheme = "contemporary";

export const DEFAULT_STAGE_THEME: StageTheme = "contemporary";

export interface StageThemeMeta {
  id: StageTheme;
  stageLabel: string;
  monitorLabel: string;
}

export const STAGE_THEME_META: Record<StageTheme, StageThemeMeta> = {
  contemporary: {
    id: "contemporary",
    stageLabel: "Kuro Studio",
    monitorLabel: "Visual cue",
  },
};
