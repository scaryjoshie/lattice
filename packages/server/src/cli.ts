/**
 * `pane attach`: run by a Claude Code SessionStart hook inside a Pane-spawned session.
 * Hands the session's inbox token to the daemon so messages can be posted without
 * typing into the terminal. Never fails the session: exits 0 whatever happens.
 */

async function attach(env: Record<string, string | undefined>): Promise<void> {
  const token = env.CLAUDE_CODE_MESSAGING_TOKEN;
  const socket = env.PANE_SOCKET;
  const agentId = env.PANE_AGENT_ID;
  const paneToken = env.PANE_TOKEN;
  if (!token || !socket || !agentId || !paneToken) return;
  await fetch("http://pane/rpc", {
    method: "POST",
    unix: socket,
    body: JSON.stringify({
      method: "attach",
      params: { token },
      identity: { agentId, token: paneToken },
    }),
    headers: { "content-type": "application/json" },
  }).catch(() => undefined);
}

if (import.meta.main) {
  const [cmd] = process.argv.slice(2);
  if (cmd === "attach") await attach(process.env);
  else process.stdout.write("usage: pane attach\n");
  process.exit(0);
}
