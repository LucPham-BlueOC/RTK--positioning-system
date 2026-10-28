CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  true_distance_m REAL
);

CREATE TABLE devices (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  user_agent TEXT,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_code, id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_s INTEGER NOT NULL,
  true_distance_m REAL
);
CREATE INDEX sessions_room ON sessions(room_code, started_at);

CREATE TABLE samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  seq INTEGER NOT NULL,
  t_device INTEGER NOT NULL,
  t_server INTEGER NOT NULL,
  t_received INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  alt REAL,
  accuracy REAL NOT NULL,
  alt_accuracy REAL,
  speed REAL,
  heading REAL,
  source TEXT NOT NULL,
  UNIQUE (room_code, device_id, seq)
);
CREATE INDEX samples_room_time ON samples(room_code, t_server);
