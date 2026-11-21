-- Index tra cứu nhanh. Worker TỰ CHẠY các câu này (một lần mỗi instance) nên không bắt buộc chạy tay.
-- Chỉ thêm index, không đổi/xóa dữ liệu. Muốn bỏ: DROP INDEX idx_inventory_lot_stage; DROP INDEX idx_txlog_timestamp;
CREATE INDEX IF NOT EXISTS idx_inventory_lot_stage ON Inventory (lot_number, stage_id);
CREATE INDEX IF NOT EXISTS idx_txlog_timestamp ON Transactions_Log (timestamp);
