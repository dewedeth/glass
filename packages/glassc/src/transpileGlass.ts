import { parseGlassBlocks, removeGlassComments } from '@glass-lang/interpolator'
import camelcase from 'camelcase'
import * as fs from 'node:fs'
import * as path from 'node:path'
import prettier from 'prettier'
import { parseCodeBlock } from './parseCodeBlock.js'
import { jsxNodeToString, parseJSXAttributes, parseJSXExpression } from './parseJSX.js'
import { removeGlassFrontmatter } from './removeGlassFrontmatter.js'
import { transformDynamicBlocks } from './transformDynamicBlocks.js'
import { parseGlassAST } from './util/parseGlassAST.js'

const extension = 'glass'

const builtinTags = new Set(['Code', 'Args', 'Prompt', 'System', 'User', 'Assistant'])

/**
 * Takes a .glass document and returns a code file.
 * The directory / folder information is necessary so we can correctly re-write import paths.
 * The language is necessary so we can correctly format the output. Currently only supports 'typescript'.
 */
export function transpileGlassFile(
  doc: string,
  {
    workspaceFolder,
    folderPath,
    outputDirectory,
    fileName,
    language,
  }: { workspaceFolder: string; folderPath: string; outputDirectory: string; fileName: string; language: string }
) {
  if (language !== 'typescript' && language !== 'javascript') {
    throw new Error(`${language} not supported yet`)
  }

  // first, parse the document blocks to make sure the document is valid
  // this will also tell us if there are any special (e.g. <Code>) blocks that should appear unmodified in the final output
  const blocks = parseGlassBlocks(doc)
  // if (blocks.length === 0) {
  //   throw new Error(`No blocks found in ${fileName}.${extension}, did you mean to add a <Prompt> block?`)
  // }

  const codeBlocks = blocks.filter(b => b.tag === 'Code')

  // remove all block comments before any processing happens
  doc = removeGlassComments(doc)
  const functionName = camelcase(fileName)
  const exportName = getGlassExportName(fileName)
  const isChat = isChatTemplate(doc)

  const { imports, frontmatterArgs, interpolationArgs, jsxExpressions, jsxNodes, isAsync } = parseGlassAST(doc, {
    workspaceFolder,
    folderPath,
    outputDirectory,
    fileName,
  })

  // all variables inside {} are interpolation variables, including ones like {foo.bar}
  const allInterpolationVars = Object.keys(interpolationArgs)

  const interpolationVarNames = Array.from(new Set<string>(allInterpolationVars.map(arg => arg.split('.')[0])))

  if (frontmatterArgs.length > 0 && allInterpolationVars.length > 0) {
    const frontmatterArgsRemaining = new Set<string>(frontmatterArgs.map(a => a.name))
    const frontmatterArgsUsed = new Set<string>([])
    // verify that all frontmatter args are used
    for (const interpolationVar of interpolationVarNames) {
      if (frontmatterArgsRemaining.has(interpolationVar)) {
        frontmatterArgsRemaining.delete(interpolationVar)
        frontmatterArgsUsed.add(interpolationVar)
      } else if (!frontmatterArgsUsed.has(interpolationVar)) {
        // throw new error? interpolation variable exists that's not declared by frontmatter
        throw new Error(`Variable ${interpolationVar} is not declared by frontmatter in ${fileName}.glass`)
        // return null
      }
    }

    if (frontmatterArgsRemaining.size !== 0) {
      console.log(`Frontmatter args ${Array.from(frontmatterArgsRemaining).join(', ')} are unused in ${fileName}.glass`)
    }
  }

  // let argsString = frontmatterArgs
  //   .map(a => `${a.name}${language === 'javascript' ? '' : `${a.optional ? '?' : ''}: ${a.type}`}`)
  //   .join(', ')
  // let fullArgString = frontmatterArgs.length ? (language === 'typescript' ? `args: { ${argsString} }` : 'args') : ''

  const interpolationVarSet = new Set(interpolationVarNames)

  let argsNode = ''

  // find all the interpolation variables from dynamic code blocks
  for (const jsxNode of jsxNodes) {
    if (jsxNode.tagName === 'Args') {
      argsNode = jsxNodeToString(jsxNode)
    }
    if (builtinTags.has(jsxNode.tagName)) {
      continue
    }
    const jsxString = jsxNodeToString(jsxNode)
    const parsedJsx = parseJSXExpression(jsxString)

    for (const s of parsedJsx.undeclaredVariables) {
      interpolationVarSet.add(s)
    }
  }

  const parsedCodeBlocks = codeBlocks.map(block => parseCodeBlock(`${imports.join('\n')}\n${block.content}`))
  const hasAsyncCodeBlocks = parsedCodeBlocks.filter(block => block.isAsync).length > 0

  for (const block of parsedCodeBlocks) {
    for (const symbol of block.symbolsAddedToScope) {
      interpolationVarSet.delete(symbol)
    }
    for (const symbol of block.importedSymbols) {
      interpolationVarSet.delete(symbol)
    }
    for (const symbol of block.undeclaredValuesNeededInScope) {
      interpolationVarSet.add(symbol)
    }
  }

  const argsOverride = argsNode ? parseJSXAttributes(argsNode) : {}

  const dynamicTransform = transformDynamicBlocks(doc)
  doc = dynamicTransform.doc

  const allInterpolationNames = Array.from(interpolationVarSet)

  // if (frontmatterArgs.length === 0 && interpolationVarNames.length > 0) {
  const argsString = allInterpolationNames.map(arg => arg + `: ${argsOverride[arg] || 'string'}`).join(', ')
  let fullArgString = ''
  if (allInterpolationNames.length > 0) {
    fullArgString = language === 'typescript' ? `args: { ${argsString} }` : 'args'
  }
  // }

  // remove frontmatter after parsing the AST
  doc = removeGlassFrontmatter(doc)

  let codeSanitizedDoc = doc
  const codeInterpolationMap: any = { ...dynamicTransform.jsxInterpolations }

  // iterate over all the jsxExpressions (values inside `{ }`) and replace them with a number if they're supposed to be treated like code (values inside `${ }`)

  for (let j = 0; j < jsxExpressions.length; j++) {
    const expr = jsxExpressions[j]

    const codeInterpolation = '${' + expr + '}'
    const indexOfInterpolation = codeSanitizedDoc.indexOf(codeInterpolation)
    if (indexOfInterpolation === -1) {
      continue
    }
    codeSanitizedDoc = codeSanitizedDoc.replace(codeInterpolation, `\${${j}}`)
    if (expr.trim().startsWith('async')) {
      codeInterpolationMap['' + j] = `await (${expr.trim()})()`
    } else if (expr.trim().startsWith('function')) {
      codeInterpolationMap['' + j] = `(${expr.trim()})()`
    } else {
      codeInterpolationMap['' + j] = expr.trim()
    }
  }

  // after interpolating everything, we can unescape `\{ \}` sequences
  // codeSanitizedDoc = unescapeGlass(codeSanitizedDoc)

  const code = `${imports.join('\n')}

export ${isAsync || hasAsyncCodeBlocks ? 'async' : ''} function ${exportName}(${fullArgString}) {
  ${argsString ? `const {${allInterpolationNames.join(',')}} = args` : ''}
  ${codeBlocks.map(b => b.content).join('\n')}
  const interpolations = {
    ${Object.keys(codeInterpolationMap)
      .map(k => `"${k}": ${codeInterpolationMap[k]}`)
      .join(',')}
  }
  const TEMPLATE = ${JSON.stringify(codeSanitizedDoc)}
  return interpolateGlass${isChat ? 'Chat' : ''}('${fileName}', TEMPLATE, interpolations)
}`
  const formattedCode = prettier.format(code, {
    parser: 'babel',
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
  })
  return {
    code: formattedCode.trim(),
    args: frontmatterArgs,
    imports,
    functionName,
    exportName,
    variableNames: allInterpolationNames,
  }
}

