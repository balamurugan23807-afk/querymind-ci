-- ═══════════════════════════════════════════════════════════════
--  QueryMind Demo — Database Seed Script
--  Run this ENTIRE script in MySQL Workbench (Select All → Execute)
--  Or via CLI: mysql -u root -p < seed.sql
-- ═══════════════════════════════════════════════════════════════

-- 1) Create the database
CREATE DATABASE IF NOT EXISTS querymind_demo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE querymind_demo;

-- 2) Drop old table if re-seeding
DROP TABLE IF EXISTS transactions;

-- 3) Create the transactions table
--    ⚠ INTENTIONALLY NO INDEX on merchant_category or status
--    This forces a Full Table Scan (access_type: ALL) for demo purposes.
CREATE TABLE transactions (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT            NOT NULL,
  amount             DECIMAL(10,2)  NOT NULL,
  merchant_category  VARCHAR(64)    NOT NULL,
  status             VARCHAR(32)    NOT NULL,
  created_at         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4) Stored procedure to populate 20,000 synthetic rows
DROP PROCEDURE IF EXISTS seed_transactions;

DELIMITER //

CREATE PROCEDURE seed_transactions()
BEGIN
  DECLARE i INT DEFAULT 0;
  DECLARE v_user_id INT;
  DECLARE v_amount DECIMAL(10,2);
  DECLARE v_category VARCHAR(64);
  DECLARE v_status VARCHAR(32);
  DECLARE v_created_at TIMESTAMP;
  DECLARE v_cat_rand INT;
  DECLARE v_status_rand INT;

  -- Disable autocommit for bulk insert performance
  SET autocommit = 0;

  WHILE i < 20000 DO
    -- Random user_id between 1000 and 9999
    SET v_user_id = FLOOR(1000 + RAND() * 9000);

    -- Random amount between $1.50 and $4999.99
    SET v_amount = ROUND(1.50 + RAND() * 4998.49, 2);

    -- Pick a merchant category (8 categories)
    SET v_cat_rand = FLOOR(RAND() * 8);
    SET v_category = CASE v_cat_rand
      WHEN 0 THEN 'Electronics'
      WHEN 1 THEN 'Grocery'
      WHEN 2 THEN 'Travel'
      WHEN 3 THEN 'Restaurants'
      WHEN 4 THEN 'Healthcare'
      WHEN 5 THEN 'Entertainment'
      WHEN 6 THEN 'Fuel'
      WHEN 7 THEN 'Clothing'
    END;

    -- Pick a status (4 statuses, weighted toward COMPLETED)
    SET v_status_rand = FLOOR(RAND() * 10);
    SET v_status = CASE
      WHEN v_status_rand < 5  THEN 'COMPLETED'
      WHEN v_status_rand < 7  THEN 'PENDING'
      WHEN v_status_rand < 9  THEN 'FAILED'
      ELSE                         'REFUNDED'
    END;

    -- Random date within the last 365 days
    SET v_created_at = DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 365) DAY)
                     + INTERVAL FLOOR(RAND() * 86400) SECOND;

    INSERT INTO transactions (user_id, amount, merchant_category, status, created_at)
    VALUES (v_user_id, v_amount, v_category, v_status, v_created_at);

    SET i = i + 1;

    -- Commit every 2000 rows for performance
    IF i MOD 2000 = 0 THEN
      COMMIT;
    END IF;
  END WHILE;

  COMMIT;
  SET autocommit = 1;
END //

DELIMITER ;

-- 5) Execute the seed procedure
CALL seed_transactions();

-- 6) Verify the data
SELECT '──── SEED COMPLETE ────' AS info;
SELECT COUNT(*) AS total_rows FROM transactions;

SELECT merchant_category, status, COUNT(*) AS cnt
  FROM transactions
  GROUP BY merchant_category, status
  ORDER BY merchant_category, status;

-- 7) Confirm NO secondary indexes exist (only PK)
SHOW INDEX FROM transactions;

-- 8) Test the "bad" query — should show type: ALL (Full Table Scan)
EXPLAIN SELECT * FROM transactions
  WHERE merchant_category = 'Electronics' AND status = 'PENDING';
