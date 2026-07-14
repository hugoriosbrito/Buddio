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
  const phase = useUpdateStore((s) => s.phase);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);
  const dismissModal = useUpdateStore((s) => s.dismissModal);
  const setModalOpen = useUpdateStore((s) => s.setModalOpen);
  const startInstall = useUpdateStore((s) => s.startInstall);
  const resetInstall = useUpdateStore((s) => s.resetInstall);

  if (!available) return null;

  const busy = phase === "downloading" || phase === "installing";
  const canInstall = Boolean(available.downloadUrl);

  const openRelease = async () => {
    try {
      await openUrl(available.url);
    } catch {
      window.open(available.url, "_blank", "noopener,noreferrer");
    }
  };

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  const errorMessage =
    error === "no_installer" ? t("update.noInstaller") : error;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return;
        setModalOpen(false);
      }}
      closeOnEsc={!busy}
      title={t("update.modalTitle")}
      description={t("update.modalSubtitle")}
      className="max-w-[440px]"
      footer={
        <>
          {!busy && (
            <Button variant="ghost" onClick={dismissModal}>
              {t("update.later")}
            </Button>
          )}
          {(phase === "idle" || phase === "error") && (
            <Button
              variant="ghost"
              icon={<ArrowSquareOut size={16} weight="bold" />}
              onClick={() => void openRelease()}
            >
              {t("update.openGithubFallback")}
            </Button>
          )}
          {phase === "error" ? (
            <Button
              variant="primary"
              icon={<ArrowsClockwise size={16} weight="bold" />}
              onClick={() => {
                resetInstall();
                if (canInstall) void startInstall();
                else void openRelease();
              }}
            >
              {canInstall ? t("update.retry") : t("update.openGithubFallback")}
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<ArrowsClockwise size={16} weight="bold" />}
              disabled={busy}
              onClick={() => {
                if (canInstall) void startInstall();
                else void openRelease();
              }}
            >
              {busy
                ? phase === "installing"
                  ? t("update.installing")
                  : t("update.downloading", {
                      percent:
                        percent !== null ? `${percent}%` : "…",
                    })
                : canInstall
                  ? t("update.now")
                  : t("update.openRelease")}
            </Button>
          )}
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
            <ArrowsClockwise
              size={26}
              weight="duotone"
              className={busy ? "animate-spin" : undefined}
            />
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
              {phase === "installing"
                ? t("update.installing")
                : phase === "downloading"
                  ? t("update.downloading", {
                      percent: percent !== null ? `${percent}%` : "…",
                    })
                  : t("update.modalBody")}
            </p>
            {errorMessage && phase === "error" && (
              <p className="mt-2 text-[12px] text-[var(--buddio-danger)]">
                {errorMessage}
              </p>
            )}
          </div>
        </div>

        {(phase === "downloading" || phase === "installing") && (
          <div className="border-t border-[var(--buddio-border-subtle)] px-4 py-3">
            <div
              className="h-2 overflow-hidden rounded-full bg-[var(--buddio-surface)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
            >
              <div
                className="h-full rounded-full bg-[var(--buddio-brand)] transition-[width] duration-200"
                style={{
                  width:
                    phase === "installing"
                      ? "100%"
                      : percent !== null
                        ? `${percent}%`
                        : "35%",
                  animation:
                    percent === null && phase === "downloading"
                      ? "pulse 1.2s ease-in-out infinite"
                      : undefined,
                }}
              />
            </div>
          </div>
        )}

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
