pub mod backup;
pub mod collections;
pub mod folder_watch;
pub mod hotkey_allocator;
pub mod hotkeys;
pub mod library;
pub mod nsis_update;
pub mod profiles;
pub mod settings;
pub mod virtual_cable;

pub use collections::CollectionsManager;
pub use folder_watch::FolderWatchManager;
pub use hotkeys::HotkeyManager;
pub use library::LibraryManager;
pub use profiles::ProfilesManager;
pub use settings::SettingsManager;
