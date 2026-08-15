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
			return process.platform
		}
	}
}
