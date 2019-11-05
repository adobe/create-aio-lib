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

const { Command, flags } = require('@oclif/command')
const execa = require('execa');
const Listr = require('listr');
const rimraf = require('rimraf')
const debug = require('debug')('create-aio-lib')
const path = require('path')
const git = require('isomorphic-git');
const fs = require('fs');
git.plugins.set('fs', fs)

class CreateAioLibCommand extends Command {
  async run () {
    const { args, flags } = this.parse(CreateAioLibCommand)
    // capitalize first letter of the lib name
    const libName = args.libName[0].toUpperCase() + args.libName.substring(1)
    debug(`Capitalize '${args.libName}' --> '${libName}'`)

    // 1. Download the template from a url (git)
    // 2. Read the template.parameters.json file
    // 3. For each file listed in the template.parameters.json file, we replace the token
    // 4. Print the location of the library
    const templateUrl = flags.templateUrl || "https://github.com/adobe/aio-lib-template.git"
    const outputFolder = path.resolve(flags.outputDir) || process.cwd()
    const templateFolder = path.join(outputFolder, args.libName)

    const tasks = new Listr([
      {
        title: "Cloning template",
        task: ctx => this.cloneRepo(ctx.templateUrl, ctx.templateFolder)
      },
      {
        title: "Remove .git folder",
        task: ctx => this.removeDotGitFolder(ctx.templateFolder)
      },
      {
        title: "Read parameters file",
        task: async ctx => {
          ctx.paramsJson = await this.readParametersFile(templateFolder)
        }
      },
      {
        title: "Replacing text",
        task: ctx => this.replaceText(ctx.templateFolder, ctx.paramsJson, ctx.libName, ctx.repoName)
      },
      {
        title: "Lib Location",
        task: (ctx, task) => {
          task.title = `Lib created at ${ctx.templateFolder}`
        }
      }
    ])

    tasks.run({
      templateUrl,
      templateFolder,
      libName,
      repoName: args.repoName
    })
  }

  async cloneRepo(url, toFolder) {
    const cloneOptions = {
      dir: toFolder,
      url: url,
      singleBranch: true,
      depth: 1
    }
    debug('Clone options', cloneOptions)
    this.log(`Cloning ${url}...`)
    await git.clone(cloneOptions)
  }

  async removeDotGitFolder(repoFolder) {
    // remove .git folder
    const dotGitFolder = path.join(repoFolder, '.git')
    rimraf(dotGitFolder, (err) => {
      if (err) {
        this.error(err)
      } 
    })
    debug(`Removed .git folder at ${dotGitFolder}`)
  }

  async readParametersFile(repoFolder) {
    // read the template.parameters.json file
    const paramsFileName = 'template.parameters.json'
    const paramsFile = path.join(repoFolder, paramsFileName)

    if (!fs.existsSync(paramsFile)) {
      throw new Error(`${paramsFile} does not exist in ${templateUrl}`)
    }

    debug(`Read parameters file at ${paramsFile}`)
    return require(paramsFile)
  }

  async replaceText(repoFolder, paramsJson, libName, repoName) {
    const toFrom = {
      '{{REPO}}': repoName,
      '{{LIB_NAME}}': libName,
      'LibNameCoreAPI': libName
    }

    debug(`Replacement mapping: ${toFrom}`)

    Object.keys(paramsJson).forEach(async from => {
      // add the path to the filenames
      const files = paramsJson[from].map(elem => path.join(repoFolder, elem))
      debug(`File list for ${from}: ${files}`)
      
      // get the replacement string
      const to = toFrom[from]
      if (!to) {
        console.error(`No mapping found, skipping replace of ${from}`)
        return
      }

      // escape curly braces
      from = from.replace(/\{/g, '\\{').replace(/\}/g, '\\}')
      debug(`Escaped token to ${from}`)

      // replace
      files.forEach(file => {
        const contents = fs.readFileSync(file, "utf-8")
        fs.writeFileSync(file, contents.replace(new RegExp(from, 'g'), to))
        debug(`Replaced ${from} to ${to} in ${file}`)
      })
    })
  }
}

CreateAioLibCommand.description = `Creates an AIO Lib`

CreateAioLibCommand.flags = {
  version: flags.version({ char: 'v' }), // add --version flag to show CLI version
  help: flags.help({ char: 'h' }), // add --help flag to show CLI help
  outputDir: flags.string({ char: 'o', description: 'folder to output the library in (defaults to the current working folder)' }),
  templateUrl: flags.string({ char: 't', description: 'the template to use' })
}

CreateAioLibCommand.args = [
  { name: 'libName', required: true, description: 'the name of the library' },
  { name: 'repoName', required: true, description: 'the repo of the library' }
]

module.exports = CreateAioLibCommand