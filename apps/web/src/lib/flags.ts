/** Whether new accounts may be created. Toggle via ALLOW_SIGNUP=false.
 *  Default: enabled (any value other than "false" allows signup). */
export function signupEnabled(): boolean {
	return process.env.ALLOW_SIGNUP !== 'false'
}

/** Who may open the admin panel, as a comma-separated ADMIN_EMAILS list.
 *  Deliberately env-only rather than a role column: a compromised session can
 *  never grant itself admin, and there is no first-admin bootstrap problem.
 *  Unset means nobody, i.e. the panel is off. */
export function isAdminEmail(email: string): boolean {
	return (process.env.ADMIN_EMAILS ?? '')
		.split(',')
		.some(entry => entry.trim().toLowerCase() === email.toLowerCase() && entry.trim() !== '')
}
