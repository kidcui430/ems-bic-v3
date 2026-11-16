PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE Products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT NOT NULL UNIQUE, -- Sẽ được FE force toUpperCase()
    product_name TEXT NOT NULL,
    routing_map TEXT NOT NULL -- Lưu mảng JSON định tuyến: [{"order":1, "stage_id": 1}, ...]
);
INSERT INTO "Products" ("id","product_code","product_name","routing_map") VALUES(6,'TB-30','Liner motion bearing','[{"order":1,"stage_id":"CAT"},{"order":2,"stage_id":"NC1"},{"order":3,"stage_id":"NHIET_LUYEN"},{"order":4,"stage_id":"DO_CUNG"},{"order":5,"stage_id":"GP"},{"order":6,"stage_id":"GI"},{"order":7,"stage_id":"LAP_RAP"},{"order":8,"stage_id":"KIEM_TRA"},{"order":9,"stage_id":"DONG_THUNG"}]');
INSERT INTO "Products" ("id","product_code","product_name","routing_map") VALUES(7,'ASW-40','Thanh trục phi 40','[{"order":1,"stage_id":"CAT"},{"order":2,"stage_id":"DO_CUNG"},{"order":3,"stage_id":"NC2"},{"order":4,"stage_id":"XUAT_GCN"},{"order":5,"stage_id":"NHAN_GCN"},{"order":6,"stage_id":"DONG_THUNG"}]');
CREATE TABLE Production_Orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL UNIQUE, -- Mã LOT
    product_id INTEGER NOT NULL,
    month TEXT NOT NULL, -- Định dạng YYYY-MM (VD: 2026-10)
    total_qty INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES Products(id)
);
INSERT INTO "Production_Orders" ("id","po_number","product_id","month","total_qty","status","created_at") VALUES(56,'PO261611-01',6,'2026-11-16',100,'OPEN','2026-11-16 02:03:30');
INSERT INTO "Production_Orders" ("id","po_number","product_id","month","total_qty","status","created_at") VALUES(57,'PO261611-02',6,'2026-11-16',100,'OPEN','2026-11-16 02:03:30');
INSERT INTO "Production_Orders" ("id","po_number","product_id","month","total_qty","status","created_at") VALUES(58,'PO261611-03',6,'2026-11-16',100,'OPEN','2026-11-16 02:03:31');
INSERT INTO "Production_Orders" ("id","po_number","product_id","month","total_qty","status","created_at") VALUES(59,'PO261611-04',6,'2026-11-16',100,'OPEN','2026-11-16 02:03:31');
INSERT INTO "Production_Orders" ("id","po_number","product_id","month","total_qty","status","created_at") VALUES(60,'PO261611-05',6,'2026-11-16',100,'OPEN','2026-11-16 02:03:31');
CREATE TABLE Inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    lot_number TEXT,
    stage_id TEXT,
    quantity INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, lot_number, stage_id)
);
INSERT INTO "Inventory" ("id","product_id","lot_number","stage_id","quantity","updated_at") VALUES(79,'6','PO261611-01','CAT',100,'2026-11-16 02:03:30');
INSERT INTO "Inventory" ("id","product_id","lot_number","stage_id","quantity","updated_at") VALUES(80,'6','PO261611-02','CAT',100,'2026-11-16 02:03:30');
INSERT INTO "Inventory" ("id","product_id","lot_number","stage_id","quantity","updated_at") VALUES(81,'6','PO261611-03','CAT',100,'2026-11-16 02:03:31');
INSERT INTO "Inventory" ("id","product_id","lot_number","stage_id","quantity","updated_at") VALUES(82,'6','PO261611-04','CAT',100,'2026-11-16 02:03:31');
INSERT INTO "Inventory" ("id","product_id","lot_number","stage_id","quantity","updated_at") VALUES(83,'6','PO261611-05','CAT',100,'2026-11-16 02:03:31');
CREATE TABLE Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT,
    line_id TEXT
