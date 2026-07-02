CREATE TABLE IF NOT EXISTS tender_requests (
  id VARCHAR(16) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  owner VARCHAR(255) DEFAULT '',
  pdf_name VARCHAR(255) DEFAULT '',
  raw_text MEDIUMTEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_items (
  id VARCHAR(80) PRIMARY KEY,
  request_id VARCHAR(16) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  pos_no VARCHAR(120) DEFAULT '',
  description TEXT NOT NULL,
  quantity VARCHAR(80) DEFAULT '',
  unit VARCHAR(40) DEFAULT '',
  estimated_unit_price VARCHAR(80) DEFAULT '',
  KEY idx_request_items_request (request_id, sort_order),
  CONSTRAINT fk_request_items_request
    FOREIGN KEY (request_id) REFERENCES tender_requests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offers (
  offer_id VARCHAR(24) PRIMARY KEY,
  request_id VARCHAR(16) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) DEFAULT '',
  contact_phone VARCHAR(80) DEFAULT '',
  submitted_at DATETIME NOT NULL,
  KEY idx_offers_request (request_id, submitted_at),
  CONSTRAINT fk_offers_request
    FOREIGN KEY (request_id) REFERENCES tender_requests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offer_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  offer_id VARCHAR(24) NOT NULL,
  item_id VARCHAR(80) NOT NULL,
  unit_price DECIMAL(18,4) NOT NULL DEFAULT 0,
  CONSTRAINT fk_offer_items_offer
    FOREIGN KEY (offer_id) REFERENCES offers(offer_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_offer_items_item
    FOREIGN KEY (item_id) REFERENCES request_items(id)
    ON DELETE CASCADE,
  UNIQUE KEY uniq_offer_item (offer_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
