import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { MonitorSmartphoneIcon, Trash2 } from 'lucide-react'
import { useTranslations } from 'use-intl'
import { AddDeviceForm } from '@/components/AddDeviceForm'
import { AutoRefresh } from '@/components/AutoRefresh'
import { ConfirmAction } from '@/components/ConfirmAction'
import { DeviceBlockingToggle, DeviceGroupSelect, RevokeDeviceButton } from '@/components/devices/DeviceActions'
import { GroupFormDialog } from '@/components/groups/GroupFormDialog'
import { RelativeTime } from '@/components/RelativeTime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { deleteGroup } from '@/lib/actions'
import { accountPlan } from '@/lib/billing'
import { backfillUngroupedDevices, listDevices, listGroups, slottedGroups } from '@/lib/data'
import { OS_LABEL } from '@/lib/format'
import { planLabel } from '@/lib/plans'
import { requireUser } from '@/lib/session'

const fleetData = createServerFn().handler(async () => {
	const user = await requireUser()
	// Enforce the "every device is grouped" invariant before listing.
	await backfillUngroupedDevices(user.id)
	const [devices, groups, plan] = await Promise.all([listDevices(user.id), listGroups(user.id), accountPlan(user.id)])
	// Groups with a live device on an account split that account by weight. Stated
	// only when every account splits the same way, otherwise the dashboard names the
	// slice per account and one number here would contradict it.
	const accounts = new Set(devices.filter(d => !d.revoked).map(d => d.claudeAccountId))
	const shares = new Set<number>()
	for (const account of accounts) {
		const onAccount = devices.filter(d => d.claudeAccountId === account)
		const slotted = slottedGroups(onAccount, groups)
		shares.add(groups.filter(g => slotted.has(g.id)).reduce((parts, g) => parts + g.sliceWeight, 0))
	}
	return {
		devices,
		groups,
		plan,
		sliceShare: shares.size <= 1 ? Math.max(1, ...shares) : null,
	}
})

export const Route = createFileRoute('/_dash/fleet')({
	loader: () => fleetData(),
	component: FleetPage,
})

/** Groups and their devices on one page: a group is a heading with its
 *  settings, its devices are the rows under it. */
