import type { OsName } from './types.js'

export function detectOs(): OsName {
	switch (process.platform) {
		case 'darwin': {
			return 'mac'
		}
		case 'win32': {
			return 'windows'
		}
		case 'linux': {
			return 'linux'
		}
		default: {
			// freebsd/sunos/android: still a usable collector, just an unlabelled box.
			return 'other'
		}
	}
}
