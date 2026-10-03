/** An error whose message is safe and useful to show to the user (validation, not-allowed, …). */
export class UserError extends Error {
  override name = 'UserError'
}

export const isUserError = (err: unknown): boolean => err instanceof UserError || (err as Error | null)?.name === 'UserError'
