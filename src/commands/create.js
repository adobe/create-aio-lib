/* eslint-disable unicorn/prefer-module */
/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { Command, Flags } = require('@oclif/core')
const { Listr } = require('listr2')
const fse = require('fs-extra')
const debug = require('debug')('create-aio-lib')
const path = require('path')
const git = require('isomorphic-git')

class CreateAioLibCommand extends Command {
  async run () {
    const { args, flags } = await this.parse(CreateAioLibCommand)
    // capitalize first letter of the lib name
    const libName = args.libName[0].toUpperCase() + args.libName.slice(1)
    debug(`Capitalize '${args.libName}' --> '${libName}'`)

    const templateUrl = flags.templateUrl
    const outputFolder = flags.outputDir || process.cwd()
    const templateFolder = path.join(outputFolder, args.libName)

    let repoName = args.repoName
    if (repoName.startsWith('@')) { // strip leading @
      repoName = repoName.slice(1)
    }

    if (await fse.pathExists(templateFolder) && !flags.overwrite) {
      this.error(`Destination ${templateFolder} exists, use the '--overwrite' flag to overwrite.`)
    }

    const cloneTemplateStep = {
      task: (ctx, task) => {
        task.title = `Cloning template from ${ctx.templateUrl}`
        this.cloneRepo(ctx.templateUrl, ctx.templateFolder)
      }
    }

    const steps = [
      {
        title: 'Copy template',
        task: async ctx => this.copyTemplate(ctx.templateFolder, ctx.overwrite)
      },
      {
        title: 'Remove .git folder',
        task: async ctx => this.removeDotGitFolder(ctx.templateFolder)
      },
      {
        title: 'Read parameters file',
        task: async ctx => {
          // false positive for eslint rule

          ctx.paramsJson = await this.readParametersFile(ctx.templateFolder)
        }
      },
      {
        title: 'Update package.json',
        task: async ctx => {
          await this.updatePackageJson(ctx.templateFolder, ctx.repoName)
        }
      },
      {
        title: 'Replace text',
        task: ctx => this.replaceText(ctx.templateFolder, ctx.paramsJson, ctx.libName, ctx.repoName)
      },
      {
        title: 'Cleanup',
        task: ctx => this.cleanup(ctx.templateFolder)
      },
      {
        title: 'Lib Location',
        task: (ctx, task) => {
          task.title = `Lib created at ${ctx.templateFolder}`
        }
      }
    ]

    if (templateUrl) {
      steps[0] = cloneTemplateStep
    }

    const tasks = new Listr(steps)
    tasks
      .run({
        templateUrl: flags.templateUrl,
        templateFolder,
        libName,
        repoName,
        overwrite: flags.overwrite
      })
      .catch(error => {
        this.error(error.message)
      })
  }

  async copyTemplate (toFolder, overwrite) {
    // will only work if the module is CommonJs (unless for ESM package.json is exported) - finds the module root path
    const from = path.dirname(require.resolve('@adobe/aio-lib-template/package.json'))
    return fse.copy(from, toFolder, { overwrite, errorOnExist: !overwrite })
  }

  async cloneRepo (url, toFolder) {
    const cloneOptions = {
      fs: fse,
      dir: toFolder,
      url,
      singleBranch: true,
      depth: 1
    }
    debug('Clone options', cloneOptions)
    this.log(`Cloning ${url}...`)
    await git.clone(cloneOptions)
  }

  async removeDotGitFolder (repoFolder) {
    // remove .git folder
    const dotGitFolder = path.join(repoFolder, '.git')
    return fse.remove(dotGitFolder)
  }

  async readParametersFile (repoFolder) {
    // read the template.parameters.json file
    const paramsFileName = 'template.parameters.json'
    const paramsFile = path.join(repoFolder, paramsFileName)

    if (!(await fse.pathExists(paramsFile))) {
      throw new Error(`${paramsFileName} does not exist in ${repoFolder}`)
    }

    debug(`Read parameters file at ${paramsFile}`)
    return require(paramsFile)
  }

