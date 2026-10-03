/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    payload: import('payload').Payload
    user: import('@hr/cms/types').User | null
    settings: import('@hr/cms/types').SiteSetting
    theme: 'light' | 'dark' | 'system'
  }
}