function isChatTemplate(doc: string) {
  return doc.indexOf('<Prompt>') === -1
  // return doc.indexOf('<System>') !== -1 || doc.indexOf('<User>') !== -1 || doc.indexOf('<Assistant>') !== -1
}

/**
 * Takes a path, either to a file or a folder, and transpiles all glass files in that folder, or the file specified.
 */
export function transpileGlass(
  workspaceFolder: string,
  fileOrFolderPath: string,
  language: string,
  outputDirectory: string
) {
  const functions = transpileGlassHelper(workspaceFolder, fileOrFolderPath, language, outputDirectory)
  return constructGlassOutputFile(functions)
}

export function constructGlassOutputFile(functions: ReturnType<typeof transpileGlassHelper>) {
  const glassConstant = `export const Glass = {
    ${functions.map(f => `${f.functionName}: ${f.exportName}`).join(',\n  ')}
  }`
  const functionsString = functions.map(f => f.code).join('\n\n')

  const usesNonchat = functionsString.indexOf('interpolateGlass(') !== -1
  const usesChat = functionsString.indexOf('interpolateGlassChat') !== -1

  const imports: string[] = []
  if (usesNonchat) {
    imports.push('interpolateGlass')
  }
  if (usesChat) {
    imports.push('interpolateGlassChat')
  }
  const importLine = usesChat || usesNonchat ? `import { ${imports.join(', ')} } from '@glass-lang/interpolator'` : ''

  const code = `// THIS FILE WAS GENERATED BY GLASS -- DO NOT EDIT!

  ${importLine}

  ${functionsString}

  ${glassConstant}
  `

  const output = prettier.format(code, {
    parser: 'babel',
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
  })

  return output
}

