ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