function FleetPage() {
	const t = useTranslations('dash.devices')
	const tGroups = useTranslations('dash.groups')
	const { devices, groups, plan, sliceShare } = Route.useLoaderData()
	const [showRevoked, setShowRevoked] = useState(false)
	// Revoked devices don't hold a slot — must match createDevice's count.
	const activeDevices = devices.filter(d => !d.revoked)
	const active = activeDevices.length
	const atCap = active >= plan.deviceLimit
	// One group per device slot the plan pays for.
	const groupsAtCap = groups.length >= plan.deviceLimit
	// Same rule the collector APIs enforce (lib/billing.ts deviceWithinPlan):
	// slots go to the oldest devices, the newest overflow is parked — still
	// listed and still revivable, just not accepting data until you upgrade.
	const parked = new Set(
		[...activeDevices]
			.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
			.slice(plan.deviceLimit)
			.map(d => d.id),
	)
	const groupOptions = groups.map(g => ({ id: g.id, name: g.name }))
	// With one Claude account the line would repeat the same address on every row.
	const multiAccount = new Set(activeDevices.map(d => d.accountLabel)).size > 1
	// Revoked devices are hidden until asked for, and sink below the live ones.
	const ordered = showRevoked ? devices.toSorted((a, b) => Number(a.revoked) - Number(b.revoked)) : activeDevices
	// One section per group (empty ones included), then anything still ungrouped.
	const sections = [
		...groups.map(g => ({ group: g, items: ordered.filter(d => d.groupId === g.id), key: g.id })),
		{ group: null, items: ordered.filter(d => !groups.some(g => g.id === d.groupId)), key: 'ungrouped' },
	].filter(s => s.group || s.items.length > 0)

	if (devices.length === 0 && groups.length === 0) {
		return (
			<Empty className='py-16'>
				<EmptyHeader>
					<EmptyMedia variant='icon'>
						<MonitorSmartphoneIcon />
					</EmptyMedia>
					<EmptyTitle>{t('emptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('emptyDescription')}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<AddDeviceForm groups={groupOptions} atCap={atCap} />
					<p className='text-xs text-muted-foreground'>{t('emptyHint')}</p>
				</EmptyContent>
			</Empty>
		)
	}

	return (
		<>
			<AutoRefresh />
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<p className='text-sm text-muted-foreground'>
					<span className='text-foreground tabular-nums'>
						{t('count', { active, limit: plan.deviceLimit })}
					</span>{' '}
					{t('slots', { count: active, plan: planLabel(plan.plan) })} ·{' '}
					<span className='tabular-nums'>{groups.length}</span>{' '}
					{sliceShare === null ? tGroups('slotsPerAccount') : tGroups('slots', { share: sliceShare })}
					{atCap && (
						<span className='text-amber-600 dark:text-amber-500'>
							{t.rich('atCap', {
								upgrade: chunks => (
									<Link to='/account' className='underline underline-offset-2'>
										{chunks}
									</Link>
								),
							})}
						</span>
					)}
					{groupsAtCap && !atCap && (
						<span className='text-amber-600 dark:text-amber-500'>{tGroups('atCap')}</span>
					)}
				</p>
				<div className='flex items-center gap-2'>
					{devices.length > active && (
						<Button variant='ghost' size='sm' onClick={() => setShowRevoked(!showRevoked)}>
							{t(showRevoked ? 'hideRevoked' : 'showRevoked', { count: devices.length - active })}
						</Button>
					)}
					<GroupFormDialog atCap={groupsAtCap} />
					<AddDeviceForm groups={groupOptions} atCap={atCap} />
				</div>
			</div>

			{sections.map(({ group: g, items, key }) => (
				<section key={key}>
					<div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
						<h2 className='flex items-center gap-2 text-sm font-medium'>
							<span
								className='size-2 rounded-full'
								style={{ backgroundColor: g?.color ?? '#94a3b8' }}
								aria-hidden
							/>
							{g?.name ?? t('ungrouped')}
						</h2>
						<span className='text-xs text-muted-foreground'>
							{/* Counts active devices only, like the page header — revoked
                  ones don't hold a slot, and are hidden unless asked for. */}
							{[
								t('active', { count: items.filter(d => !d.revoked).length }),
								g?.watchOnly && tGroups('watchOnly'),
								g &&
									!g.watchOnly &&
									g.sliceWeight !== 1 &&
									tGroups('weight', { weight: g.sliceWeight }),
								(g?.blockOnSessionLimit || g?.blockOnWeeklyLimit) &&
									tGroups('blocksAt', {
										windows: [
											g.blockOnSessionLimit && tGroups('blocksSession'),
											g.blockOnWeeklyLimit && tGroups('blocksWeekly'),
										]
											.filter(Boolean)
											.join(' + '),
									}),
							]
								.filter(Boolean)
								.join(' · ')}
						</span>
						{g && (
							<div className='ml-auto flex gap-1'>
								<GroupFormDialog
									group={{
										blockOnSessionLimit: g.blockOnSessionLimit,
										blockOnWeeklyLimit: g.blockOnWeeklyLimit,
										color: g.color,
										id: g.id,
										name: g.name,
										sliceWeight: g.sliceWeight,
										watchOnly: g.watchOnly,
									}}
								/>
								<ConfirmAction
									action={deleteGroup}
									id={g.id}
									title={tGroups('deleteTitle', { name: g.name })}
									description={tGroups('deleteDescription')}
									confirmLabel={tGroups('delete')}
									successMessage={tGroups('deleted', { name: g.name })}
								>
									<Trash2 />
									{tGroups('delete')}
								</ConfirmAction>
							</div>
						)}
					</div>
					{items.length === 0 ? (
						<p className='mt-2 border-t border-b py-3.5 text-sm text-muted-foreground'>
							{t('noneInGroup')}
						</p>
					) : (
						<ul className='mt-2 [&>li:last-child]:border-b'>
							{items.map(d => (
								<li key={d.id} className='flex items-center gap-4 border-t py-3.5'>
									<div className='min-w-0 flex-1'>
										<div className='flex flex-wrap items-center gap-2'>
											<span className='text-sm font-medium'>{d.name}</span>
											{d.os && (
												<Badge variant='outline' className='font-normal'>
													{OS_LABEL[d.os] ?? d.os}
												</Badge>
											)}
											{d.revoked && <Badge variant='destructive'>{t('revoked')}</Badge>}
											{parked.has(d.id) && <Badge variant='destructive'>{t('overLimit')}</Badge>}
										</div>
										<p className='mt-0.5 text-xs text-muted-foreground'>
											{d.hostname ? `${d.hostname} · ` : ''}
											{t('token', { prefix: d.tokenPrefix })}
											{d.collectorVersion ? ` · v${d.collectorVersion}` : ''}
										</p>
										{multiAccount && d.accountLabel && (
											<p className='mt-0.5 text-xs'>
												{t('signedInto', { account: d.accountLabel })}
											</p>
										)}
									</div>
									{/* Never seen means the installer hasn't run yet on that
                      machine — worth spotting from across the list. */}
									<span
										className={
											d.lastSeenAt
												? 'text-sm text-muted-foreground'
												: 'text-sm text-amber-600 dark:text-amber-500'
										}
									>
										<RelativeTime date={d.lastSeenAt} />
									</span>
									{!d.revoked && (
										<DeviceBlockingToggle
											deviceId={d.id}
											deviceName={d.name}
											enabled={d.blockingEnabled}
										/>
									)}
									<DeviceGroupSelect
										deviceId={d.id}
										deviceName={d.name}
										groupId={d.groupId}
										groups={groupOptions}
									/>
									{!d.revoked && <RevokeDeviceButton id={d.id} name={d.name} />}
								</li>
							))}
						</ul>
					)}
				</section>
			))}
		</>
	)
}