, full_name TEXT);
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(1,'BIC000','0000','ADMIN','ALL','NPC');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(9,'BIC0940','000','ADMIN','ALL','Hồ Trọng Khải');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(10,'BIC0104','000','ADMIN','ALL','Nguyễn Tiến Vũ');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(11,'BIC0601','000','LEADER','CUTTING','Đào Văn Hiếu');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(12,'BIC1497','000','LEADER','CUTTING','Huỳnh Văn Khải');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(13,'BIC0867','000','LEADER','MNC','Đào Văn Nghị');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(14,'BIC0597','000','LEADER','MNC','Trịnh Trọng Cường');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(15,'BIC0793','000','LEADER','ASSY','Lê Thị Lệ Huyền');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(16,'BIC0631','000','LEADER','ASSY','Nguyễn Thị Nguyên');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(17,'BIC1356','000','LEADER','ASSY','Nguyễn Thị Huyền');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(18,'BIC1052','000','LEADER','KENSA','Võ Thị Hoàng Nhị');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(19,'BIC0586','000','LEADER','KENSA','Lê Thị Lệ Hằng');
INSERT INTO "Users" ("id","username","password_hash","role","line_id","full_name") VALUES(20,'BIC001','0000','LEADER','ASSY','NPC-ASSY');
CREATE TABLE Lines (
    line_id TEXT PRIMARY KEY,
    line_name TEXT
);
INSERT INTO "Lines" ("line_id","line_name") VALUES('CUTTING','Line Cutting');
INSERT INTO "Lines" ("line_id","line_name") VALUES('NC','Line NC');
INSERT INTO "Lines" ("line_id","line_name") VALUES('MNC','Line MNC');
INSERT INTO "Lines" ("line_id","line_name") VALUES('GS_GV','Line GS-GV');
INSERT INTO "Lines" ("line_id","line_name") VALUES('GP_GE_GI','Line GP-GE-GI');
INSERT INTO "Lines" ("line_id","line_name") VALUES('ASSY','Line Assy');
INSERT INTO "Lines" ("line_id","line_name") VALUES('KENSA','Line Kensa');
INSERT INTO "Lines" ("line_id","line_name") VALUES('BARRY','Line Barry');
CREATE TABLE Stages (
    stage_id TEXT PRIMARY KEY,
    line_id TEXT,
    stage_name TEXT
);
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('CAT','CUTTING','Cắt');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('NHIET_LUYEN','CUTTING','Nhiệt luyện');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('DO_CUNG','CUTTING','Độ cứng');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('NC1','NC','NC1');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('NC2','NC','NC2');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('NC3','NC','NC3');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('MNC1','MNC','MNC1');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('MNC2','MNC','MNC2');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('MNC3','MNC','MNC3');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('LAP_RAP','ASSY','Lắp ráp');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('DONG_THUNG','ASSY','Đóng thùng');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('XUAT_GCN','ASSY','Đi Gia Công Ngoài');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('NHAN_GCN','ASSY','Nhận Gia Công Ngoài');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('KIEM_TRA','KENSA','Kiểm tra');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('GS','GS_GV','GS');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('GV','GS_GV','GV');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('GP','GP_GE_GI','GP');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('GE','GP_GE_GI','GE');
INSERT INTO "Stages" ("stage_id","line_id","stage_name") VALUES('GI','GP_GE_GI','GI');
CREATE TABLE Transactions_Log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    po_id INTEGER,
    from_stage TEXT,
    to_stage TEXT,
    qty INTEGER,
    type TEXT,
    note TEXT
);
CREATE TABLE Stages_Config (
      id TEXT PRIMARY KEY,
      stage_name TEXT NOT NULL,
      line_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('CAT','Cắt','CUTTING',1);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('NHIET_LUYEN','Nhiệt luyện','CUTTING',2);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('DO_CUNG','Độ cứng','CUTTING',3);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('NC1','NC1','NC',4);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('NC2','NC2','NC',5);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('NC3','NC3','NC',6);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('MNC1','MNC1','MNC',7);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('MNC2','MNC2','MNC',8);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('MNC3','MNC3','MNC',9);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('GS','GS','GS_GV',10);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('GV','GV','GS_GV',11);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('GP','GP','GP_GE_GI',12);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('GE','GE','GP_GE_GI',13);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('GI','GI','GP_GE_GI',14);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('XUAT_GCN','Đi GCN','ASSY',16);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('NHAN_GCN','Nhận GCN','ASSY',17);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('LAP_RAP','Lắp ráp','ASSY',18);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('KIEM_TRA','Kiểm tra','KENSA',19);
INSERT INTO "Stages_Config" ("id","stage_name","line_id","sort_order") VALUES('DONG_THUNG','Đóng thùng','ASSY',20);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('Products',7);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('Production_Orders',68);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('Inventory',91);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('Users',20);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('Transactions_Log',12);
