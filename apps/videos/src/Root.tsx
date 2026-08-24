import { Composition } from 'remotion'
import { BuiltTheUsageView } from './BuiltTheUsageView'
import { ClaudeCodeOnMultipleMachines } from './ClaudeCodeOnMultipleMachines'
import { ClaudeFleetForTeams } from './ClaudeFleetForTeams'
import { FocusedMicroSaaS } from './FocusedMicroSaaS'
import { FromAnnoyanceToProduct } from './FromAnnoyanceToProduct'
import { WhichMachineAteTheLimit } from './WhichMachineAteTheLimit'

// Duration = last Sequence `from` + its `durationInFrames`; keep in sync when a
// scene's timing changes.
const VIDEOS = [
	{ component: WhichMachineAteTheLimit, durationInFrames: 450, id: 'WhichMachineAteTheLimit' },
	{ component: ClaudeCodeOnMultipleMachines, durationInFrames: 450, id: 'ClaudeCodeOnMultipleMachines' },
	{ component: BuiltTheUsageView, durationInFrames: 810, id: 'BuiltTheUsageView' },
	{ component: FromAnnoyanceToProduct, durationInFrames: 840, id: 'FromAnnoyanceToProduct' },
	{ component: FocusedMicroSaaS, durationInFrames: 810, id: 'FocusedMicroSaaS' },
	{ component: ClaudeFleetForTeams, durationInFrames: 780, id: 'ClaudeFleetForTeams' },
]

export function RemotionRoot() {
	return (
		<>
			{VIDEOS.map(video => (
				<Composition
					key={video.id}
					id={video.id}
					component={video.component}
					durationInFrames={video.durationInFrames}
					fps={30}
					width={1080}
					height={1920}
				/>
			))}
		</>
	)
}
