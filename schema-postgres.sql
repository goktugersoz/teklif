CREATE TABLE IF NOT EXISTS tender_requests (
  id VARCHAR(16) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  owner VARCHAR(255) DEFAULT '',
  pdf_name VARCHAR(255) DEFAULT '',
  raw_text TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS request_items (
  id VARCHAR(80) PRIMARY KEY,
  request_id VARCHAR(16) NOT NULL REFERENCES tender_requests(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pos_no VARCHAR(120) DEFAULT '',
  description TEXT NOT NULL,
  quantity VARCHAR(80) DEFAULT '',
  unit VARCHAR(40) DEFAULT '',
  estimated_unit_price VARCHAR(80) DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_request_items_request
  ON request_items(request_id, sort_order);

CREATE TABLE IF NOT EXISTS offers (
  offer_id VARCHAR(24) PRIMARY KEY,
  request_id VARCHAR(16) NOT NULL REFERENCES tender_requests(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) DEFAULT '',
  contact_phone VARCHAR(80) DEFAULT '',
  submitted_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offers_request
  ON offers(request_id, submitted_at);

CREATE TABLE IF NOT EXISTS offer_items (
  id BIGSERIAL PRIMARY KEY,
  offer_id VARCHAR(24) NOT NULL REFERENCES offers(offer_id) ON DELETE CASCADE,
  item_id VARCHAR(80) NOT NULL REFERENCES request_items(id) ON DELETE CASCADE,
  unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  UNIQUE (offer_id, item_id)
);
