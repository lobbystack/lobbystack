export function buildProviderFailureMessage(input: {
  transferAvailable: boolean;
}): string {
  if (input.transferAvailable) {
    return "We're having trouble with our automated assistant. Please hold while I connect you to someone.";
  }

  return "We're sorry, we're having trouble completing your call right now. Please call back in a moment. Goodbye.";
}

export function buildToolFailureRecoveryInstructions(input: {
  toolName: string;
  transferAvailable: boolean;
}): string {
  const fallbackAction = input.transferAvailable
    ? "Offer to transfer the caller to a team member if they would like further help."
    : "Offer to take a callback message if the caller still needs help.";

  switch (input.toolName) {
    case "findAvailability":
    case "checkAvailability":
    case "bookAppointment":
      return [
        "Apologize briefly and explain that scheduling is temporarily unavailable.",
        "Do not invent availability or claim a booking succeeded.",
        fallbackAction,
      ].join(" ");
    case "takeMessage":
      return input.transferAvailable
        ? "Apologize briefly and explain that saving a callback message is temporarily unavailable. Offer to transfer the caller to a team member right now."
        : "Apologize briefly and explain that saving a callback message is temporarily unavailable. Ask the caller to try again later.";
    default:
      return [
        "Apologize briefly and explain that the requested information is temporarily unavailable.",
        fallbackAction,
      ].join(" ");
  }
}
