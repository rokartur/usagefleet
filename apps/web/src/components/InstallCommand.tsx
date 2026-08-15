import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { installCommands } from '@/lib/install-command'

/** The one command that turns a device token into a reporting machine, per
 *  shell, with a copy button. Used on the token dialog (real token) and on the
 *  dashboard setup rail (placeholder token, since it is shown only once). */
export function InstallCommand({ token }: { token: string }) {
	const commands = installCommands(token)
	const [platform, setPlatform] = useState<string>(commands[0].id)
	const [copied, setCopied] = useState<string | null>(null)

	async function copy(command: string, id: string) {
		try {
			await navigator.clipboard.writeText(command)
			setCopied(id)
			toast.add({ title: 'Command copied', type: 'success' })
		} catch {
			toast.add({
				description: 'Select the command and copy it manually.',
				priority: 'high',
				title: "Couldn't copy",
				type: 'error',
			})
		}
	}

	return (
		<Tabs value={platform} onValueChange={next => setPlatform(String(next))}>
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
						<pre className='min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs'>
							{c.command}
						</pre>
						<Button
							variant='outline'
							size='icon'
							aria-label={`Copy ${c.label} install command`}
							onClick={() => copy(c.command, c.id)}
						>
							{copied === c.id ? <CheckIcon /> : <CopyIcon />}
						</Button>
					</div>
				</TabsContent>
			))}
		</Tabs>
	)
}
