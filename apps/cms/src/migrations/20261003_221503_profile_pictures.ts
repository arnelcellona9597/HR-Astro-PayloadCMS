import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_site_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`company_name\` text DEFAULT 'HR Management System' NOT NULL,
  	\`tagline\` text,
  	\`logo_id\` integer,
  	\`palette_primary\` text DEFAULT '#00539b' NOT NULL,
  	\`palette_secondary\` text DEFAULT '#777777' NOT NULL,
  	\`palette_accent\` text DEFAULT '#ffc72c' NOT NULL,
  	\`palette_success\` text DEFAULT '#15803d' NOT NULL,
  	\`palette_warning\` text DEFAULT '#ffc72c' NOT NULL,
  	\`palette_danger\` text DEFAULT '#c8102e' NOT NULL,
  	\`default_theme\` text DEFAULT 'system' NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_site_settings\`("id", "company_name", "tagline", "logo_id", "palette_primary", "palette_secondary", "palette_accent", "palette_success", "palette_warning", "palette_danger", "default_theme", "updated_at", "created_at") SELECT "id", "company_name", "tagline", "logo_id", "palette_primary", "palette_secondary", "palette_accent", "palette_success", "palette_warning", "palette_danger", "default_theme", "updated_at", "created_at" FROM \`site_settings\`;`)
  await db.run(sql`DROP TABLE \`site_settings\`;`)
  await db.run(sql`ALTER TABLE \`__new_site_settings\` RENAME TO \`site_settings\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`site_settings_logo_idx\` ON \`site_settings\` (\`logo_id\`);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`avatar_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`)
  await db.run(sql`CREATE INDEX \`users_avatar_idx\` ON \`users\` (\`avatar_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`role\` text DEFAULT 'hr-staff' NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`email_verified\` integer DEFAULT false,
  	\`approved_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`reset_password_requested_at\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_users\`("id", "name", "role", "status", "email_verified", "approved_at", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "reset_password_requested_at", "login_attempts", "lock_until") SELECT "id", "name", "role", "status", "email_verified", "approved_at", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "reset_password_requested_at", "login_attempts", "lock_until" FROM \`users\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`users_status_idx\` ON \`users\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`users_email_verified_idx\` ON \`users\` (\`email_verified\`);`)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`__new_site_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`company_name\` text DEFAULT 'HR Management System' NOT NULL,
  	\`tagline\` text,
  	\`logo_id\` integer,
  	\`palette_primary\` text DEFAULT '#1d4ed8' NOT NULL,
  	\`palette_secondary\` text DEFAULT '#475569' NOT NULL,
  	\`palette_accent\` text DEFAULT '#0d9488' NOT NULL,
  	\`palette_success\` text DEFAULT '#15803d' NOT NULL,
  	\`palette_warning\` text DEFAULT '#b45309' NOT NULL,
  	\`palette_danger\` text DEFAULT '#b91c1c' NOT NULL,
  	\`default_theme\` text DEFAULT 'system' NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_site_settings\`("id", "company_name", "tagline", "logo_id", "palette_primary", "palette_secondary", "palette_accent", "palette_success", "palette_warning", "palette_danger", "default_theme", "updated_at", "created_at") SELECT "id", "company_name", "tagline", "logo_id", "palette_primary", "palette_secondary", "palette_accent", "palette_success", "palette_warning", "palette_danger", "default_theme", "updated_at", "created_at" FROM \`site_settings\`;`)
  await db.run(sql`DROP TABLE \`site_settings\`;`)
  await db.run(sql`ALTER TABLE \`__new_site_settings\` RENAME TO \`site_settings\`;`)
  await db.run(sql`CREATE INDEX \`site_settings_logo_idx\` ON \`site_settings\` (\`logo_id\`);`)
}
