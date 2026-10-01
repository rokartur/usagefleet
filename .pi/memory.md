# Current memory

## Always
- User prefers Polish; app is translated to Polish and priced in PLN
- Chart configurations should use fixed values that can be changed (like usage overtime), not auto-scale based on column count
- When usage is attributed to main account but no group uses it or has a collector connected, detect and flag the misattribution source
- Usage attribution bugs: investigate when group receives higher % than individual user, especially after long inactivity followed by single action
- When a token's usage doesn't match its assignment, trace and reassign it to the correct account/owner
- Token assignment: verify if a token is actively used before reassigning; if used on wrong account/device, reassign to correct owner

## When touching apps/web
- Dashboard and explorer are primary UI surfaces; changes often touch both
- Per-model limits, account slices, and group splits are core features
- Prioritize performance: skip polls when tab is hidden, load past windows in parallel, scan from earliest open limit window
- Usage attribution debugging: detect when % usage comes from unexpected source or inflated vs actual behavior

## When touching apps/cli
- Service is Node.js based with V8 semi-space capped; keep memory usage in mind
- CLI versioning is semantic and committed back to repo after publish
- Config file keys mirror environment variable knobs

## Team (from git)
- Monorepo: apps/web (primary), apps/cli (secondary), apps/videos (content), docs
- Commits are scoped (feat/fix/chore/perf) with app prefix; cli versions bump frequently
- Dashboard, usage explorer, and device/group/account management are interconnected features
- Recent focus: per-model limits, account attribution, performance optimization, Polish localization

<!-- git-head: 94fa5fc -->
