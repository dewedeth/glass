import { expect } from 'chai'
import { parseGlassMetadata } from '../parseGlassMetadata'

describe('parseGlassMetadata', () => {
  it('should parse non-chat document with no vars', () => {
    expect(
      parseGlassMetadata(`<Prompt>
hello world
</Prompt>`)
    ).to.deep.equal({ interpolationVariables: [], isChat: false })
  })

  it('should parse chat document with no vars', () => {
    expect(
      parseGlassMetadata(`<System>
hello world
</System>`)
    ).to.deep.equal({ interpolationVariables: [], isChat: true })
  })

  it('should parse non-chat document with vars', () => {
    expect(
      parseGlassMetadata(`<Prompt>
\${foo}
</Prompt>`)
    ).to.deep.equal({ interpolationVariables: ['foo'], isChat: false })
  })

  it('should parse chat document with vars', () => {
    expect(
      parseGlassMetadata(`
import {hello} from './world'

<System>
\${foo}
</System>

<User>
\${bar}
</User>

<Code>
const a = await fetch(url)
const text = await a.text()
</Code>

<Assistant>
\${foo}
</Assistant>`)
    ).to.deep.equal({ interpolationVariables: ['foo', 'bar', 'url'], isChat: true })
  })
})