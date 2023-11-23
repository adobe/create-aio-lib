const { expect } = require('chai')
const sinon = require('sinon')
const fs = require('fs-extra')
const path = require('path')
const git = require('isomorphic-git')
const CreateAioLibCommand = require('../../src/commands/create')

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')

chai.use(chaiAsPromised)

describe('CreateAioLibCommand', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('copyTemplate', () => {
    it('should copy the template to the specified folder', async () => {
      // Arrange
      const toFolder = '/path/to/destination'
      const overwrite = true

      sandbox.stub(path, 'dirname').returns('/path/to/template')
      const copyStub = sandbox.stub(fs, 'copy').resolves('Copy successful')

      // Act
      await new CreateAioLibCommand().copyTemplate(toFolder, overwrite)

      // Assert
      await expect(copyStub.calledOnce).to.be.true
      await expect(copyStub.firstCall.args[0]).to.equal('/path/to/template')
      await expect(copyStub.firstCall.args[1]).to.equal(toFolder)
      await expect(copyStub.firstCall.args[2].overwrite).to.equal(overwrite)
    })

    it('should not overwrite existing files if overwrite is false', async () => {
      // Arrange
      const toFolder = '/path/to/destination'
      const overwrite = false

      sandbox.stub(path, 'dirname').returns('/path/to/template')
      const copyStub = sandbox.stub(fs, 'copy').resolves('Copy successful')

      // Act
      await new CreateAioLibCommand().copyTemplate(toFolder, overwrite)

      // Assert
      await expect(copyStub.calledOnce).to.be.true
      await expect(copyStub.firstCall.args[0]).to.equal('/path/to/template')
      await expect(copyStub.firstCall.args[1]).to.equal(toFolder)
      await expect(copyStub.firstCall.args[2].overwrite).to.equal(overwrite)
    })
  })

  describe('cloneRepo', () => {
    it('should clone the repository', async () => {
      // Arrange
      const url = 'https://example.com/repo.git'
      const toFolder = '/path/to/destination'
      const cloneStub = sandbox.stub(git, 'clone').resolves('Clone successful')

      // Act
      await new CreateAioLibCommand().cloneRepo(url, toFolder)

      // Assert
      await expect(cloneStub.calledOnce).to.be.true
      await expect(cloneStub.firstCall.args[0].url).to.equal(url)
      await expect(cloneStub.firstCall.args[0].dir).to.equal(toFolder)
    })
  })

  describe('removeDotGitFolder', () => {
    it('should remove the .git folder', async () => {
      // Arrange
      const repoFolder = '/path/to/repository'
      const removeStub = sandbox.stub(fs, 'remove').resolves('Remove successful')

      // Act
      await new CreateAioLibCommand().removeDotGitFolder(repoFolder)

      // Assert
      await expect(removeStub.calledOnce).to.be.true
      await expect(removeStub.firstCall.args[0]).to.equal(path.join(repoFolder, '.git'))
    })
  })

  describe('readParametersFile', () => {
    it('should throw an error if parameters file does not exist', async () => {
      // Arrange
      const repoFolder = 'create-aio-lib'
      sandbox.stub(fs, 'pathExists').resolves(false)

      // Act and Assert
      await expect(new CreateAioLibCommand().readParametersFile(repoFolder)).to.be.rejectedWith(
        `template.parameters.json does not exist in ${repoFolder}`
      )
    })
  })

  describe('updatePackageJson', () => {
    it('should update the package.json file', async () => {
      // Arrange
      const repoFolder = '/path/to/repository'
      const repoName = 'example/repo'
      sandbox.stub(fs, 'pathExists').resolves(true)
      sandbox.stub(fs, 'readJson').resolves({ name: 'oldName' })
      sandbox.stub(fs, 'writeJson').resolves('Write successful')

      // Act
      await new CreateAioLibCommand().updatePackageJson(repoFolder, repoName)

      // Assert
      const expectedJson = {
        bugs: {
          url: 'https://github.com/example/repo/issues'
        },
        homepage: 'https://github.com/example/repo',
        name: '@example/repo',
        repository: 'https://github.com/example/repo',
        version: '0.0.1'
      }
      await expect(fs.writeJson.calledOnce).to.be.true
      await expect(fs.writeJson.firstCall.args[0]).to.equal(path.join(repoFolder, 'package.json'))
      await expect(fs.writeJson.firstCall.args[1]).to.deep.equal(expectedJson)
    })

    it('should throw an error if package.json file does not exist', async () => {
      // Arrange
      const repoFolder = '/path/to/repository'

      // Stub the fs.pathExists function to resolve with false
      sinon.stub(fs, 'pathExists').resolves(false)

      // Instantiate your command class
      const yourCommand = new CreateAioLibCommand()

      // Act and Assert
      await expect(yourCommand.updatePackageJson(repoFolder, 'example/repo')).to.be.rejected
    })
  })
})
