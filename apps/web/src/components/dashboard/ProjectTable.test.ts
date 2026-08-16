import { describe, expect, it } from 'vitest'
import { splitPath } from './ProjectTable'

describe(splitPath, () => {
	it('folds the home directory on every OS', () => {
		expect(splitPath('/Users/artur/Developer/adescom/vapp')).toStrictEqual({
			name: 'vapp',
			parent: '~/Developer/adescom',
		})
		expect(splitPath('/home/artur/coding/classics')).toStrictEqual({ name: 'classics', parent: '~/coding' })
		expect(splitPath('C:\\Users\\Mycka\\Documents\\sub24\\sub24')).toStrictEqual({
			name: 'sub24',
			parent: '~\\Documents\\sub24',
		})
	})

	it('keeps the drive on non-home Windows paths', () => {
		expect(splitPath('E:\\New_Love_Religion\\Projects\\APIconsole')).toStrictEqual({
			name: 'APIconsole',
			parent: 'E:\\New_Love_Religion\\Projects',
		})
		expect(splitPath('D:\\repo')).toStrictEqual({ name: 'repo', parent: 'D:' })
	})

	it('buckets logs without a working directory', () => {
		expect(splitPath(null).name).toBe('No project')
	})
})
