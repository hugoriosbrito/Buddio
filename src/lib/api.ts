import { commands } from "./bindings";
import type {
  AppSettings,
  ClipDto,
  ClipUpdate,
  CollectionDto,
  CollectionUpdate,
  DiagnosticsDto,
  ImportResult,
  MicRouteModeDto,
  OutputDeviceDto,
  OutputDevicesConfig,
  ProfileDto,
  ProfileUpdate,
  VirtualCableEnsureResult,
  VirtualCableStatusDto,
  WatchedFolderDto,
} from "./bindings";

export type {
  AppSettings,
  ClipDto,
  ClipUpdate,
  CollectionDto,
  CollectionUpdate,
  DiagnosticsDto,
  ImportResult,
  MicRouteModeDto,
  OutputDeviceDto,
  OutputDevicesConfig,
  ProfileDto,
  ProfileUpdate,
  VirtualCableEnsureResult,
  VirtualCableStatusDto,
  WatchedFolderDto,
};

type Result<T, E> =
  | { status: "ok"; data: T }
  | { status: "error"; error: E };

function unwrap<T>(result: Result<T, string>): T {
  if (result.status === "ok") return result.data;
  throw new Error(result.error);
}

export async function importClips(paths: string[] | null = null) {
  return unwrap(await commands.importClips(paths));
}

export async function importFolder(path: string | null = null) {
  return unwrap(await commands.importFolder(path));
}

export async function listWatchedFolders() {
  return unwrap(await commands.listWatchedFolders());
}

export async function addWatchedFolder(
  path: string | null = null,
  collectionId: string | null = null,
) {
  return unwrap(await commands.addWatchedFolder(path, collectionId));
}

export async function removeWatchedFolder(id: string) {
  unwrap(await commands.removeWatchedFolder(id));
}

export async function setWatchedFolderEnabled(id: string, enabled: boolean) {
  return unwrap(await commands.setWatchedFolderEnabled(id, enabled));
}

export async function listClips() {
  return unwrap(await commands.listClips());
}

export async function updateClip(id: string, update: Partial<ClipUpdate>) {
  return unwrap(
    await commands.updateClip(id, {
      name: update.name ?? null,
      volume: update.volume ?? null,
      loopEnabled: update.loopEnabled ?? null,
      position: update.position ?? null,
      trimStartMs: update.trimStartMs ?? null,
      trimEndMs: update.trimEndMs ?? null,
      fadeInMs: update.fadeInMs ?? null,
      fadeOutMs: update.fadeOutMs ?? null,
      gainDb: update.gainDb ?? null,
      restartOnPress: update.restartOnPress ?? null,
      stopOthers: update.stopOthers ?? null,
      emoji: update.emoji ?? null,
      pinned: update.pinned ?? null,
    }),
  );
}

export async function deleteClip(id: string) {
  unwrap(await commands.deleteClip(id));
}

export async function playClip(id: string) {
  unwrap(await commands.playClip(id));
}

export async function playTestSample() {
  unwrap(await commands.playTestSample());
}

export async function stopClip(id: string) {
  unwrap(await commands.stopClip(id));
}

export async function stopAll() {
  unwrap(await commands.stopAll());
}

export async function setMasterVolume(volume: number) {
  unwrap(await commands.setMasterVolume(volume));
}

export async function listOutputDevices() {
  return unwrap(await commands.listOutputDevices());
}

export async function setOutputDevices(config: OutputDevicesConfig) {
  unwrap(await commands.setOutputDevices(config));
}

export async function getSettings() {
  return unwrap(await commands.getSettings());
}

export async function setClipHotkey(id: string, hotkey: string | null) {
  return unwrap(await commands.setClipHotkey(id, hotkey));
}

export async function setStopAllHotkey(hotkey: string | null) {
  unwrap(await commands.setStopAllHotkey(hotkey));
}

export async function suspendHotkeys() {
  unwrap(await commands.suspendHotkeys());
}

export async function resumeHotkeys() {
  unwrap(await commands.resumeHotkeys());
}

