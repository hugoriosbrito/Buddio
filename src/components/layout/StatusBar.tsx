import { Headphones, House, Microphone, User } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useProfilesStore } from "../../stores/profilesStore";
import { useSettingsStore } from "../../stores/settingsStore";

export function StatusBar() {
  const settings = useSettingsStore((s) => s.settings);
  const profiles = useProfilesStore((s) => s.profiles);
  const active =
    profiles.find((p) => p.id === settings.activeProfileId) ??
    profiles.find((p) => p.isDefault);

  const secondary = settings.secondaryDevice ?? "Não configurada";
  const monitor = settings.monitorEnabled
    ? (settings.monitorDevice ?? "Padrão do sistema")
    : "Desligado";

  return (
    <footer className="flex h-[var(--status-h)] shrink-0 items-center gap-5 border-t border-[var(--buddio-border-subtle)] bg-[var(--buddio-window)] px-[var(--space-pad)] text-[12px]">
      <StatusItem
        icon={<User size={14} weight="bold" />}
        label="Perfil"
        value={active?.name ?? "Padrão"}
      />
      <StatusItem
        icon={<Microphone size={14} weight="bold" />}
        label="Saída"
        value={secondary}
      />
      <StatusItem
        icon={<House size={14} weight="bold" />}
        label="Monitor"
        value={monitor}
      />
      <StatusItem
        icon={<Headphones size={14} weight="bold" />}
        label="Mic mix"
        value={settings.micMixEnabled ? "Ligado" : "Desligado"}
        dot={settings.micMixEnabled}
      />
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
