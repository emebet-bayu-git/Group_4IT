CREATE TABLE IF NOT EXISTS gallery_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  description VARCHAR(500) NULL,
  image_path VARCHAR(500) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Events',
  is_featured_home BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_featured_active (is_featured_home, is_active, created_at)
);
