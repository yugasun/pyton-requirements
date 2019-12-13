const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')
const { spawnSync } = require('child_process')
const tomlParse = require('@iarna/toml/parse-string')

/**
 * Check if pyproject.toml file exists and is a poetry project.
 */
function isPoetryProject(servicePath) {
  const pyprojectPath = path.join(servicePath, 'pyproject.toml')

  if (!fse.existsSync(pyprojectPath)) {
    return false
  }

  const pyprojectToml = fs.readFileSync(pyprojectPath)
  const pyproject = tomlParse(pyprojectToml)

  const buildSystemReqs = (pyproject['build-system'] && pyproject['build-system']['requires']) || []

  for (var i = 0; i < buildSystemReqs.length; i++) {
    if (buildSystemReqs[i].startsWith('poetry')) {
      return true
    }
  }

  return false
}

/**
 * poetry install
 */
function pyprojectTomlToRequirements(servicePath, options) {
  if (!options.usePoetry || !isPoetryProject(servicePath)) {
    return
  }

  this.context.debug('Generating requirements.txt from pyproject.toml...')

  const res = spawnSync('poetry', ['export', '--without-hashes', '-f', 'requirements.txt'], {
    cwd: servicePath
  })
  if (res.error) {
    if (res.error.code === 'ENOENT') {
      throw new Error(`poetry not found! Install it according to the poetry docs.`)
    }
    throw new Error(res.error)
  }
  if (res.status !== 0) {
    throw new Error(res.stderr)
  }

  const editableFlag = new RegExp(/^-e /gm)
  const sourceRequirements = path.join(servicePath, 'requirements.txt')
  const requirementsContents =
    res.stdout.toString().trim() || // As of poetry 1.0.0b1, requirements.txt is printed to standard output when the -o option is not specified.
    fse.readFileSync(sourceRequirements, {
      encoding: 'utf-8'
    })

  if (requirementsContents.match(editableFlag)) {
    this.context.debug('The generated file contains -e lines, removing them...')
    fse.writeFileSync(sourceRequirements, requirementsContents.replace(editableFlag, ''))
  }

  fse.ensureDirSync(path.join(servicePath, '.serverless'))
  fse.moveSync(sourceRequirements, path.join(servicePath, '.serverless', 'requirements.txt'))
}

module.exports = { pyprojectTomlToRequirements }
