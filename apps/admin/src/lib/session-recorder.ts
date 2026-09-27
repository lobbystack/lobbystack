// Bundles the session replay recorder. The SDK otherwise fetches it as a
// separate script from the PostHog host, and Safari 27 and some Firefox setups
// never run it. A local module keeps the chunk name free of "posthog", which
// tracker blocklists match on.
import "posthog-js/dist/posthog-recorder";
