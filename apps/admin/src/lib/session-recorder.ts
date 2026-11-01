// Bundles the session replay recorder and dead-click capture. The SDK otherwise
// fetches them as separate scripts from the PostHog host, and Safari 27 and
// some Firefox setups never run those. A local module keeps the chunk name free
// of "posthog", which tracker blocklists match on.
import "posthog-js/dist/posthog-recorder";
import "posthog-js/dist/dead-clicks-autocapture";
