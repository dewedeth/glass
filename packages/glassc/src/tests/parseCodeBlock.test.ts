import { expect } from 'chai'
import {
  codeBlockContainsAwait,
  parseCodeBlock,
  parseCodeBlockLocalVars,
  parseCodeBlockUndeclaredSymbols,
  parseCodeImportedSymbols,
} from '../parseCodeBlock'

describe('parseCodeBlock', () => {
  it('should parse local variables', () => {
    const code = `
const res = await fetch('https://google.com')
let data = await res.text()
`
    expect(parseCodeBlockLocalVars(code)).to.deep.equal(['res', 'data'])
  })

  it('should parse local variables with descructuring', () => {
    const code = `
const a = { b: 1, c: 2 }
const {b, c} = a
`
    expect(parseCodeBlockLocalVars(code)).to.deep.equal(['a', 'b', 'c'])
  })

  it('should parse undeclared values', () => {
    const code = `
const res = await fetch(url)
const data = await res.json()
`
    expect(parseCodeBlockUndeclaredSymbols(code)).to.deep.equal(['fetch', 'url'])
  })

  it('should parse imported values', () => {
    const code = `
import {foo, bar} from './someFile'
import * as something from './someOtherFile'
import baz from 'baz'
`
    expect(parseCodeImportedSymbols(code)).to.deep.equal(['foo', 'bar', 'something', 'baz'])
  })

  it('should parse code block await', () => {
    const code = `
const res = await fetch(url)
`

    expect(codeBlockContainsAwait(code)).to.equal(true)
  })

  it('should ignore code block await inside string', () => {
    const code = `
const res = "not a real await"
`

    expect(codeBlockContainsAwait(code)).to.equal(false)
  })

  it('should parse block', () => {
    const code = `
import {foo, bar} from './someFile'
import * as something from './someOtherFile'
import baz from 'baz'

const res = await fetch(url, { method, other: something.other })
const data = await res.json()
`
    expect(parseCodeBlock(code)).to.deep.equal({
      isAsync: true,
      importedSymbols: ['foo', 'bar', 'something', 'baz'],
      symbolsAddedToScope: ['res', 'data'],
      undeclaredValuesNeededInScope: ['url', 'method'],
    })
  })
})
