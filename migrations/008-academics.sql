-- Academics versioning, normalized programme/course relationships, and source document history.
CREATE TABLE IF NOT EXISTS academic_structures (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  version_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  source_notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS academic_programmes (
  id INTEGER PRIMARY KEY,
  structure_id INTEGER NOT NULL REFERENCES academic_structures(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  major TEXT,
  minor TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS academic_courses (
  id INTEGER PRIMARY KEY,
  structure_id INTEGER NOT NULL REFERENCES academic_structures(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  credit_hours INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(structure_id,code,title,credit_hours)
);

CREATE TABLE IF NOT EXISTS academic_course_assignments (
  id INTEGER PRIMARY KEY,
  programme_id INTEGER NOT NULL REFERENCES academic_programmes(id) ON DELETE RESTRICT,
  course_id INTEGER NOT NULL REFERENCES academic_courses(id) ON DELETE RESTRICT,
  semester INTEGER NOT NULL CHECK(semester BETWEEN 1 AND 5),
  remarks TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS academic_documents (
  id INTEGER PRIMARY KEY,
  structure_id INTEGER NOT NULL REFERENCES academic_structures(id) ON DELETE RESTRICT,
  file_token TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_academic_structure_status ON academic_structures(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_academic_programmes_structure ON academic_programmes(structure_id,display_order,id);
CREATE INDEX IF NOT EXISTS idx_academic_assignments_programme ON academic_course_assignments(programme_id,semester,active,display_order,id);
CREATE INDEX IF NOT EXISTS idx_academic_documents_structure ON academic_documents(structure_id,is_current DESC,id DESC);
