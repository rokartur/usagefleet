# UsageFleet Console sync

A Chrome extension for Anthropic Console accounts that cannot create an Admin API key
(individual accounts have no organization). Every hour it reads the 30-day spend per API
key with your platform.claude.com sign-in and sends it to the API keys page on usagefleet.com.

It reads one thing, the cost report the Console's own keys page shows, and sends only the key
id, key name, request count and amount. Your Console cookie never leaves the browser.

## Install

1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked and pick this folder.
3. Stay signed in to platform.claude.com and usagefleet.com in the same Chrome profile.

The first sync runs on install, then every hour. The API keys page shows when the last report arrived.

The extension calls an internal Console endpoint that Anthropic does not document, so it can
stop working when the Console changes. An organization with an Admin key is the supported path.