function transpileGlassHelper(
  workspaceFolder: string,
  fileOrFolderPath: string,
  language: string,
  outputDirectory: string
): {
  code: string
  args: {
    name: string
    type: string
    description?: string | undefined
    optional?: boolean | undefined
  }[]
  imports: string[]
  functionName: string
  exportName: string
}[] {
  const file = fileOrFolderPath.split('/').slice(-1)[0]
  const folderPath = fileOrFolderPath.split('/').slice(0, -1).join('/')
  if (fs.statSync(fileOrFolderPath).isDirectory()) {
    // Recursively process files in subdirectory
    return recursiveCodegen(workspaceFolder, fileOrFolderPath, language, outputDirectory)
  } else if (path.extname(file) === `.${extension}`) {
    const fileContent = fs.readFileSync(fileOrFolderPath, 'utf8')
    const fileName = path.basename(file, `.${extension}`)

    // const newFileName = `${fileName}.ts` // TODO: allow other languages
    // const newFilePath = path.join(folderPath, newFileName)

    // Transpile the glass file to the target language.
    const codegenedResult = transpileGlassFile(fileContent, {
      workspaceFolder,
      folderPath,
      fileName,
      language,
      outputDirectory,
    })
    if (!codegenedResult) {
      return []
    }
    return [codegenedResult]
    // fs.writeFileSync(newFilePath, code)
  } else {
    // not a glass file
    return []
  }
}
function recursiveCodegen(workspaceFolder: string, folderPath: string, language: string, outputDirectory: string) {
  const files = fs.readdirSync(folderPath)
  const functions: any = []
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    functions.push(...transpileGlassHelper(workspaceFolder, filePath, language, outputDirectory))
  }
  return functions
}

export function getGlassExportName(filePath: string) {
  let fileName = filePath.split('/').pop() || ''
  if (fileName.endsWith('.glass')) {
    fileName = fileName.slice(0, -6)
  }

  const functionName = camelcase(fileName)

  const prefixGet = !(functionName.startsWith('get') && functionName[3] === functionName[3].toUpperCase())
  return `${prefixGet ? `get${functionName.slice(0, 1).toUpperCase() + functionName.slice(1)}` : functionName}Prompt`
}
