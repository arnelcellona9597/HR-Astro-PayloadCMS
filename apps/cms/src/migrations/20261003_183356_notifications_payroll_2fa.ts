import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`payroll_periods\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`code\` text NOT NULL,
  	\`period_start\` text NOT NULL,
  	\`period_end\` text NOT NULL,
  	\`pay_date\` text NOT NULL,
  	\`status\` text DEFAULT 'Draft' NOT NULL,
  	\`released_at\` text,
  	\`released_by_id\` integer,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`released_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payroll_periods_code_idx\` ON \`payroll_periods\` (\`code\`);`)
  await db.run(sql`CREATE INDEX \`payroll_periods_period_start_idx\` ON \`payroll_periods\` (\`period_start\`);`)
  await db.run(sql`CREATE INDEX \`payroll_periods_status_idx\` ON \`payroll_periods\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`payroll_periods_released_by_idx\` ON \`payroll_periods\` (\`released_by_id\`);`)
  await db.run(sql`CREATE INDEX \`payroll_periods_updated_at_idx\` ON \`payroll_periods\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payroll_periods_created_at_idx\` ON \`payroll_periods\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payslips_earnings\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`amount\` numeric NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payslips\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payslips_earnings_order_idx\` ON \`payslips_earnings\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`payslips_earnings_parent_id_idx\` ON \`payslips_earnings\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`payslips_deductions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`amount\` numeric NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payslips\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payslips_deductions_order_idx\` ON \`payslips_deductions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`payslips_deductions_parent_id_idx\` ON \`payslips_deductions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`payslips\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`period_id\` integer NOT NULL,
  	\`employee_id\` integer NOT NULL,
  	\`full_name\` text,
  	\`employee_code\` text,
  	\`position\` text,
  	\`station\` text,
  	\`classification\` text,
  	\`tin\` text,
  	\`sss\` text,
  	\`philhealth\` text,
  	\`pagibig\` text,
  	\`gross_pay\` numeric,
  	\`total_deductions\` numeric,
  	\`net_pay\` numeric,
  	\`remarks\` text,
  	\`corrected_after_release\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`period_id\`) REFERENCES \`payroll_periods\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`payslips_period_idx\` ON \`payslips\` (\`period_id\`);`)
  await db.run(sql`CREATE INDEX \`payslips_employee_idx\` ON \`payslips\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`payslips_updated_at_idx\` ON \`payslips\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payslips_created_at_idx\` ON \`payslips\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`period_employee_idx\` ON \`payslips\` (\`period_id\`,\`employee_id\`);`)
  await db.run(sql`CREATE TABLE \`messages\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`subject\` text NOT NULL,
  	\`body\` text NOT NULL,
  	\`category\` text DEFAULT 'General',
  	\`audience\` text,
  	\`automatic\` integer DEFAULT false,
  	\`related_collection\` text,
  	\`related_id\` text,
  	\`sent_by_id\` integer,
  	\`sent_by_name\` text,
  	\`status\` text DEFAULT 'queued' NOT NULL,
  	\`total\` numeric DEFAULT 0,
  	\`sent\` numeric DEFAULT 0,
  	\`failed\` numeric DEFAULT 0,
  	\`skipped\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`sent_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`messages_category_idx\` ON \`messages\` (\`category\`);`)
  await db.run(sql`CREATE INDEX \`messages_automatic_idx\` ON \`messages\` (\`automatic\`);`)
  await db.run(sql`CREATE INDEX \`messages_sent_by_idx\` ON \`messages\` (\`sent_by_id\`);`)
  await db.run(sql`CREATE INDEX \`messages_status_idx\` ON \`messages\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`messages_updated_at_idx\` ON \`messages\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`messages_created_at_idx\` ON \`messages\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`messages_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`messages_rels_order_idx\` ON \`messages_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`messages_rels_parent_idx\` ON \`messages_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`messages_rels_path_idx\` ON \`messages_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`messages_rels_media_id_idx\` ON \`messages_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE TABLE \`message_recipients\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`message_id\` integer NOT NULL,
  	\`name\` text,
  	\`email\` text,
  	\`employee_id\` integer,
  	\`user_id\` integer,
  	\`subject\` text,
  	\`body\` text,
  	\`payslip_id\` integer,
  	\`status\` text DEFAULT 'queued' NOT NULL,
  	\`attempts\` numeric DEFAULT 0,
  	\`next_attempt_at\` text,
  	\`error\` text,
  	\`sent_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`message_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`payslip_id\`) REFERENCES \`payslips\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`message_recipients_message_idx\` ON \`message_recipients\` (\`message_id\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_email_idx\` ON \`message_recipients\` (\`email\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_employee_idx\` ON \`message_recipients\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_user_idx\` ON \`message_recipients\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_payslip_idx\` ON \`message_recipients\` (\`payslip_id\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_status_idx\` ON \`message_recipients\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_next_attempt_at_idx\` ON \`message_recipients\` (\`next_attempt_at\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_sent_at_idx\` ON \`message_recipients\` (\`sent_at\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_updated_at_idx\` ON \`message_recipients\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`message_recipients_created_at_idx\` ON \`message_recipients\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`email_templates\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`key\` text,
  	\`category\` text DEFAULT 'General' NOT NULL,
  	\`subject\` text NOT NULL,
  	\`body\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`email_templates_name_idx\` ON \`email_templates\` (\`name\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`email_templates_key_idx\` ON \`email_templates\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`email_templates_updated_at_idx\` ON \`email_templates\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`email_templates_created_at_idx\` ON \`email_templates\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`notifications\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer NOT NULL,
  	\`title\` text NOT NULL,
  	\`body\` text,
  	\`link\` text,
  	\`read_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`notifications_user_idx\` ON \`notifications\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`notifications_read_at_idx\` ON \`notifications\` (\`read_at\`);`)
  await db.run(sql`CREATE INDEX \`notifications_updated_at_idx\` ON \`notifications\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`notifications_created_at_idx\` ON \`notifications\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`login_challenges\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`purpose\` text NOT NULL,
  	\`user_id\` integer NOT NULL,
  	\`code_hash\` text NOT NULL,
  	\`token_enc\` text,
  	\`token_exp\` numeric,
  	\`expires_at\` text NOT NULL,
  	\`attempts\` numeric DEFAULT 0,
  	\`send_count\` numeric DEFAULT 1,
  	\`last_sent_at\` text,
  	\`ip\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`login_challenges_key_idx\` ON \`login_challenges\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`login_challenges_user_idx\` ON \`login_challenges\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`login_challenges_expires_at_idx\` ON \`login_challenges\` (\`expires_at\`);`)
  await db.run(sql`CREATE INDEX \`login_challenges_updated_at_idx\` ON \`login_challenges\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`login_challenges_created_at_idx\` ON \`login_challenges\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`notification_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`leave_filed_to_employee\` integer DEFAULT true,
  	\`leave_status_to_employee\` integer DEFAULT true,
  	\`payroll_released_to_employee\` integer DEFAULT true,
  	\`registration_to_admins\` integer DEFAULT true,
  	\`hourly_limit\` numeric DEFAULT 100 NOT NULL,
  	\`reply_to\` text,
  	\`footer\` text DEFAULT 'This is an automated message from the HR office.',
  	\`queue_key\` text,
  	\`smtp_last_error\` text,
  	\`smtp_last_error_at\` text,
  	\`smtp_last_ok_at\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`payslip_settings_earning_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payslip_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payslip_settings_earning_items_order_idx\` ON \`payslip_settings_earning_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`payslip_settings_earning_items_parent_id_idx\` ON \`payslip_settings_earning_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`payslip_settings_deduction_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payslip_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payslip_settings_deduction_items_order_idx\` ON \`payslip_settings_deduction_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`payslip_settings_deduction_items_parent_id_idx\` ON \`payslip_settings_deduction_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`payslip_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text DEFAULT 'PAYSLIP' NOT NULL,
  	\`company_name\` text,
  	\`address_lines\` text,
  	\`show_logo\` integer DEFAULT true,
  	\`currency_symbol\` text DEFAULT '₱',
  	\`show_employee_id\` integer DEFAULT true,
  	\`show_position\` integer DEFAULT true,
  	\`show_station\` integer DEFAULT true,
  	\`show_classification\` integer DEFAULT true,
  	\`show_tin\` integer DEFAULT false,
  	\`show_sss\` integer DEFAULT false,
  	\`show_philhealth\` integer DEFAULT false,
  	\`show_pagibig\` integer DEFAULT false,
  	\`prepared_by_name\` text,
  	\`prepared_by_title\` text DEFAULT 'HR Officer',
  	\`certified_by_name\` text,
  	\`certified_by_title\` text DEFAULT 'Head of Office',
  	\`footer_note\` text DEFAULT 'This is a system-generated payslip. Please report any discrepancy to the HR office.',
  	\`paper_size\` text DEFAULT 'A4' NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`ALTER TABLE \`users\` ADD \`email_verified\` integer DEFAULT false;`)
  // Two roles now: System Admin and HR Staff. Existing accounts are already verified.
  await db.run(sql`UPDATE \`users\` SET \`role\` = 'system-admin' WHERE \`role\` = 'super-admin';`)
  await db.run(sql`UPDATE \`users\` SET \`role\` = 'hr-staff' WHERE \`role\` = 'hr-admin';`)
  await db.run(sql`UPDATE \`users\` SET \`email_verified\` = 1 WHERE \`status\` = 'approved';`)
  await db.run(sql`CREATE INDEX \`users_email_verified_idx\` ON \`users\` (\`email_verified\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`payroll_periods_id\` integer REFERENCES payroll_periods(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`payslips_id\` integer REFERENCES payslips(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`messages_id\` integer REFERENCES messages(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`message_recipients_id\` integer REFERENCES message_recipients(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`email_templates_id\` integer REFERENCES email_templates(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`notifications_id\` integer REFERENCES notifications(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`login_challenges_id\` integer REFERENCES login_challenges(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payroll_periods_id_idx\` ON \`payload_locked_documents_rels\` (\`payroll_periods_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payslips_id_idx\` ON \`payload_locked_documents_rels\` (\`payslips_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_messages_id_idx\` ON \`payload_locked_documents_rels\` (\`messages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_message_recipients_id_idx\` ON \`payload_locked_documents_rels\` (\`message_recipients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_email_templates_id_idx\` ON \`payload_locked_documents_rels\` (\`email_templates_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_notifications_id_idx\` ON \`payload_locked_documents_rels\` (\`notifications_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_login_challenges_id_idx\` ON \`payload_locked_documents_rels\` (\`login_challenges_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`payroll_periods\`;`)
  await db.run(sql`DROP TABLE \`payslips_earnings\`;`)
  await db.run(sql`DROP TABLE \`payslips_deductions\`;`)
  await db.run(sql`DROP TABLE \`payslips\`;`)
  await db.run(sql`DROP TABLE \`messages\`;`)
  await db.run(sql`DROP TABLE \`messages_rels\`;`)
  await db.run(sql`DROP TABLE \`message_recipients\`;`)
  await db.run(sql`DROP TABLE \`email_templates\`;`)
  await db.run(sql`DROP TABLE \`notifications\`;`)
  await db.run(sql`DROP TABLE \`login_challenges\`;`)
  await db.run(sql`DROP TABLE \`notification_settings\`;`)
  await db.run(sql`DROP TABLE \`payslip_settings_earning_items\`;`)
  await db.run(sql`DROP TABLE \`payslip_settings_deduction_items\`;`)
  await db.run(sql`DROP TABLE \`payslip_settings\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`employees_id\` integer,
  	\`branches_id\` integer,
  	\`applications_id\` integer,
  	\`wellness_leaves_id\` integer,
  	\`itr_submissions_id\` integer,
  	\`sworn_declarations_id\` integer,
  	\`pds_submissions_id\` integer,
  	\`ipcr_ratings_id\` integer,
  	\`holidays_id\` integer,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`audit_logs_id\` integer,
  	\`import_jobs_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`employees_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`branches_id\`) REFERENCES \`branches\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`applications_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`wellness_leaves_id\`) REFERENCES \`wellness_leaves\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`itr_submissions_id\`) REFERENCES \`itr_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`sworn_declarations_id\`) REFERENCES \`sworn_declarations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pds_submissions_id\`) REFERENCES \`pds_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`ipcr_ratings_id\`) REFERENCES \`ipcr_ratings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`holidays_id\`) REFERENCES \`holidays\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audit_logs_id\`) REFERENCES \`audit_logs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`import_jobs_id\`) REFERENCES \`import_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "employees_id", "branches_id", "applications_id", "wellness_leaves_id", "itr_submissions_id", "sworn_declarations_id", "pds_submissions_id", "ipcr_ratings_id", "holidays_id", "users_id", "media_id", "audit_logs_id", "import_jobs_id") SELECT "id", "order", "parent_id", "path", "employees_id", "branches_id", "applications_id", "wellness_leaves_id", "itr_submissions_id", "sworn_declarations_id", "pds_submissions_id", "ipcr_ratings_id", "holidays_id", "users_id", "media_id", "audit_logs_id", "import_jobs_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_employees_id_idx\` ON \`payload_locked_documents_rels\` (\`employees_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_branches_id_idx\` ON \`payload_locked_documents_rels\` (\`branches_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_applications_id_idx\` ON \`payload_locked_documents_rels\` (\`applications_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_wellness_leaves_id_idx\` ON \`payload_locked_documents_rels\` (\`wellness_leaves_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_itr_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`itr_submissions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_sworn_declarations_id_idx\` ON \`payload_locked_documents_rels\` (\`sworn_declarations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pds_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`pds_submissions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_ipcr_ratings_id_idx\` ON \`payload_locked_documents_rels\` (\`ipcr_ratings_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_holidays_id_idx\` ON \`payload_locked_documents_rels\` (\`holidays_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_audit_logs_id_idx\` ON \`payload_locked_documents_rels\` (\`audit_logs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_import_jobs_id_idx\` ON \`payload_locked_documents_rels\` (\`import_jobs_id\`);`)
  await db.run(sql`DROP INDEX \`users_email_verified_idx\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`email_verified\`;`)
}
