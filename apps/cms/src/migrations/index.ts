import * as migration_20261003_174213_initial from './20261003_174213_initial';
import * as migration_20261003_183356_notifications_payroll_2fa from './20261003_183356_notifications_payroll_2fa';
import * as migration_20261003_192938_admin_accounts_smtp_settings from './20261003_192938_admin_accounts_smtp_settings';
import * as migration_20261003_221503_profile_pictures from './20261003_221503_profile_pictures';
import * as migration_20261003_224627_employment_certificates from './20261003_224627_employment_certificates';

export const migrations = [
  {
    up: migration_20261003_174213_initial.up,
    down: migration_20261003_174213_initial.down,
    name: '20261003_174213_initial',
  },
  {
    up: migration_20261003_183356_notifications_payroll_2fa.up,
    down: migration_20261003_183356_notifications_payroll_2fa.down,
    name: '20261003_183356_notifications_payroll_2fa',
  },
  {
    up: migration_20261003_192938_admin_accounts_smtp_settings.up,
    down: migration_20261003_192938_admin_accounts_smtp_settings.down,
    name: '20261003_192938_admin_accounts_smtp_settings',
  },
  {
    up: migration_20261003_221503_profile_pictures.up,
    down: migration_20261003_221503_profile_pictures.down,
    name: '20261003_221503_profile_pictures',
  },
  {
    up: migration_20261003_224627_employment_certificates.up,
    down: migration_20261003_224627_employment_certificates.down,
    name: '20261003_224627_employment_certificates'
  },
];
