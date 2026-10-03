import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`certificate_templates\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`prefix\` text DEFAULT 'COE' NOT NULL,
  	\`paper_size\` text DEFAULT 'A4' NOT NULL,
  	\`font\` text DEFAULT 'serif' NOT NULL,
  	\`margin\` text DEFAULT 'normal' NOT NULL,
  	\`blocks\` text NOT NULL,
  	\`active\` integer DEFAULT true,
  	\`sort_order\` numeric DEFAULT 100,
  	\`key\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`certificate_templates_name_idx\` ON \`certificate_templates\` (\`name\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`certificate_templates_key_idx\` ON \`certificate_templates\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`certificate_templates_updated_at_idx\` ON \`certificate_templates\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`certificate_templates_created_at_idx\` ON \`certificate_templates\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`certificates\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`control_number\` text,
  	\`template_id\` integer NOT NULL,
  	\`employee_id\` integer NOT NULL,
  	\`purpose\` text,
  	\`issued_date\` text NOT NULL,
  	\`template_name\` text,
  	\`employee_name\` text,
  	\`content\` text,
  	\`issued_by_id\` integer,
  	\`issued_by_name\` text,
  	\`status\` text DEFAULT 'Valid' NOT NULL,
  	\`void_reason\` text,
  	\`voided_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`template_id\`) REFERENCES \`certificate_templates\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`issued_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`certificates_control_number_idx\` ON \`certificates\` (\`control_number\`);`)
  await db.run(sql`CREATE INDEX \`certificates_template_idx\` ON \`certificates\` (\`template_id\`);`)
  await db.run(sql`CREATE INDEX \`certificates_employee_idx\` ON \`certificates\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`certificates_employee_name_idx\` ON \`certificates\` (\`employee_name\`);`)
  await db.run(sql`CREATE INDEX \`certificates_issued_by_idx\` ON \`certificates\` (\`issued_by_id\`);`)
  await db.run(sql`CREATE INDEX \`certificates_status_idx\` ON \`certificates\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`certificates_updated_at_idx\` ON \`certificates\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`certificates_created_at_idx\` ON \`certificates\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`certificate_templates_id\` integer REFERENCES certificate_templates(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`certificates_id\` integer REFERENCES certificates(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_certificate_templates_id_idx\` ON \`payload_locked_documents_rels\` (\`certificate_templates_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_certificates_id_idx\` ON \`payload_locked_documents_rels\` (\`certificates_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`certificate_templates\`;`)
  await db.run(sql`DROP TABLE \`certificates\`;`)
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
  	\`payroll_periods_id\` integer,
  	\`payslips_id\` integer,
  	\`messages_id\` integer,
  	\`message_recipients_id\` integer,
  	\`email_templates_id\` integer,
  	\`notifications_id\` integer,
  	\`holidays_id\` integer,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`audit_logs_id\` integer,
  	\`import_jobs_id\` integer,
  	\`login_challenges_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`employees_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`branches_id\`) REFERENCES \`branches\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`applications_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`wellness_leaves_id\`) REFERENCES \`wellness_leaves\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`itr_submissions_id\`) REFERENCES \`itr_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`sworn_declarations_id\`) REFERENCES \`sworn_declarations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pds_submissions_id\`) REFERENCES \`pds_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`ipcr_ratings_id\`) REFERENCES \`ipcr_ratings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payroll_periods_id\`) REFERENCES \`payroll_periods\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payslips_id\`) REFERENCES \`payslips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`messages_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`message_recipients_id\`) REFERENCES \`message_recipients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`email_templates_id\`) REFERENCES \`email_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`notifications_id\`) REFERENCES \`notifications\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`holidays_id\`) REFERENCES \`holidays\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audit_logs_id\`) REFERENCES \`audit_logs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`import_jobs_id\`) REFERENCES \`import_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`login_challenges_id\`) REFERENCES \`login_challenges\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "employees_id", "branches_id", "applications_id", "wellness_leaves_id", "itr_submissions_id", "sworn_declarations_id", "pds_submissions_id", "ipcr_ratings_id", "payroll_periods_id", "payslips_id", "messages_id", "message_recipients_id", "email_templates_id", "notifications_id", "holidays_id", "users_id", "media_id", "audit_logs_id", "import_jobs_id", "login_challenges_id") SELECT "id", "order", "parent_id", "path", "employees_id", "branches_id", "applications_id", "wellness_leaves_id", "itr_submissions_id", "sworn_declarations_id", "pds_submissions_id", "ipcr_ratings_id", "payroll_periods_id", "payslips_id", "messages_id", "message_recipients_id", "email_templates_id", "notifications_id", "holidays_id", "users_id", "media_id", "audit_logs_id", "import_jobs_id", "login_challenges_id" FROM \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payroll_periods_id_idx\` ON \`payload_locked_documents_rels\` (\`payroll_periods_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payslips_id_idx\` ON \`payload_locked_documents_rels\` (\`payslips_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_messages_id_idx\` ON \`payload_locked_documents_rels\` (\`messages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_message_recipients_id_idx\` ON \`payload_locked_documents_rels\` (\`message_recipients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_email_templates_id_idx\` ON \`payload_locked_documents_rels\` (\`email_templates_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_notifications_id_idx\` ON \`payload_locked_documents_rels\` (\`notifications_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_holidays_id_idx\` ON \`payload_locked_documents_rels\` (\`holidays_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_audit_logs_id_idx\` ON \`payload_locked_documents_rels\` (\`audit_logs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_import_jobs_id_idx\` ON \`payload_locked_documents_rels\` (\`import_jobs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_login_challenges_id_idx\` ON \`payload_locked_documents_rels\` (\`login_challenges_id\`);`)
}
