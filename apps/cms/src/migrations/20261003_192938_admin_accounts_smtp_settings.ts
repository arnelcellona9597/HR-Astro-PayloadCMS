import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`smtp_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`host\` text,
  	\`port\` numeric DEFAULT 465,
  	\`security\` text DEFAULT 'ssl',
  	\`username\` text,
  	\`password_enc\` text,
  	\`password_set\` integer DEFAULT false,
  	\`from_address\` text,
  	\`from_name\` text DEFAULT 'HR System',
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`smtp_settings\`;`)
}
