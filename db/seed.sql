INSERT INTO users (full_name, email, password_hash, role)
VALUES
  ('Admin User', 'admin@optiflow.local', 'changeme', 'admin'),
  ('Maintenance Lead', 'lead@optiflow.local', 'changeme', 'maintenance_manager'),
  ('Technician One', 'tech1@optiflow.local', 'changeme', 'technician');

INSERT INTO plants (name, location)
VALUES
  ('Plant A', 'Industrial Area Zone 1');

INSERT INTO machines (plant_id, machine_code, name, machine_type, criticality, install_date, runtime_hours_total)
VALUES
  (1, 'MCH-CNC-001', 'CNC Machine 1', 'CNC', 'critical', '2022-01-15', 16420.5),
  (1, 'MCH-PKG-002', 'Packaging Line 2', 'Packaging', 'high', '2021-06-02', 20211.0),
  (1, 'MCH-CMP-003', 'Air Compressor 3', 'Compressor', 'medium', '2020-09-10', 18990.3);

INSERT INTO maintenance_plans (machine_id, title, plan_type, interval_days, interval_runtime_hours, checklist, next_due_at)
VALUES
  (1, 'Monthly spindle check', 'calendar', 30, NULL, '{"steps": ["lubrication", "vibration check", "coolant level"]}', NOW() + INTERVAL '5 days'),
  (2, 'Runtime belt inspection', 'runtime', NULL, 250.0, '{"steps": ["belt wear", "alignment", "tension"]}', NOW() + INTERVAL '2 days'),
  (3, 'Weekly pressure calibration', 'calendar', 7, NULL, '{"steps": ["pressure gauge", "safety valve", "leak scan"]}', NOW() + INTERVAL '1 day');

INSERT INTO work_orders (plan_id, machine_id, assigned_to, status, priority, due_at, notes)
VALUES
  (1, 1, 2, 'open', 'high', NOW() + INTERVAL '5 days', 'Prepare vibration tool before service'),
  (3, 3, 3, 'in_progress', 'medium', NOW() + INTERVAL '1 day', 'Calibration in progress');

INSERT INTO failure_logs (machine_id, work_order_id, failure_started_at, failure_ended_at, downtime_hours, root_cause, corrective_action, repair_cost, parts_replaced, created_by)
VALUES
  (2, NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '7 days 20 hours', 4.0, 'Worn conveyor belt', 'Belt replaced and aligned', 8500.00, '{"parts": ["conveyor_belt"]}', 2);

