//! Suggest free global shortcuts for newly imported clips.
//!
//! Pool order: `F1`–`F12`, then `Ctrl+Alt+1`..`Ctrl+Alt+9`, then overflow
//! `Ctrl+Shift+1`..`9` / `A`–`Z` (needed when index hotkeys reserve Ctrl+Alt).
//!
//! **Windows note:** bare function keys (`F1`–`F12`) are treated as fragile by
//! [`crate::managers::hotkeys::is_fragile_accelerator`] and are skipped by the
//! suggester so imports get usable chords. Prefer `Ctrl+Alt+N` (or capture a
//! modified chord) when binding manually.

use std::collections::HashSet;

use crate::managers::hotkeys::{is_fragile_accelerator, normalize_shortcut};

/// Full suggestion pool in priority order (before fragile / used filtering).
pub fn hotkey_pool() -> Vec<String> {
    let mut pool = Vec::with_capacity(21 + 9 + 26);
    for n in 1..=12 {
        pool.push(format!("F{n}"));
    }
    for n in 1..=9 {
        pool.push(format!("CommandOrControl+Alt+{n}"));
    }
    // Overflow when F-keys are fragile and/or Ctrl+Alt is reserved for index pads.
    for n in 1..=9 {
        pool.push(format!("CommandOrControl+Shift+{n}"));
    }
    for c in b'A'..=b'Z' {
        pool.push(format!("CommandOrControl+Shift+{}", c as char));
    }
    pool
}

/// Keys reserved when index hotkeys (`Ctrl+Alt+N`) are enabled.
pub fn index_reserved_hotkeys() -> Vec<String> {
    let mut keys = Vec::with_capacity(20);
    for n in 1..=9 {
        keys.push(normalize_shortcut(&format!("CommandOrControl+Alt+{n}")));
    }
    keys.push(normalize_shortcut("CommandOrControl+Alt+0"));
    for n in 1..=9 {
        keys.push(normalize_shortcut(&format!("Alt+Numpad{n}")));
    }
    keys.push(normalize_shortcut("Alt+Numpad0"));
    keys
}

/// Suggest up to `count` free shortcuts from the pool.
///
/// `used` should include existing clip hotkeys, stop-all, and (when enabled)
/// index/numpad reserved chords — all already normalized or raw.
pub fn suggest_auto_hotkeys(used: impl IntoIterator<Item = String>, count: u32) -> Vec<String> {
    if count == 0 {
        return Vec::new();
    }

    let used: HashSet<String> = used
        .into_iter()
        .filter(|s| !s.is_empty())
        .map(|s| normalize_shortcut(&s))
        .collect();

    hotkey_pool()
        .into_iter()
        .filter(|candidate| {
            let norm = normalize_shortcut(candidate);
            !used.contains(&norm) && !is_fragile_accelerator(&norm)
        })
        .take(count as usize)
        .map(|s| normalize_shortcut(&s))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pool_order_f_then_ctrl_alt() {
        let pool = hotkey_pool();
        assert_eq!(pool.first().map(String::as_str), Some("F1"));
        assert_eq!(pool.get(11).map(String::as_str), Some("F12"));
        assert_eq!(
            pool.get(12).map(|s| normalize_shortcut(s)),
            Some(normalize_shortcut("CommandOrControl+Alt+1"))
        );
    }

    #[test]
    fn skips_fragile_f_keys_and_used() {
        let suggested = suggest_auto_hotkeys(vec!["Ctrl+Alt+1".into()], 3);
        assert_eq!(suggested.len(), 3);
        assert!(!suggested.iter().any(|s| is_fragile_accelerator(s)));
        assert!(!suggested.iter().any(|s| s == &normalize_shortcut("Ctrl+Alt+1")));
        assert_eq!(suggested[0], normalize_shortcut("CommandOrControl+Alt+2"));
    }

    #[test]
    fn overflow_when_ctrl_alt_reserved() {
        let reserved = index_reserved_hotkeys();
        let suggested = suggest_auto_hotkeys(reserved, 2);
        assert_eq!(suggested.len(), 2);
        assert_eq!(suggested[0], normalize_shortcut("CommandOrControl+Shift+1"));
    }

    #[test]
    fn respects_count_zero() {
        assert!(suggest_auto_hotkeys(vec![], 0).is_empty());
    }
}
