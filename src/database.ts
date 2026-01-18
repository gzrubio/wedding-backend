import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'wedding.db');
const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS rsvp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    can_attend INTEGER NOT NULL,
    dietary_restrictions TEXT,
    where_staying TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS music_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_name TEXT NOT NULL,
    artist TEXT NOT NULL,
    link TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

export default db;
