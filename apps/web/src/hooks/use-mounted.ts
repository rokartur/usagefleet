import { useSyncExternalStore } from 'react'

// Nothing to subscribe to: the value flips once, when React hands the tree over
// to the client. Module-level so the identity is stable across renders.
// oxlint-disable-next-line no-empty-function -- there is nothing to unsubscribe from
const noSubscribe = () => () => {}

/** False while server-rendering and through the hydration pass, true from the
 *  first client-owned render onwards.
 *
 *  Gate anything whose markup depends on the wall clock or the viewer's
 *  timezone — the server shares neither, so rendering it on both sides is a
 *  guaranteed text mismatch (React error #418) and React throws the whole
 *  subtree away. Cheaper than it looks: React re-renders the gated component
 *  immediately after hydration, so the real value paints in the same frame. */
export function useMounted(): boolean {
	return useSyncExternalStore(
		noSubscribe,
		() => true,
		() => false,
	)
}
