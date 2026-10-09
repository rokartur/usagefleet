import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { parseLine } from './parser.js'
import type { FileState, UsageRecord, UsageSource } from './types.js'
import { dim, line, tilde, yellow } from './ui.js'

/** Max bytes read from a single file per cycle (bounds memory on huge backlogs). */
const MAX_READ = 16 * 1024 * 1024

// Both parsers need a `usage` object, and about 3/4 of log bytes are lines without one.
const USAGE_KEY = Buffer.from('"usage"')
// Unescaped quotes: the same text quoted inside a message is `\"customType\"` and never matches.
const ACCOUNT_KEY = Buffer.from('"customType":"claude-account"')

/**
 * The working directory of a pi session, read from the file's first line
 * (`{"type":"session",…,"cwd":"/path"}`). pi's message lines carry no cwd, and
 * tailing usually resumes past the header, so it is re-read per cycle rather
 * than remembered. The session dir name encodes the same path but lossily
 * (`/Developer/claude-track` and `/Developer/claude/track` collide), so the
 * header is the only exact source.
 */
function piSessionCwd(fd: number): string | null {
	const head = Buffer.alloc(4096)
	const read = readSync(fd, head, 0, head.length, 0)
	const nl = head.indexOf(0x0a)
	try {
		const o: unknown = JSON.parse(head.subarray(0, nl === -1 ? read : nl).toString('utf-8'))
		const cwd = (o as { cwd?: unknown } | null)?.cwd
		return typeof cwd === 'string' && cwd.length > 0 ? cwd : null
	} catch {
		return null
	}
}

/** The account a pi session pinned itself to, from the dotfiles claude-accounts extension's
 *  `{"type":"custom","customType":"claude-account","data":{"email","uuid"}}` line. Every
 *  later line in the file ran on it, until the next such line. */
function piSessionAccount(line: string): string | undefined {
	try {
		const uuid = (JSON.parse(line) as { data?: { uuid?: unknown } } | null)?.data?.uuid
		return typeof uuid === 'string' && uuid !== '' ? uuid.slice(0, 100) : undefined
	} catch {
		return undefined
	}
}

/** Consecutive records booked on one Claude account; undefined means the device's login. */
export interface AccountSegment {
	accountExtId: string | undefined
	records: UsageRecord[]
}

export interface TailResult {
	/** New records in file order, split wherever a pi session switched accounts. */
	segments: AccountSegment[]
	/** New offset to persist ONLY after the records are acknowledged by the server. */
	nextState: FileState
	/** Bytes newly consumed (0 if nothing new). */
	consumedBytes: number
}

/**
 * Read new, newline-terminated lines from `filePath` starting at the previously
 * stored offset. Handles rotation/truncation (inode change or size < offset →
 * restart from 0) and partial trailing lines (never consume past the last \n).
 */
export function tailFile(
	filePath: string,
	prev: FileState | undefined,
	source: UsageSource = 'cli',
): TailResult | null {
	let st
	try {
		st = statSync(filePath)
	} catch {
		return null // file vanished
	}

	const rotated = prev !== undefined && (st.ino !== prev.inode || st.size < prev.offset)
	const start = rotated || prev === undefined ? 0 : prev.offset
	const startAccount = rotated ? undefined : prev?.accountExtId

	const base: FileState = { accountExtId: startAccount, inode: Number(st.ino), offset: start }

	if (st.size <= start) {
		return { consumedBytes: 0, nextState: base, segments: [] }
	}

	// Cap the per-cycle read so a huge backlog can't OOM; the next cycle resumes
	// from the committed offset.
	const length = Math.min(st.size - start, MAX_READ)
	const buf = Buffer.alloc(length)
	const fd = openSync(filePath, 'r')
	let sessionCwd: string | null = null
	try {
		readSync(fd, buf, 0, length, start)
		if (source === 'pi') {
			sessionCwd = piSessionCwd(fd)
		}
	} finally {
		closeSync(fd)
	}

	// Only consume up to the last newline; keep any partial trailing line.
	const lastNl = buf.lastIndexOf(0x0a)
	if (lastNl === -1) {
		// No newline in a full MAX_READ window = one pathologically long line.
		// Skip past it so the file can't stall forever.
		if (length >= MAX_READ) {
			line(yellow('!'), `skipped a line > ${MAX_READ} bytes ${dim(`· ${tilde(filePath)} at ${start}`)}`)
			return {
				consumedBytes: length,
				nextState: { ...base, offset: start + length },
				segments: [],
			}
		}
		return { consumedBytes: 0, nextState: base, segments: [] }
	}
	const consumed = buf.subarray(0, lastNl + 1)

	// Decode only the lines that can hold usage or a pi account switch: decoding and
	// splitting the whole 16 MB read peaked a first-run backlog at ~490 MB RSS.
	const segments: AccountSegment[] = []
	let account = startAccount
	let usageAt = consumed.indexOf(USAGE_KEY)
	let accountAt = source === 'pi' ? consumed.indexOf(ACCOUNT_KEY) : -1
	while (usageAt !== -1 || accountAt !== -1) {
		const isAccountLine = accountAt !== -1 && (usageAt === -1 || accountAt < usageAt)
		const at = isAccountLine ? accountAt : usageAt
		const lineStart = consumed.lastIndexOf(0x0a, at) + 1
		const lineEnd = consumed.indexOf(0x0a, at)
		const text = consumed.toString('utf-8', lineStart, lineEnd)
		if (isAccountLine) {
			account = piSessionAccount(text)
		} else {
			const rec = parseLine(text, source, sessionCwd)
			if (rec) {
				addRecord(segments, account, rec)
			}
		}
		if (usageAt !== -1 && usageAt < lineEnd) {
			usageAt = consumed.indexOf(USAGE_KEY, lineEnd)
		}
		if (accountAt !== -1 && accountAt < lineEnd) {
			accountAt = consumed.indexOf(ACCOUNT_KEY, lineEnd)
		}
	}

	const consumedBytes = consumed.length
	return {
		consumedBytes,
		nextState: { accountExtId: account, inode: base.inode, offset: start + consumedBytes },
		segments,
	}
}

function addRecord(segments: AccountSegment[], accountExtId: string | undefined, record: UsageRecord): void {
	const last = segments.at(-1)
	if (last && last.accountExtId === accountExtId) {
		last.records.push(record)
	} else {
		segments.push({ accountExtId, records: [record] })
	}
}
