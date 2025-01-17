export function getNonInterpolationSequencePrompt() {
  function getTestData() {
    return {}
  }

  const compile = async (opt: { args: { foo: string } }) => {
    const GLASS_STATE = {}
    const { foo } = opt.args

    const GLASSVAR = {}
    const TEMPLATE = `<User>
${foo} and {foo}
</User>`
    return {
      fileName: 'nonInterpolationSequence',
      interpolatedDoc: TEMPLATE,
      originalDoc: '<User>\n${foo} and {foo}\n</User>',
      state: GLASS_STATE,
      interpolationArgs: opt.args || {},
      requestBlocks: [],
    }
  }

  return { getTestData, compile }
}
