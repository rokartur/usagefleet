import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { MonitorSmartphoneIcon } from 'lucide-react'
import { AddDeviceForm } from '@/components/AddDeviceForm'
import { AutoRefresh } from '@/components/AutoRefresh'
import { DeviceGroupSelect, RevokeDeviceButton } from '@/components/devices/DeviceActions'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { accountPlan } from '@/lib/billing'
import { backfillUngroupedDevices, listDevices, listGroups } from '@/lib/data'
import { OS_LABEL, formatRelative } from '@/lib/format'
import { planLabel } from '@/lib/plans'
import { requireUser } from '@/lib/session'

const devicesData = createServerFn().handler(async () => {
	const user = await requireUser()
	// Enforce the "every device is grouped" invariant before listing.
	await backfillUngroupedDevices(user.id)
	const [devices, groups, plan] = await Promise.all([listDevices(user.id), listGroups(user.id), accountPlan(user.id)])
	return { devices, groups, plan }
})

export const Route = createFileRoute('/_dash/devices')({
	loader: () => devicesData(),
	component: DevicesPage,
})

function DevicesPage() {
	const { devices, groups, plan } = Route.useLoaderData()
	// Revoked devices don't hold a slot — must match createDevice's count.
	const activeDevices = devices.filter(d => !d.revoked)
	const active = activeDevices.length
	const atCap = active >= plan.deviceLimit
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
	// One section per group (empty ones included), then anything still ungrouped.
	const sections = [
		...groups.map(g => ({
			key: g.id,
			name: g.name,
			color: g.color,
			items: devices.filter(d => d.groupId === g.id),
		})),
		{
			key: 'ungrouped',
			name: 'Ungrouped',
			color: '#94a3b8',
			items: devices.filter(d => !groups.some(g => g.id === d.groupId)),
		},
	].filter(s => s.key !== 'ungrouped' || s.items.length > 0)

	return (
		<>
			<AutoRefresh />
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<p className='text-sm text-muted-foreground'>
					<span className='tabular-nums'>
						{active} / {plan.deviceLimit}
					</span>{' '}
					active devices on {planLabel(plan.plan)}
					{atCap && (
						<span className='text-amber-600 dark:text-amber-500'>
							{' '}
							· limit reached, revoke one or{' '}
							<Link to='/billing' className='underline underline-offset-2'>
								upgrade
							</Link>
						</span>
					)}
				</p>
				{/* When there are none, the empty state below carries the button. */}
				{devices.length > 0 && <AddDeviceForm groups={groupOptions} atCap={atCap} />}
			</div>

			{devices.length === 0 ? (
				<Empty className='py-16'>
					<EmptyHeader>
						<EmptyMedia variant='icon'>
							<MonitorSmartphoneIcon />
						</EmptyMedia>
						<EmptyTitle>No devices yet</EmptyTitle>
						<EmptyDescription>
							A device is one machine you use Claude on. Adding it here gives you a token and the one-line
							installer for that machine.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<AddDeviceForm groups={groupOptions} atCap={atCap} />
						<p className='text-xs text-muted-foreground'>
							Takes about a minute. The dashboard stays empty until one device reports.
						</p>
					</EmptyContent>
				</Empty>
			) : (
				sections.map(s => (
					<section key={s.key}>
						<h2 className='flex items-center gap-2 text-sm font-medium'>
							<span className='size-2 rounded-full' style={{ backgroundColor: s.color }} aria-hidden />
							{s.name}
							{/* Counts active devices only, like the page header — revoked
                  ones stay listed but don't hold a slot. */}
							<span className='font-normal text-muted-foreground'>
								{s.items.filter(d => !d.revoked).length} active
							</span>
						</h2>
						{s.items.length === 0 ? (
							<p className='mt-2 border-t border-b py-3.5 text-sm text-muted-foreground'>
								No devices in this group. Move one here with the group picker on any row.
							</p>
						) : (
							<ul className='mt-2 [&>li:last-child]:border-b'>
								{s.items.map(d => (
									<li key={d.id} className='flex items-center gap-4 border-t py-3.5'>
										<div className='min-w-0 flex-1'>
											<div className='flex flex-wrap items-center gap-2'>
												<span className='text-sm font-medium'>{d.name}</span>
												{d.os && (
													<Badge variant='outline' className='font-normal'>
														{OS_LABEL[d.os] ?? d.os}
													</Badge>
												)}
												{d.revoked && <Badge variant='destructive'>revoked</Badge>}
												{parked.has(d.id) && (
													<Badge variant='destructive'>over plan limit</Badge>
												)}
											</div>
											<p className='mt-0.5 text-xs text-muted-foreground'>
												{d.hostname ? `${d.hostname} · ` : ''}
												token {d.tokenPrefix}…
												{d.collectorVersion ? ` · v${d.collectorVersion}` : ''}
											</p>
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
											{formatRelative(d.lastSeenAt)}
										</span>
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
				))
			)}
		</>
	)
}
