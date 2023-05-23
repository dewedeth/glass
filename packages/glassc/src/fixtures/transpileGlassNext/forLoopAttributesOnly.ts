import { runGlass } from '@glass-lang/glasslib'

export async function getFooPrompt(opt?: {
  options?: { openaiKey?: string; progress?: (data: { nextDoc: string; rawResponse?: string }) => void }
}) {
  const GLASS_STATE = {}

  const GLASSVAR = {
    '0': [{ role: 'user', content: 'who was gandhi?' }]
      .map(
        item => `<Block role={${JSON.stringify(item.role)}} content={${JSON.stringify(item.content)}}>
</Block>`
      )
      .join('\n\n'),
  }
  const TEMPLATE = `${GLASSVAR[0]}`
  return await runGlass(
    'foo',
    'gpt-3.5-turbo',
    {
      interpolatedDoc: TEMPLATE,
      originalDoc:
        "<For each={[{role: 'user', content: 'who was gandhi?'}]} fragment={item => <Block role={item.role} content={item.content} />}  />",
    },
    { ...(opt?.options || {}), ...{ state: GLASS_STATE, onResponse: undefined } }
  )
}
