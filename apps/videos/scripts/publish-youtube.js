// Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
//
// Runs inside the playwriter sandbox (`playwriter -f`), driven by publish.sh
// youtube. Stages a YouTube Studio upload: video (portrait + under 60 s lands as
// a Short on its own), title from the .txt's first line, description from the
// whole .txt, thumbnail from the .png, "not made for kids", Public. Stops before
// "Publish"; the click stays with a human.
//
// Studio ids (#textbox, #next-button, #done-button) are language-independent;
// the two radios are matched by their English and Polish labels.
const fs = require('node:fs')
const args = JSON.parse(fs.readFileSync('/tmp/usagefleet-publish.json', 'utf8'))
const [title] = args.post.split('\n')

state.page = context.pages().find(p => p.url() === 'about:blank') ?? (await context.newPage())
// `d=ud` opens the upload dialog on load; the channel-less URL does not.
await state.page.goto(`https://studio.youtube.com/channel/${args.youtubeChannel}/videos/upload?d=ud`)
await state.page.locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 30_000 })
await state.page.locator('input[type=file]').first().setInputFiles(args.mp4)

const box = state.page.locator('#textbox')
await box.nth(1).waitFor({ timeout: 60_000 })
// Studio prefills the title with the filename; Meta+A appends instead of
// replacing here, so select via a DOM range and let Backspace clear it.
for (const [index, text] of [
	[0, title],
	[1, args.post],
]) {
	const field = box.nth(index)
	await field.click()
	await field.evaluate(el => {
		const range = document.createRange()
		range.selectNodeContents(el)
		const selection = window.getSelection()
		selection.removeAllRanges()
		selection.addRange(range)
	})
	await state.page.keyboard.press('Backspace')
	await state.page.keyboard.insertText(text)
	await state.page.waitForTimeout(300)
	const typed = (await field.innerText()).trim()
	if (typed !== text) {
		throw new Error(`field ${index} mismatch:\n${typed}`)
	}
}

await state.page.getByRole('radio', { name: /^(No, it.s not made for kids|Nie, .*dla dzieci)/ }).click()
await state.page.locator('input[type=file][accept*=image]').setInputFiles(args.png)
await state.page.locator('#preview-button').first().waitFor({ timeout: 30_000 })

// Details → Video elements → Initial check → Visibility.
for (let i = 0; i < 3; i++) {
	await state.page.locator('#next-button').click()
	await state.page.waitForTimeout(1000)
}
await state.page.getByRole('radio', { name: /^(Public|Publiczny)$/ }).click()

const publish = state.page.locator('#done-button')
if (!(await publish.isEnabled())) {
	throw new Error('publish button disabled')
}
console.log(`staged: ${args.mp4}\nreview in Chrome, then click Publish`)
