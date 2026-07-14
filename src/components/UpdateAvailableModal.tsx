import { ArrowSquareOut, ArrowsClockwise } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useT } from "../i18n";
import { useUpdateStore } from "../stores/updateStore";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

export function UpdateAvailableModal() {
  const t = useT();
  const available = useUpdateStore((s) => s.available);
  const open = useUpdateStore((s) => s.modalOpen);
  const dismissModal = useUpdateStore((s) => s.dismissModal);
  const setModalOpen = useUpdateStore((s) => s.setModalOpen);

  if (!available) return null;

  const openRelease = async () => {
    try {
      await openUrl(available.url);
    } catch {
      window.open(available.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setModalOpen(false)}
      title={t("update.modalTitle")}
      description={t("update.modalSubtitle")}
      className="max-w-[440px]"
      footer={
        <>
          <Button variant="ghost" onClick={dismissModal}>
            {t("update.later")}
          </Button>
          <Button
            variant="primary"
            icon={<ArrowSquareOut size={16} weight="bold" />}
            onClick={() => void openRelease()}
          >
            {t("update.openRelease")}
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-window)]">
        <div className="relative flex items-center gap-4 px-4 py-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            style={{
              background:
                "radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--buddio-brand) 28%, transparent), transparent 55%)",
            }}
          />
          <div className="relative flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand)]">
            <ArrowsClockwise size={26} weight="duotone" />
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[var(--buddio-danger)] ring-2 ring-[var(--buddio-window)] animate-update-badge"
            />
          </div>
          <div className="relative min-w-0">
            <p className="text-[15px] font-bold text-[var(--buddio-text)]">
              {t("update.modalHeadline", { version: available.latest })}
            </p>
            <p className="mt-1 text-[13px] text-[var(--buddio-text-secondary)]">
              {t("update.modalBody")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-[var(--buddio-border-subtle)] px-4 py-3">
          <VersionChip
            label={t("update.current")}
            value={available.current}
            muted
          />
          <span
            aria-hidden
            className="text-[12px] font-semibold text-[var(--buddio-text-muted)]"
          >
            →
          </span>
          <VersionChip
            label={t("update.latest")}
            value={available.latest}
            emphasize
          />
        </div>
      </div>
    </Modal>
  );
}

function VersionChip({
  label,
  value,
  muted,
  emphasize,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div
      className={
        emphasize
          ? "rounded-[12px] border border-[var(--buddio-brand-border)] bg-[var(--buddio-brand-soft)] px-3 py-2"
          : "rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3 py-2"
      }
    >
      <p
        className={
          muted
            ? "text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--buddio-text-muted)]"
            : "text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--buddio-brand-deep)]"
        }
      >
        {label}
      </p>
      <p
        className={
          emphasize
            ? "mt-0.5 text-[14px] font-bold tabular-nums text-[var(--buddio-brand-deep)]"
            : "mt-0.5 text-[14px] font-semibold tabular-nums text-[var(--buddio-text)]"
        }
      >
        {value}
      </p>
    </div>
  );
}
