import { chmodSync } from "node:fs";
import { Database } from "bun:sqlite";
import type { Grid } from "@lattice/model";

/**
 * The only module that speaks SQL. One file, WAL, migrations run at open. The document is
 * one JSON snapshot rewritten after every command, since the grid is small and a value;
 * `events` is the append-only record of everything that happened.
 */
const MIGRATIONS: readonly string[] = [
  `create table if not exists document (id integer primary key check (id = 1), json text not null, saved_at integer not null);
   create table if not exists events (seq integer primary key autoincrement, at integer not null, kind text not null, payload text not null);
   create table if not exists preferences (id integer primary key check (id = 1), json text not null);`,
];

export class Store {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    // Owner-only, like everything in the home: SQLite creates with the process umask.
    chmodSync(path, 0o600);
    this.db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");
    const version = (this.db.query("pragma user_version").get() as { user_version: number }).user_version;
    for (let i = version; i < MIGRATIONS.length; i++) {
      this.db.exec(MIGRATIONS[i]!);
      this.db.exec(`pragma user_version = ${i + 1}`);
    }
  }

  loadDocument(): Grid | null {
    const row = this.db.query("select json from document where id = 1").get() as { json: string } | null;
    return row ? (JSON.parse(row.json) as Grid) : null;
  }

  saveDocument(grid: Grid): void {
    this.db
      .query("insert into document (id, json, saved_at) values (1, ?, ?) on conflict (id) do update set json = excluded.json, saved_at = excluded.saved_at")
      .run(JSON.stringify(grid), Date.now());
  }

  record(kind: string, payload: unknown): void {
    this.db.query("insert into events (at, kind, payload) values (?, ?, ?)").run(Date.now(), kind, JSON.stringify(payload));
  }

  events(): { seq: number; at: number; kind: string; payload: unknown }[] {
    return (this.db.query("select seq, at, kind, payload from events order by seq").all() as { seq: number; at: number; kind: string; payload: string }[]).map(
      (r) => ({ ...r, payload: JSON.parse(r.payload) as unknown }),
    );
  }

  close(): void {
    this.db.close();
  }
}
