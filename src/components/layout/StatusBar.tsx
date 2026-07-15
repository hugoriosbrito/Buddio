import { Headphones, House, Microphone, User } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { localizeSeedName, useT } from "../../i18n";
import { useProfilesStore } from "../../stores/profilesStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useHelpStore } from "../../stores/helpStore";

export function StatusBar() {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const profiles = useProfilesStore((s) => s.profiles);
  const openHelp = useHelpStore((s) => s.open);
  const active =
    profiles.find((p) => p.id === settings.activeProfileId) ??
    profiles.find((p) => p.isDefault);

  const secondary = settings.secondaryDevice ?? t("common.notConfigured");
  const monitor = settings.monitorEnabled
    ? (settings.monitorDevice ?? t("common.systemDefault"))
    : t("common.off");

  const micLabel =
    settings.micRouteMode === "soundOnly"
      ? t("settings.micMode.soundOnly")
      : settings.micRouteMode === "ducking"
        ? t("settings.micMode.ducking")
        : t("profiles.micMode.mix");
  const healthLabel = settings.secondaryDevice
    ? (settings.monitorEnabled ? t("help.ready") : t("help.attention"))
    : t("help.blocked");

  return (
    <footer className="flex h-[var(--status-h)] shrink-0 items-center gap-5 border-t border-[var(--buddio-border-subtle)] bg-[var(--buddio-window)] px-[var(--space-pad)] text-[12px]">
      <StatusItem
        icon={<User size={14} weight="bold" />}
        label={t("status.profile")}
        value={
          active ? localizeSeedName(active.name, t) : t("common.default")
        }
      />
      <StatusItem
        icon={<Microphone size={14} weight="bold" />}
        label={t("status.output")}
        value={secondary}
      />
      <StatusItem
        icon={<House size={14} weight="bold" />}
        label={t("status.monitor")}
        value={monitor}
      />
      <StatusItem
        icon={<Headphones size={14} weight="bold" />}
        label={t("status.mic")}
        value={micLabel}
        dot={settings.micRouteMode !== "soundOnly"}
      />
      <button
        type="button"
        onClick={() => openHelp(settings.secondaryDevice ? undefined : "virtual-mic-missing")}
        className="ml-auto rounded px-1.5 py-1 font-semibold text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--buddio-brand)]"
      >
        {healthLabel}
      </button>
    </footer>
  );
}

function StatusItem({
  icon,
  label,
  value,
  dot,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  dot?: boolean;
}) {
  return (
    <div className="flex min-w-0 max-w-[260px] items-center gap-1.5 text-[var(--buddio-text-secondary)]">
      {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      <span className="truncate">
        {label}:{" "}
        <span className="font-semibold text-[var(--buddio-text)]">{value}</span>
      </span>
      {dot ? (
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--buddio-success)]" />
      ) : null}
    </div>
  );
}
