/** Whether new accounts may be created. Toggle via ALLOW_SIGNUP=false.
 *  Default: enabled (any value other than "false" allows signup). */
export function signupEnabled(): boolean {
	return process.env.ALLOW_SIGNUP !== 'false'
}
