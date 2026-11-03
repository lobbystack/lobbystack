/**
 * The command that makes GPT-Live open the call with the business greeting.
 * GPT-Live waits for the caller by default. In tests against the API this
 * wording, placed in the session's starting history, made it greet about 2
 * seconds in every time, and the shorter "Greet the caller now in <language>"
 * wording failed in the starting history. On real calls it often skips the
 * starting history, so the call controller sends this again as commentary.
 */
export function greetingCommand(greeting: string): string {
  return `Start the conversation now: say exactly "${greeting}" in the language of that greeting, then stop and listen to the caller.`;
}
