# Shipping

How a Mac app is installed and what that mandates. Decided 24 September 2026. None of it
constrains the code today; while only one person runs it, `tauri dev` runs it unsigned from
the checkout.

1. The app is Tauri. It uses the system webview, so the bundle is a few megabytes and Rust
   does only the window, tray and lifecycle.
2. The daemon is a Bun binary compiled with `bun build --compile`, shipped inside the
   bundle as a sidecar, and supervised by the app. See [runtime.md](runtime.md).
3. A Mac app is a folder, `Lattice.app`. A dmg is a disk image carrying it; installing is
   dragging it to Applications. A Homebrew cask does the same drag from a URL and is not a
   different install path.
4. Gatekeeper: an app downloaded from the internet must be signed with an Apple Developer
   ID and notarised, or current macOS refuses to open it until the user allows it in
   Privacy & Security. Distributing to anyone else needs the Apple Developer Program.
   `tauri build` signs and notarises once the certificate exists.
5. Notarisation checks every executable in the bundle, so the sidecar is signed too. Bun
   uses a JIT and needs the allow-JIT entitlement on that binary.
6. Not the App Store. App Store apps must be sandboxed, and a sandboxed app cannot spawn
   PTYs or manage a folder of repos. Direct distribution has no sandbox requirement, which
   is the position every terminal and developer tool is in.
7. No launch agent, no system daemon, no root. The daemon dies with the app. See
   [runtime.md](runtime.md) 2.
8. Updates: Tauri's updater checks a signed manifest and swaps the bundle. Added when there
   are users, not before.
9. State under `~/.lattice/`. Code is never under a dotfolder.
