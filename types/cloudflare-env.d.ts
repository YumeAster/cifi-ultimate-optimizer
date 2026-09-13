// Optional: the current hosting manifest has no D1 binding. getDb checks this
// at runtime; declaring the optional binding does not provision a database.
declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
  }
}
