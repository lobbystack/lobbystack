/**
 * The command that makes GPT-Live open the call with the business greeting.
 * GPT-Live waits for the caller by default. The call controller sends this as
 * commentary when the session starts. In earlier API tests, the shorter "Greet
 * the caller now in <language>" wording failed.
 */
export function greetingCommand(greeting: string): string {
  return `Start the conversation now: say exactly "${greeting}" in the language of that greeting, then stop and listen to the caller.`;
}
