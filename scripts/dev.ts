/**
 * Development without the shell: the daemon and the app's dev server together, in one
 * terminal, stopped together. The app reaches the daemon through the dev server's session
 * route, the way it will through the shell.
 */
const daemon = Bun.spawn(["bun", "run", "src/main.ts"], { cwd: "packages/daemon", stdout: "inherit", stderr: "inherit", stdin: "pipe", env: { ...process.env, LATTICE_PARENT: "1" } });
const app = Bun.spawn(["bunx", "vite"], { cwd: "packages/app", stdout: "inherit", stderr: "inherit" });
const stop = () => {
  daemon.kill();
  app.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race([daemon.exited, app.exited]);
stop();
