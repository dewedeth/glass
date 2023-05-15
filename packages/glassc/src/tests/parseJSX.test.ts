import { expect } from 'chai'
import { parseJSXAttributes, parseJSXExpression, transformArrowFunctionExpressionWithJsx } from '../parseJSX'

describe('parseJSX', () => {
  it('should parse attributes', () => {
    const code = `<Args foo="bar" hello="world" />`
    expect(parseJSXAttributes(code)).to.deep.equal({
      foo: 'bar',
      hello: 'world',
    })
  })

  it('should parse JSX without variables', () => {
    const code = `<Assistant> some text with no variables</Assistant>`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['Assistant'],
      undeclaredVariables: [],
    })
  })

  it('should parse JSX without variables', () => {
    const code = `<Assistant> some text with \${variable}</Assistant>`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['Assistant'],
      undeclaredVariables: ['variable'],
    })
  })

  it('should parse JSX', () => {
    const code = `<for each={messages} />`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['for'],
      undeclaredVariables: ['messages'],
    })
  })

  it('should parse nested JSX', () => {
    const code = `<for each={messages} fragment={m => <Block foo="bar" role={role} content={m.text} />}></for>`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['for', 'Block'],
      undeclaredVariables: ['messages', 'role'],
    })
  })

  it('should parse nested JSX with complicated innards', () => {
    const code = `<for each={messages} fragment={m => <Block foo="bar" role={() => {
      const a = b
      return a
    }} content={m.text} />}></for>`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['for', 'Block'],
      undeclaredVariables: ['messages', 'b'],
    })
  })

  it('should transform simple JSX arrow expression to template string', () => {
    const code = `m => <Block foo="bar" role={m.role} content={m.text} />`
    const templateString = transformArrowFunctionExpressionWithJsx(code)
    expect(templateString).to.equal(
      'm => `<Block foo="bar" role={JSON.stringify(${m.role})} content={JSON.stringify(${m.text})}></Block>`'
    )
  })

  it('should transform nested JSX arrow expression to template string', () => {
    const code = `m => <Block role={m.role} content={m.text}><Child foo={m.bar} /></Block>`
    const templateString = transformArrowFunctionExpressionWithJsx(code)
    expect(templateString).to.equal(
      'm => `<Block role={JSON.stringify(${m.role})} content={JSON.stringify(${m.text})}><Child foo={JSON.stringify(${m.bar})}></Child></Block>`'
    )
  })
})
