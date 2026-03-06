"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE users (
          id BIGSERIAL PRIMARY KEY,
          full_name VARCHAR(120) NOT NULL,
          email VARCHAR(180) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(40) NOT NULL CHECK (role IN ('admin','maintenance_manager','technician','viewer')),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE plants (
          id BIGSERIAL PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          location VARCHAR(200),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE machines (
          id BIGSERIAL PRIMARY KEY,
          plant_id BIGINT REFERENCES plants(id),
          machine_code VARCHAR(80) UNIQUE NOT NULL,
          name VARCHAR(150) NOT NULL,
          machine_type VARCHAR(100),
          criticality VARCHAR(20) NOT NULL CHECK (criticality IN ('low','medium','high','critical')),
          install_date DATE,
          status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','retired')),
          runtime_hours_total NUMERIC(12,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE maintenance_plans (
          id BIGSERIAL PRIMARY KEY,
          machine_id BIGINT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
          title VARCHAR(160) NOT NULL,
          plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('calendar','runtime')),
          interval_days INT,
          interval_runtime_hours NUMERIC(10,2),
          checklist JSONB,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          last_completed_at TIMESTAMP,
          next_due_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE work_orders (
          id BIGSERIAL PRIMARY KEY,
          plan_id BIGINT REFERENCES maintenance_plans(id) ON DELETE SET NULL,
          machine_id BIGINT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
          assigned_to BIGINT REFERENCES users(id),
          status VARCHAR(20) NOT NULL CHECK (status IN ('open','in_progress','done','overdue','cancelled')),
          priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
          due_at TIMESTAMP,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          notes TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE failure_logs (
          id BIGSERIAL PRIMARY KEY,
          machine_id BIGINT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
          work_order_id BIGINT REFERENCES work_orders(id) ON DELETE SET NULL,
          failure_started_at TIMESTAMP NOT NULL,
          failure_ended_at TIMESTAMP,
          downtime_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
          root_cause VARCHAR(200),
          corrective_action TEXT,
          repair_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
          parts_replaced JSONB,
          created_by BIGINT REFERENCES users(id),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_machines_plant_id ON machines(plant_id);
        CREATE INDEX idx_maintenance_plans_machine_id ON maintenance_plans(machine_id);
        CREATE INDEX idx_work_orders_machine_id ON work_orders(machine_id);
        CREATE INDEX idx_work_orders_status ON work_orders(status);
        CREATE INDEX idx_failure_logs_machine_id ON failure_logs(machine_id);
        CREATE INDEX idx_failure_logs_failure_started_at ON failure_logs(failure_started_at);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS failure_logs;
        DROP TABLE IF EXISTS work_orders;
        DROP TABLE IF EXISTS maintenance_plans;
        DROP TABLE IF EXISTS machines;
        DROP TABLE IF EXISTS plants;
        DROP TABLE IF EXISTS users;
        """
    )
