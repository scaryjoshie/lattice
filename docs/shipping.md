# Shipping

How a Mac app is installed and what that mandates. Decided 24 September 2026. None of it
constrains the code today; while only one person runs it, `tauri dev` runs it unsigned from
the checkout.

1. The app is Tauri. It uses the system webview, so the shell itself is well under a
   megabyte and Rust does only the window, tray and lifecycle. The Bun sidecar embeds the
   Bun runtime and is what the bundle weighs: tens of megabytes.
2. The daemon is a Bun binary compiled with `bun build --compile`, shipped inside the
   bundle as a sidecar, and supervised by the app. See [runtime.md](runtime.md).
3. A Mac app is a folder, `Lattice.app`. A dmg is a disk image carrying it; installing is
   dragging it to Applications. A Homebrew cask does the same drag from a URL and is not a
   different install path.
4. Gatekeeper: an app downloaded from the internet must be signed with an Apple Developer
   ID and notarised. Signed but not notarised, current macOS refuses it until the user
   uses Open Anyway in Privacy & Security; Sequoia removed the Control-click override.
   Unsigned, it is reported as damaged and will not open at all. Distributing to anyone
   else needs the paid Apple Developer Program. `tauri build` signs and notarises once the
   certificate exists.
5. Notarisation checks every Mach-O in the bundle, so the sidecar is signed too, with the
   hardened runtime. Bun's own docs list the entitlements its binary needs under it:
   allow-jit and allow-unsigned-executable-memory at least, and possibly
   disable-library-validation, to be verified when it is first built.
6. Not the App Store. App Store apps must be sandboxed. A sandboxed app can spawn
   processes, but its shells inherit the sandbox and can reach only folders the user has
   granted, which rules out a general terminal, and review guideline 2.4.5(iii) bars
   processes that keep running after quit. Direct distribution has no sandbox
   requirement, which is the position every terminal and developer tool is in.
7. No launch agent, no system daemon, no root. The daemon dies with the app. See
   [runtime.md](runtime.md) 2.
8. Updates: Tauri's updater downloads an update artifact and verifies its signature
   against the app's public key before swapping the bundle. Added when there are users,
   not before.
9. State under `~/.lattice/`. Code is never under a dotfolder.
