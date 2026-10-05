// Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
//
// Runs inside the playwriter sandbox (`playwriter -f`), driven by publish.sh.
// Stages a TikTok Studio upload: video, description from the .txt, cover from
// the .png. Stops before "Post"; the click stays with a human.
//
// Labels are matched in Polish and English: TikTok Studio follows the account
// language. data-e2e ids are language-independent and preferred where they exist.
const fs = require('node:fs')
const args = JSON.parse(fs.readFileSync('/tmp/usagefleet-publish.json', 'utf8'))

state.page = context.pages().find(p => p.url() === 'about:blank') ?? (await context.newPage())
await state.page.goto('https://www.tiktok.com/tiktokstudio/upload?from=creator_center&tab=video')
await state.page.locator('[data-e2e=select_video_button]').waitFor({ timeout: 30_000 })

await state.page.locator('input[type=file]').first().setInputFiles(args.mp4)

// "Enable automatic content check?" on first upload, then a feature-tour tooltip.
await state.page
	.getByRole('dialog')
	.getByRole('button', { name: /^(Anuluj|Cancel)$/ })
	.click({ timeout: 5_000 })
	.catch(() => {})
await state.page
	.getByRole('button', { name: /^(Rozumiem|Got it)$/ })
	.click({ timeout: 3_000 })
	.catch(() => {})

await state.page.getByText(/^(Przesłano|Uploaded)/).waitFor({ timeout: 120_000 })

// DraftJS ignores Meta+A here and prefills the filename, so select via a DOM
// range and let Backspace clear it. insertText lands whole, keyboard.type races
// the editor and drops characters.
const editor = state.page.getByRole('combobox').first()
await editor.focus()
await editor.evaluate(el => {
	const range = document.createRange()
	range.selectNodeContents(el)
	const selection = window.getSelection()
	selection.removeAllRanges()
	selection.addRange(range)
})
await state.page.keyboard.press('Backspace')
await state.page.waitForTimeout(300)
await state.page.keyboard.insertText(args.post)
await state.page.waitForTimeout(500)
const typed = (await editor.innerText()).trim()
if (typed !== args.post) throw new Error(`description mismatch:\n${typed}`)

await state.page.getByText(/^(Edytuj okładkę|Edit cover)$/).click()
const dialog = state.page.getByRole('dialog')
// "Upload cover image" is a <label> around a hidden file input; clicking it
// opens the OS chooser, which nothing here can close. Set the input directly.
const cover = state.page.locator('input[type=file][accept*=image]')
await cover.waitFor({ state: 'attached', timeout: 10_000 })
await cover.setInputFiles(args.png)
await dialog.getByRole('button', { name: 'Uploaded cover image' }).waitFor({ timeout: 30_000 })
await dialog.getByRole('button', { name: /^(Zapisz|Save)$/ }).click()
await dialog.waitFor({ state: 'hidden', timeout: 10_000 })

const post = state.page.locator('[data-e2e=post_video_button]')
if (!(await post.isEnabled())) throw new Error('post button disabled')
console.log(`staged: ${args.mp4}\nreview in Chrome, then click Post`)
