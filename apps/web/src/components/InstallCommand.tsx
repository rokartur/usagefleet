import { useState } from 'react'
import { useTranslations } from 'use-intl'
import { CopyButton } from '@/components/arc/copy-button/copy-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { installCommands } from '@/lib/install-command'

/** The one command that turns a device token into a reporting machine, per
 *  shell, with a copy button. Used on the token dialog (real token) and on the
 *  dashboard setup rail (placeholder token, since it is shown only once). */
export function InstallCommand({ token }: { token: string }) {
	const t = useTranslations('dash.devices')
	const tCommon = useTranslations('common')
	const commands = installCommands(token)
	const [platform, setPlatform] = useState<string>(commands[0].id)

	return (
		<Tabs value={platform} onValueChange={setPlatform}>
			<TabsList>
				{commands.map(c => (
					<TabsTrigger key={c.id} value={c.id}>
						{c.label}
					</TabsTrigger>
				))}
			</TabsList>
			{commands.map(c => (
				<TabsContent key={c.id} value={c.id}>
					<div className='flex items-start gap-2'>
						{/* Wraps rather than scrolls: the token makes this line far wider than
						    the dialog, and `wrap-anywhere` keeps its min-content size at one
						    character so it can never widen the layout around it. */}
						<pre className='min-w-0 flex-1 rounded-lg bg-muted p-3 font-mono text-xs wrap-anywhere whitespace-pre-wrap'>
							{c.command}
						</pre>
						<CopyButton
							value={c.command}
							label={t('copyCommand', { name: c.label })}
							messages={{ copied: tCommon('copied'), failed: tCommon('copyFailed') }}
						/>
					</div>
				</TabsContent>
			))}
		</Tabs>
	)
}
