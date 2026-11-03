// Loaded on its own after consent. A local module keeps the chunk name free of
// "posthog", which tracker blocklists match on.
import "posthog-js/dist/posthog-recorder"
import "posthog-js/dist/dead-clicks-autocapture"
