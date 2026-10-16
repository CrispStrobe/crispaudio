//! Stage away from the selected output file without weakening atomic publication.
use std::path::Path;

fn parent(output: &Path) -> &Path {
    output
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."))
}

/// Save-panel access covers the named file, not arbitrary sibling scratch files.
/// A hard link can publish private staging atomically on the same filesystem.
/// For another volume (or an unreadable parent), retain sibling staging instead:
/// the GUI obtains an explicit folder grant before starting that render.
pub fn uses_private_directory(output: &Path) -> bool {
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::fs::MetadataExt;
        match (
            std::fs::metadata(parent(output)),
            std::fs::metadata(std::env::temp_dir()),
        ) {
            (Ok(destination), Ok(temporary)) => destination.dev() == temporary.dev(),
            _ => false,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = output;
        false
    }
}

pub fn directory(output: &Path) -> crate::Result<tempfile::TempDir> {
    let result = if uses_private_directory(output) {
        tempfile::tempdir()
    } else {
        tempfile::tempdir_in(parent(output))
    };
    result.map_err(|e| format!("Cannot stage export: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn complete_output_is_published_once_and_scratch_is_removed() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("mix.wav");
        let scratch_path;
        {
            let scratch = directory(&target).unwrap();
            scratch_path = scratch.path().to_owned();
            #[cfg(target_os = "macos")]
            assert!(!scratch.path().starts_with(root.path()));
            let staged = scratch.path().join("mix.wav");
            std::fs::write(&staged, b"complete render").unwrap();
            assert!(!target.exists());
            std::fs::hard_link(&staged, &target).unwrap();
            let other = scratch.path().join("other.wav");
            std::fs::write(&other, b"replacement").unwrap();
            assert!(std::fs::hard_link(other, &target).is_err());
            assert_eq!(std::fs::read(&target).unwrap(), b"complete render");
        }
        assert!(!scratch_path.exists());
        assert!(target.exists());
    }
    #[test]
    fn missing_parent_is_not_treated_as_private_staging() {
        let root = tempfile::tempdir().unwrap();
        let output = root.path().join("missing/mix.wav");
        assert!(!uses_private_directory(&output));
        assert!(directory(&output).is_err());
        assert!(!output.exists());
    }
    #[cfg(unix)]
    #[test]
    fn publication_does_not_follow_an_existing_destination_symlink() {
        let root = tempfile::tempdir().unwrap();
        let original = root.path().join("original");
        let target = root.path().join("mix.wav");
        std::fs::write(&original, b"keep").unwrap();
        std::os::unix::fs::symlink(&original, &target).unwrap();
        let scratch = directory(&target).unwrap();
        let staged = scratch.path().join("mix.wav");
        std::fs::write(&staged, b"new render").unwrap();
        assert!(std::fs::hard_link(staged, target).is_err());
        assert_eq!(std::fs::read(original).unwrap(), b"keep");
    }
}
