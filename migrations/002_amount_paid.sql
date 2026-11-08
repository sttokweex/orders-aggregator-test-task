ALTER TABLE orders ADD COLUMN amount_paid_kop BIGINT;
UPDATE orders SET amount_paid_kop = amount_kop;
ALTER TABLE orders ALTER COLUMN amount_paid_kop SET NOT NULL;
