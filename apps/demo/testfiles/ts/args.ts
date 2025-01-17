export function getArgsPrompt() {
  function getTestData() {
    return {}
  }

  const compile = async (opt: { args: { foo: number; bar: string } }) => {
    const GLASS_STATE = {}
    const { foo, bar } = opt.args

    const GLASSVAR = {}
    const TEMPLATE = `<User>
${foo} ${bar}
</User>`
    return {
      fileName: 'args',
      interpolatedDoc: TEMPLATE,
      originalDoc:
        '---\nlanguage: typescript\nargs:\n    foo: number\n    bar: string\n---\n<User>\n${foo} ${bar}\n</User>',
      state: GLASS_STATE,
      interpolationArgs: opt.args || {},
      requestBlocks: [],
    }
  }

  return { getTestData, compile }
}
