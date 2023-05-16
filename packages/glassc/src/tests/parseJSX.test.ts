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
    const code = `<For each={messages} />`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['For'],
      undeclaredVariables: ['messages'],
    })
  })

  it('should parse JSX', () => {
    const code = `<System>
You are a helpful assistant.
</System>

<User if={false}>
Who was gandhi?
</User>

<User if={message}>
Who was Curie?
</User>

<User if="false">
Who was gandhi?
</User>`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['System', 'User'],
      undeclaredVariables: ['message'],
    })
  })

  it('should parse nested JSX', () => {
    const code = `<For each={messages} fragment={m => <Block foo="bar" role={role} content={m.text} />}></For>`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['For', 'Block'],
      undeclaredVariables: ['messages', 'role'],
    })
  })

  it('should parse nested JSX with complicated innards', () => {
    const code = `<For each={messages} fragment={m => <Block foo="bar" role={() => {
      const a = b
      return a
    }} content={m.text} />}></For>`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['For', 'Block'],
      undeclaredVariables: ['messages', 'b'],
    })
  })

  it('should parse single For statement', () => {
    const code = `<For each={[{role: 'user', content: 'who was gandhi?'}]} fragment={item => <Block role={item.role} content={item.content} />}  />`
    expect(parseJSXExpression(code)).to.deep.equal({
      tagNames: ['For', 'Block'],
      undeclaredVariables: [],
    })
  })

  it('should transform simple JSX arrow expression to template string', () => {
    const code = `m => <Block foo="bar" role={m.role} content={m.text} />`
    const templateString = transformArrowFunctionExpressionWithJsx(code)
    expect(templateString).to.equal(
      'm => `<Block foo="bar" role={${JSON.stringify(m.role)}} content={${JSON.stringify(m.text)}}>\n</Block>`'
    )
  })

  it('should transform nested JSX arrow expression to template string', () => {
    const code = `m => <Block role={m.role} content={m.text}><Child foo={m.bar} /></Block>`
    const templateString = transformArrowFunctionExpressionWithJsx(code)
    expect(templateString).to.equal(
      'm => `<Block role={${JSON.stringify(m.role)}} content={${JSON.stringify(m.text)}}>\n<Child foo={${JSON.stringify(m.bar)}}>\n</Child>\n</Block>`'
    )
  })
})