  async updatePackageJson (repoFolder, repoName) {
    const packageJsonFile = path.join(repoFolder, 'package.json')

    if (!(await fse.pathExists(packageJsonFile))) {
      throw new Error(`${packageJsonFile} does not exist in ${repoFolder}`)
    }

    const json = await fse.readJson(packageJsonFile)
    json.bugs = json.bugs || {}

    // replace name and repository fields
    json.name = `@${repoName}`
    json.repository = `https://github.com/@${repoName}`
    json.homepage = `https://github.com/@${repoName}`
    json.bugs.url = `https://github.com/@${repoName}/issues`
    json.version = '0.0.1'

    // get all underscored keys, and remove them
    for (const key of Object.keys(json)
      .filter(key => key.startsWith('_'))) delete json[key]

    return fse.writeJson(packageJsonFile, json, { spaces: 2 })
  }

  async cleanup (repoFolder) {
    const filesToRemove = ['types.d.ts', 'template.parameters.json']

    for (const filePath of filesToRemove
      .map(file => path.join(repoFolder, file))) fse.remove(filePath)

    const filesToRename = {
      'gitignore.template': '.gitignore',
      'npmrc.template': '.npmrc'
    }

    for (const key of Object.keys(filesToRename)) {
      const value = filesToRename[key]
      fse.move(path.join(repoFolder, key), path.join(repoFolder, value))
    }
  }

  async replaceText (repoFolder, paramsJson, libName, repoName) {
    const toFrom = {
      '{{REPO}}': repoName,
      '{{LIB_NAME}}': libName,
      LibNameCoreAPI: libName
    }
    debug(`Replacement mapping: ${toFrom}`)

    // Get all file paths into a set
    const pathItemSet = Object.keys(paramsJson)
      .reduce((set, key) => { // eslint-disable-line unicorn/no-array-reduce
        const values = paramsJson[key]
        return new Set([...set, ...values])
      }, new Set())

    // eslint-disable-next-line unicorn/no-array-for-each
    pathItemSet.forEach(async pathItem => {
      // find the tokens for the file path
      const tokens = []
      for (const token of Object.keys(paramsJson)) {
        if (paramsJson[token].includes(pathItem)) {
          tokens.push(token)
        }
      }

      // read the file once
      const filePath = path.join(repoFolder, pathItem)
      let fileContents = await fse.readFile(filePath, 'utf8')

      // replace the tokens in the file
      // eslint-disable-next-line unicorn/no-array-for-each
      tokens.forEach(async from => {
        const to = toFrom[from]
        if (!to) {
          console.error(`No mapping found, skipping replace of ${from}`)
          return
        }

        // escape curly braces
        from = from.replace(/{/g, '\\{').replace(/}/g, '\\}')
        debug(`Escaped token to ${from}`)

        fileContents = fileContents.replace(new RegExp(from, 'g'), to)
      })

      // write the altered file back
      if (tokens.length > 0) {
        await fse.writeFile(filePath, fileContents)
      }
    })
  }
}

CreateAioLibCommand.description = `Creates an Adobe I/O Lib

Example:
    create-aio-lib MyLibClass myOrg/myRepo
`

CreateAioLibCommand.flags = {
  version: Flags.version({ char: 'v' }), // add --version flag to show CLI version
  help: Flags.help({ char: 'h' }), // add --help flag to show CLI help
  outputDir: Flags.string({ char: 'o', description: 'folder to output the library in (defaults to the current working folder)' }),
  templateUrl: Flags.string({ char: 't', description: 'the template to use' }),
  overwrite: Flags.boolean({ char: 'w', default: false, description: 'overwrite any existing output folder' })
}

CreateAioLibCommand.args = [
  { name: 'libName', required: true, description: 'the name of the library' },
  { name: 'repoName', required: true, description: 'the repo of the library' }
]

module.exports = CreateAioLibCommand