export async function suggestAutoHotkeys(count: number) {
  return unwrap(await commands.suggestAutoHotkeys(count));
}

export async function syncIndexHotkeys(collectionId: string | null = null) {
  unwrap(await commands.syncIndexHotkeys(collectionId));
}

export async function listCollections() {
  return unwrap(await commands.listCollections());
}

export async function createCollection(name: string, color: string | null = null) {
  return unwrap(await commands.createCollection(name, color));
}

export async function updateCollection(id: string, update: Partial<CollectionUpdate>) {
  return unwrap(
    await commands.updateCollection(id, {
      name: update.name ?? null,
      color: update.color ?? null,
      position: update.position ?? null,
    }),
  );
}

export async function deleteCollection(id: string) {
  unwrap(await commands.deleteCollection(id));
}

export async function setClipCollections(clipId: string, collectionIds: string[]) {
  unwrap(await commands.setClipCollections(clipId, collectionIds));
}

export async function listProfiles() {
  return unwrap(await commands.listProfiles());
}

export async function createProfile(name: string) {
  return unwrap(await commands.createProfile(name));
}

export async function updateProfile(id: string, update: Partial<ProfileUpdate>) {
  return unwrap(
    await commands.updateProfile(id, {
      name: update.name ?? null,
      monitorEnabled: update.monitorEnabled ?? null,
      monitorDevice: update.monitorDevice ?? null,
      secondaryDevice: update.secondaryDevice ?? null,
      masterVolume: update.masterVolume ?? null,
      collectionId: update.collectionId ?? null,
      isDefault: update.isDefault ?? null,
      micRouteMode: update.micRouteMode ?? null,
      duckingDb: update.duckingDb ?? null,
    }),
  );
}

export async function deleteProfile(id: string) {
  unwrap(await commands.deleteProfile(id));
}

export async function applyProfile(id: string) {
  return unwrap(await commands.applyProfile(id));
}

export async function getDiagnostics() {
  return unwrap(await commands.getDiagnostics());
}

export async function setTheme(theme: string) {
  unwrap(await commands.setTheme(theme));
}

export async function setLocale(locale: string) {
  unwrap(await commands.setLocale(locale));
}

export async function setOnboardingDone(done: boolean) {
  unwrap(await commands.setOnboardingDone(done));
}

export async function setMicMix(enabled: boolean) {
  unwrap(await commands.setMicMix(enabled));
}

export async function setMicRoute(
  mode: MicRouteModeDto,
  duckingDb: number | null = null,
) {
  unwrap(await commands.setMicRoute(mode, duckingDb));
}

export async function setVadSound(enabled: boolean) {
  unwrap(await commands.setVadSound(enabled));
}

export async function setVoiceTargetLufs(lufs: number) {
  unwrap(await commands.setVoiceTargetLufs(lufs));
}

export async function setIndexHotkeysEnabled(enabled: boolean) {
  unwrap(await commands.setIndexHotkeysEnabled(enabled));
}

export async function setMicDevice(device: string | null) {
  unwrap(await commands.setMicDevice(device));
}

export async function setPinnedClips(clipIds: string[]) {
  unwrap(await commands.setPinnedClips(clipIds));
}

export async function showMiniWindow() {
  unwrap(await commands.showMiniWindow());
}

export async function hideMiniWindow() {
  unwrap(await commands.hideMiniWindow());
}

export async function listInputDevices() {
  return unwrap(await commands.listInputDevices());
}

export async function startMicMeter(deviceName: string | null = null) {
  unwrap(await commands.startMicMeter(deviceName));
}

export async function stopMicMeter() {
  unwrap(await commands.stopMicMeter());
}

export async function getMicLevel() {
  return unwrap(await commands.getMicLevel());
}

export async function getVirtualCableStatus() {
  return unwrap(await commands.getVirtualCableStatus());
}

export async function ensureVirtualCable() {
  return unwrap(await commands.ensureVirtualCable());
}

export async function startNsisUpdate(version: string, downloadUrl: string) {
  unwrap(await commands.startNsisUpdate(version, downloadUrl));
}
