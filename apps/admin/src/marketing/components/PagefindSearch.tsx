// Port of astro-pagefind's Search.astro: a <pagefind-config> element, the
// <pagefind-searchbox> web component, and Pagefind's component UI. The Astro
// build bundled @pagefind/component-ui; here the same script and stylesheet
// load at runtime from the Pagefind bundle that the index build writes to
// /pagefind/.
const bundlePath = "/pagefind/"

type PagefindSearchProps = {
  instance?: string
  className?: string
  searchboxOptions?: Record<string, unknown>
  configOptions?: Record<string, unknown>
}

// Astro writes every option as a string attribute (true becomes "true"), and
// leaves out undefined ones.
function attributes(options: Record<string, unknown>) {
  return Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`)
    .join("")
}

export function PagefindSearch({
  instance,
  className,
  searchboxOptions = {},
  configOptions = {},
}: PagefindSearchProps) {
  // Raw HTML, because the module script can upgrade these web components
  // before React hydrates, and React would then set their getter-only
  // properties (such as placeholder) and throw.
  const html =
    `<pagefind-config${attributes({ ...configOptions, instance, "bundle-path": bundlePath })}></pagefind-config>` +
    `<pagefind-searchbox${attributes({ ...searchboxOptions, instance, class: className })}></pagefind-searchbox>`
  return (
    <>
      <link rel="stylesheet" href={`${bundlePath}pagefind-component-ui.css`} precedence="default" />
      {/* The web components set their own attributes (such as hidden) once upgraded. */}
      <div className="contents" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
      <script type="module" src={`${bundlePath}pagefind-component-ui.js`} async />
    </>
  )
}
