import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`employees\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`full_name\` text,
  	\`profile_picture_id\` integer,
  	\`last_name\` text NOT NULL,
  	\`first_name\` text NOT NULL,
  	\`middle_name\` text,
  	\`extension\` text,
  	\`gender\` text NOT NULL,
  	\`date_of_birth\` text,
  	\`civil_status\` text,
  	\`religion\` text,
  	\`blood_type\` text,
  	\`professional_eligibility\` text,
  	\`contact_number\` text,
  	\`email\` text,
  	\`address\` text,
  	\`educational_attainment\` text,
  	\`courses\` text,
  	\`year_level_earned_units\` text,
  	\`academic_honors\` text,
  	\`employee_id\` text NOT NULL,
  	\`classification\` text NOT NULL,
  	\`employment_status\` text DEFAULT 'Active' NOT NULL,
  	\`station_id\` integer,
  	\`region\` text,
  	\`position\` text,
  	\`nature_of_work\` text,
  	\`driver_license_number\` text,
  	\`date_hired\` text,
  	\`last_day_of_service\` text,
  	\`remarks\` text,
  	\`sss\` text,
  	\`pagibig\` text,
  	\`tin\` text,
  	\`philhealth\` text,
  	\`emergency_contact_name\` text,
  	\`emergency_relationship\` text,
  	\`emergency_contact_number\` text,
  	\`emergency_address\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`profile_picture_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`station_id\`) REFERENCES \`branches\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`employees_full_name_idx\` ON \`employees\` (\`full_name\`);`)
  await db.run(sql`CREATE INDEX \`employees_profile_picture_idx\` ON \`employees\` (\`profile_picture_id\`);`)
  await db.run(sql`CREATE INDEX \`employees_last_name_idx\` ON \`employees\` (\`last_name\`);`)
  await db.run(sql`CREATE INDEX \`employees_first_name_idx\` ON \`employees\` (\`first_name\`);`)
  await db.run(sql`CREATE INDEX \`employees_gender_idx\` ON \`employees\` (\`gender\`);`)
  await db.run(sql`CREATE INDEX \`employees_civil_status_idx\` ON \`employees\` (\`civil_status\`);`)
  await db.run(sql`CREATE INDEX \`employees_email_idx\` ON \`employees\` (\`email\`);`)
  await db.run(sql`CREATE INDEX \`employees_educational_attainment_idx\` ON \`employees\` (\`educational_attainment\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`employees_employee_id_idx\` ON \`employees\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`employees_classification_idx\` ON \`employees\` (\`classification\`);`)
  await db.run(sql`CREATE INDEX \`employees_employment_status_idx\` ON \`employees\` (\`employment_status\`);`)
  await db.run(sql`CREATE INDEX \`employees_station_idx\` ON \`employees\` (\`station_id\`);`)
  await db.run(sql`CREATE INDEX \`employees_region_idx\` ON \`employees\` (\`region\`);`)
  await db.run(sql`CREATE INDEX \`employees_position_idx\` ON \`employees\` (\`position\`);`)
  await db.run(sql`CREATE INDEX \`employees_date_hired_idx\` ON \`employees\` (\`date_hired\`);`)
  await db.run(sql`CREATE INDEX \`employees_sss_idx\` ON \`employees\` (\`sss\`);`)
  await db.run(sql`CREATE INDEX \`employees_pagibig_idx\` ON \`employees\` (\`pagibig\`);`)
  await db.run(sql`CREATE INDEX \`employees_tin_idx\` ON \`employees\` (\`tin\`);`)
  await db.run(sql`CREATE INDEX \`employees_philhealth_idx\` ON \`employees\` (\`philhealth\`);`)
  await db.run(sql`CREATE INDEX \`employees_updated_at_idx\` ON \`employees\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`employees_created_at_idx\` ON \`employees\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`_employees_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_full_name\` text,
  	\`version_profile_picture_id\` integer,
  	\`version_last_name\` text NOT NULL,
  	\`version_first_name\` text NOT NULL,
  	\`version_middle_name\` text,
  	\`version_extension\` text,
  	\`version_gender\` text NOT NULL,
  	\`version_date_of_birth\` text,
  	\`version_civil_status\` text,
  	\`version_religion\` text,
  	\`version_blood_type\` text,
  	\`version_professional_eligibility\` text,
  	\`version_contact_number\` text,
  	\`version_email\` text,
  	\`version_address\` text,
  	\`version_educational_attainment\` text,
  	\`version_courses\` text,
  	\`version_year_level_earned_units\` text,
  	\`version_academic_honors\` text,
  	\`version_employee_id\` text NOT NULL,
  	\`version_classification\` text NOT NULL,
  	\`version_employment_status\` text DEFAULT 'Active' NOT NULL,
  	\`version_station_id\` integer,
  	\`version_region\` text,
  	\`version_position\` text,
  	\`version_nature_of_work\` text,
  	\`version_driver_license_number\` text,
  	\`version_date_hired\` text,
  	\`version_last_day_of_service\` text,
  	\`version_remarks\` text,
  	\`version_sss\` text,
  	\`version_pagibig\` text,
  	\`version_tin\` text,
  	\`version_philhealth\` text,
  	\`version_emergency_contact_name\` text,
  	\`version_emergency_relationship\` text,
  	\`version_emergency_contact_number\` text,
  	\`version_emergency_address\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_profile_picture_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_station_id\`) REFERENCES \`branches\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_employees_v_parent_idx\` ON \`_employees_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_full_name_idx\` ON \`_employees_v\` (\`version_full_name\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_profile_picture_idx\` ON \`_employees_v\` (\`version_profile_picture_id\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_last_name_idx\` ON \`_employees_v\` (\`version_last_name\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_first_name_idx\` ON \`_employees_v\` (\`version_first_name\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_gender_idx\` ON \`_employees_v\` (\`version_gender\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_civil_status_idx\` ON \`_employees_v\` (\`version_civil_status\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_email_idx\` ON \`_employees_v\` (\`version_email\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_educational_attainment_idx\` ON \`_employees_v\` (\`version_educational_attainment\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_employee_id_idx\` ON \`_employees_v\` (\`version_employee_id\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_classification_idx\` ON \`_employees_v\` (\`version_classification\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_employment_status_idx\` ON \`_employees_v\` (\`version_employment_status\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_station_idx\` ON \`_employees_v\` (\`version_station_id\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_region_idx\` ON \`_employees_v\` (\`version_region\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_position_idx\` ON \`_employees_v\` (\`version_position\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_date_hired_idx\` ON \`_employees_v\` (\`version_date_hired\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_sss_idx\` ON \`_employees_v\` (\`version_sss\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_pagibig_idx\` ON \`_employees_v\` (\`version_pagibig\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_tin_idx\` ON \`_employees_v\` (\`version_tin\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_philhealth_idx\` ON \`_employees_v\` (\`version_philhealth\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_updated_at_idx\` ON \`_employees_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_version_version_created_at_idx\` ON \`_employees_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_created_at_idx\` ON \`_employees_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_employees_v_updated_at_idx\` ON \`_employees_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`branches\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`code\` text,
  	\`address\` text,
  	\`region\` text,
  	\`contact_number\` text,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`branches_name_idx\` ON \`branches\` (\`name\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`branches_code_idx\` ON \`branches\` (\`code\`);`)
  await db.run(sql`CREATE INDEX \`branches_updated_at_idx\` ON \`branches\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`branches_created_at_idx\` ON \`branches\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`applications\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`application_id\` text NOT NULL,
  	\`applicant_name\` text NOT NULL,
  	\`position_applied\` text NOT NULL,
  	\`station_id\` integer,
  	\`replacement\` text,
  	\`date_applied\` text NOT NULL,
  	\`start_ojt\` text,
  	\`application_status\` text DEFAULT 'Pending' NOT NULL,
  	\`req_pds\` text DEFAULT 'Pending' NOT NULL,
  	\`req_specimen_sign\` text DEFAULT 'Pending' NOT NULL,
  	\`req_sworn_declaration\` text DEFAULT 'Pending' NOT NULL,
  	\`req_tin_verification\` text DEFAULT 'Pending' NOT NULL,
  	\`req_police_clearance\` text DEFAULT 'Pending' NOT NULL,
  	\`req_medical_lab\` text DEFAULT 'Pending' NOT NULL,
  	\`req_landbank_account\` text DEFAULT 'Pending' NOT NULL,
  	\`req_assumption_of_duty\` text DEFAULT 'Pending' NOT NULL,
  	\`req_driver_license\` text DEFAULT 'Pending' NOT NULL,
  	\`req_or_cr\` text DEFAULT 'Pending' NOT NULL,
  	\`date_submitted\` text,
  	\`requirements_status\` text,
  	\`requirements_missing\` numeric,
  	\`remarks\` text,
  	\`employee_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`station_id\`) REFERENCES \`branches\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`applications_application_id_idx\` ON \`applications\` (\`application_id\`);`)
  await db.run(sql`CREATE INDEX \`applications_applicant_name_idx\` ON \`applications\` (\`applicant_name\`);`)
  await db.run(sql`CREATE INDEX \`applications_position_applied_idx\` ON \`applications\` (\`position_applied\`);`)
  await db.run(sql`CREATE INDEX \`applications_station_idx\` ON \`applications\` (\`station_id\`);`)
  await db.run(sql`CREATE INDEX \`applications_date_applied_idx\` ON \`applications\` (\`date_applied\`);`)
  await db.run(sql`CREATE INDEX \`applications_application_status_idx\` ON \`applications\` (\`application_status\`);`)
  await db.run(sql`CREATE INDEX \`applications_requirements_status_idx\` ON \`applications\` (\`requirements_status\`);`)
  await db.run(sql`CREATE INDEX \`applications_employee_idx\` ON \`applications\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`applications_updated_at_idx\` ON \`applications\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`applications_created_at_idx\` ON \`applications\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`wellness_leaves\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`employee_id\` integer NOT NULL,
  	\`last_name\` text,
  	\`first_name\` text,
  	\`middle_name\` text,
  	\`date_filing\` text NOT NULL,
  	\`inclusive_date_from\` text NOT NULL,
  	\`inclusive_date_to\` text NOT NULL,
  	\`date_received\` text,
  	\`status\` text DEFAULT 'Approved' NOT NULL,
  	\`days\` numeric,
  	\`year\` numeric,
  	\`days_by_year\` text,
  	\`remarks\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`wellness_leaves_employee_idx\` ON \`wellness_leaves\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`wellness_leaves_date_filing_idx\` ON \`wellness_leaves\` (\`date_filing\`);`)
  await db.run(sql`CREATE INDEX \`wellness_leaves_inclusive_date_from_idx\` ON \`wellness_leaves\` (\`inclusive_date_from\`);`)
  await db.run(sql`CREATE INDEX \`wellness_leaves_inclusive_date_to_idx\` ON \`wellness_leaves\` (\`inclusive_date_to\`);`)
  await db.run(sql`CREATE INDEX \`wellness_leaves_status_idx\` ON \`wellness_leaves\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`wellness_leaves_year_idx\` ON \`wellness_leaves\` (\`year\`);`)
  await db.run(sql`CREATE INDEX \`wellness_leaves_updated_at_idx\` ON \`wellness_leaves\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`wellness_leaves_created_at_idx\` ON \`wellness_leaves\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`itr_submissions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`employee_id\` integer NOT NULL,
  	\`year\` numeric NOT NULL,
  	\`last_name\` text,
  	\`first_name\` text,
  	\`middle_name\` text,
  	\`extension\` text,
  	\`date_submitted\` text,
  	\`date_received\` text,
  	\`remarks\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`itr_submissions_employee_idx\` ON \`itr_submissions\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`itr_submissions_year_idx\` ON \`itr_submissions\` (\`year\`);`)
  await db.run(sql`CREATE INDEX \`itr_submissions_updated_at_idx\` ON \`itr_submissions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`itr_submissions_created_at_idx\` ON \`itr_submissions\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`employee_year_idx\` ON \`itr_submissions\` (\`employee_id\`,\`year\`);`)
  await db.run(sql`CREATE TABLE \`sworn_declarations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`employee_id\` integer NOT NULL,
  	\`year\` numeric NOT NULL,
  	\`last_name\` text,
  	\`first_name\` text,
  	\`middle_name\` text,
  	\`station\` text,
  	\`job_title\` text,
  	\`tin\` text,
  	\`date_submitted\` text,
  	\`date_received\` text,
  	\`remarks\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`sworn_declarations_employee_idx\` ON \`sworn_declarations\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`sworn_declarations_year_idx\` ON \`sworn_declarations\` (\`year\`);`)
  await db.run(sql`CREATE INDEX \`sworn_declarations_updated_at_idx\` ON \`sworn_declarations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`sworn_declarations_created_at_idx\` ON \`sworn_declarations\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`employee_year_1_idx\` ON \`sworn_declarations\` (\`employee_id\`,\`year\`);`)
  await db.run(sql`CREATE TABLE \`pds_submissions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`employee_id\` integer NOT NULL,
  	\`year\` numeric NOT NULL,
  	\`last_name\` text,
  	\`first_name\` text,
  	\`middle_name\` text,
  	\`station\` text,
  	\`job_title\` text,
  	\`date_submitted\` text,
  	\`date_received\` text,
  	\`remarks\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`pds_submissions_employee_idx\` ON \`pds_submissions\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`pds_submissions_year_idx\` ON \`pds_submissions\` (\`year\`);`)
  await db.run(sql`CREATE INDEX \`pds_submissions_updated_at_idx\` ON \`pds_submissions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`pds_submissions_created_at_idx\` ON \`pds_submissions\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`employee_year_2_idx\` ON \`pds_submissions\` (\`employee_id\`,\`year\`);`)
  await db.run(sql`CREATE TABLE \`ipcr_ratings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`employee_id\` integer NOT NULL,
  	\`year\` numeric NOT NULL,
  	\`last_name\` text,
  	\`first_name\` text,
  	\`middle_name\` text,
  	\`station\` text,
  	\`job_title\` text,
  	\`rating_period\` text NOT NULL,
  	\`period_from\` text,
  	\`period_to\` text,
  	\`rating\` numeric,
  	\`adjectival_rating\` text,
  	\`date_submitted\` text,
  	\`date_received\` text,
  	\`remarks\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`ipcr_ratings_employee_idx\` ON \`ipcr_ratings\` (\`employee_id\`);`)
  await db.run(sql`CREATE INDEX \`ipcr_ratings_year_idx\` ON \`ipcr_ratings\` (\`year\`);`)
  await db.run(sql`CREATE INDEX \`ipcr_ratings_updated_at_idx\` ON \`ipcr_ratings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`ipcr_ratings_created_at_idx\` ON \`ipcr_ratings\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`employee_year_ratingPeriod_idx\` ON \`ipcr_ratings\` (\`employee_id\`,\`year\`,\`rating_period\`);`)
  await db.run(sql`CREATE TABLE \`holidays\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`date\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`type\` text DEFAULT 'Regular Holiday',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`holidays_date_idx\` ON \`holidays\` (\`date\`);`)
  await db.run(sql`CREATE INDEX \`holidays_updated_at_idx\` ON \`holidays\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`holidays_created_at_idx\` ON \`holidays\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`users_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`role\` text DEFAULT 'hr-staff' NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
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
  await db.run(sql`CREATE INDEX \`users_status_idx\` ON \`users\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`alt\` text,
  	\`is_public\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`audit_logs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer,
  	\`user_name\` text,
  	\`action\` text NOT NULL,
  	\`collection_slug\` text NOT NULL,
  	\`doc_id\` text,
  	\`doc_label\` text,
  	\`changes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`audit_logs_user_idx\` ON \`audit_logs\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`audit_logs_action_idx\` ON \`audit_logs\` (\`action\`);`)
  await db.run(sql`CREATE INDEX \`audit_logs_collection_slug_idx\` ON \`audit_logs\` (\`collection_slug\`);`)
  await db.run(sql`CREATE INDEX \`audit_logs_doc_id_idx\` ON \`audit_logs\` (\`doc_id\`);`)
  await db.run(sql`CREATE INDEX \`audit_logs_updated_at_idx\` ON \`audit_logs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`audit_logs_created_at_idx\` ON \`audit_logs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`import_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`file_name\` text NOT NULL,
  	\`module\` text NOT NULL,
  	\`status\` text NOT NULL,
  	\`created\` numeric,
  	\`updated\` numeric,
  	\`unchanged\` numeric,
  	\`error\` text,
  	\`user_id\` integer,
  	\`user_name\` text,
  	\`archive_file\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`import_jobs_user_idx\` ON \`import_jobs\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`import_jobs_updated_at_idx\` ON \`import_jobs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`import_jobs_created_at_idx\` ON \`import_jobs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
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
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`site_settings\` (
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
  await db.run(sql`CREATE INDEX \`site_settings_logo_idx\` ON \`site_settings\` (\`logo_id\`);`)
  await db.run(sql`CREATE TABLE \`leave_settings_year_overrides\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`year\` numeric NOT NULL,
  	\`allowance\` numeric NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`leave_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`leave_settings_year_overrides_order_idx\` ON \`leave_settings_year_overrides\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`leave_settings_year_overrides_parent_id_idx\` ON \`leave_settings_year_overrides\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`leave_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`annual_allowance\` numeric DEFAULT 5 NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`employees\`;`)
  await db.run(sql`DROP TABLE \`_employees_v\`;`)
  await db.run(sql`DROP TABLE \`branches\`;`)
  await db.run(sql`DROP TABLE \`applications\`;`)
  await db.run(sql`DROP TABLE \`wellness_leaves\`;`)
  await db.run(sql`DROP TABLE \`itr_submissions\`;`)
  await db.run(sql`DROP TABLE \`sworn_declarations\`;`)
  await db.run(sql`DROP TABLE \`pds_submissions\`;`)
  await db.run(sql`DROP TABLE \`ipcr_ratings\`;`)
  await db.run(sql`DROP TABLE \`holidays\`;`)
  await db.run(sql`DROP TABLE \`users_sessions\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`DROP TABLE \`audit_logs\`;`)
  await db.run(sql`DROP TABLE \`import_jobs\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
  await db.run(sql`DROP TABLE \`site_settings\`;`)
  await db.run(sql`DROP TABLE \`leave_settings_year_overrides\`;`)
  await db.run(sql`DROP TABLE \`leave_settings\`;`)
}
