#!/usr/bin/env node

const parseArgs = require('minimist')
const Rsync = require('rsync')
const fs = require('fs')
const archiver = require('archiver')
const sha256File = require('sha256-file')
const path = require('path')
const load = require('load-pkg')

/**
 * @typedef {Object} Config
 * @prop {string} name
 * @prop {string} id
 * @prop {string} source
 * @prop {string} vueSrcDir
 * @prop {string} xuiSrcDir
 * @prop {string} outputDir
 * @prop {object} extraMetadata
 * @prop {string[]} exclude
 * @prop {string} [iconFilename]
 * @prop {string} [iconPath]
 */

const defaultConfig = {
  vueSrcDir: 'dist',
  xuiSrcDir: 'xui/src',
  outputDir: 'xui/dist',
  extraMetadata: {
    enabled: true
  }
}

function parseConfigFromPackageJson() {
  // get arguments from package.json's `xuiConfig` field
  // get version from package.json's version field if not met_version not in xuiConfig.
  const packageJson = load.sync() || {}
  const args = packageJson.xuiConfig || {}
  if (!args.met_version) args.met_version = packageJson.version
  return parseConfig(args)
}

function parseConfigFromArgs() {
  // get arguments after first two elements in process.argv
  // See minimist docs for more https://www.npmjs.com/package/minimist
  const args = parseArgs(process.argv.slice(2))
  return parseConfig(args)
}

/**
 * Create a config object from the arguments passed in.
 * Only add fields that are relevant from the args object so we can cleanly union multiple configs.
 * @param {object} config Object with arbitrary attributes as explained in the README
 * @return {Config}
 */
function parseConfig(args) {
  const config = {}

  // copy over basic fields
  // Note: 'exclude' paths are relative to vueSrcDir but should be relative to the running dir.
  // We'll fix that later in fixExcludePaths so we can take the right vueSrcDir.
  ;['vue_src', 'xui_src', 'output', 'name', 'exclude', 'id'].forEach(
    (field) => {
      if (args[field]) config[field] = args[field]
    }
  )

  // add icon path and filename if icon is specified
  if (args.icon) {
    config.iconPath = args.icon
    config.iconFilename = path.basename(args.icon)
  }

  // Metadata is any argument whose key begins with `met-`. Strip the prefix and
  // add it to the config.
  const extraMetadata = Object.entries(args).reduce(
    (metadata, [key, value]) => {
      if (key.startsWith('met_')) {
        const newKey = key.replace('met_', '')
        metadata[newKey] = value
      }
      return metadata
    },
    {}
  )
  if (Object.keys(extraMetadata).length) {
    config.extraMetadata = extraMetadata
  }

  return config
}

function combineConfigs(...configs) {
  return configs.reduce((combined, config) => {
    return {
      ...combined,
      ...config,
      exclude: [...(combined.exclude || []), ...(config.exclude || [])],
      extraMetadata: {
        ...combined.extraMetadata,
        ...config.extraMetadata
      }
    }
  }, {})
}

/**
 * @param {Config} config
 * @throws {Error} if any required config is missing
 */
function checkConfigRequirements(config) {
  const requiredKeys = ['id', 'name']
  for (const key of requiredKeys) {
    if (!config[key]) throw new Error(`${key} is required`)
  }

  // Check that id is in the format XXX-xxxxxxxx
  if (!config.id.match(/^[A-Z]{3}-[0-9a-z]{8}$/i)) {
    throw new Error(
      `id must be in the format "XXX-xxxxxxxx" where "XXX" is any 3 uppercase letters (generally XUI or APL) and "x" is any number or lowercase letter. Received "${config.id}"`
    )
  }
}

async function main() {
  const configPackage = parseConfigFromPackageJson()
  const configArgs = parseConfigFromArgs()
  const config = combineConfigs(defaultConfig, configPackage, configArgs)
  console.log('Creating XUI using the following config: ', config)

  try {
    checkConfigRequirements(config)
  } catch (e) {
    console.error(e)
    return
  }

  try {
    await createOutputDir(config.outputDir)
  } catch (e) {
    console.error('Error creating output directory', e)
    return
  }

  try {
    await cleanupZips(config)
  } catch (e) {
    console.warn('Unable to cleanup previous zip archives. Continuing.', e)
  }

  try {
    await copyFiles(config)
    console.log(`Successfully copied files from ${config.vueSrcDir}.`)
  } catch (e) {
    console.error('Error copying files. Exiting.', e)
    return
  }

  try {
    await createXuiJson(config)
    console.log('Successfully created XUI metadata JSON file.')
  } catch (e) {
    console.error('Error creating json metdata file. Exiting.', e)
    return
  }

  try {
    const zipLocation = await createContentLibraryZip(config)
    console.log(`Successfully created zip archive at ${zipLocation}.`)
  } catch (e) {
    console.error('Error creating zip archive.', e)
    return
  }
}
// Run main if this file is called directly
if (require.main === module) main()

/**
 * @param {string} outputDir path to output directory
 * @returns {Promise<void>}
 */
function createOutputDir(outputDir) {
  return new Promise((resolve, reject) => {
    fs.mkdir(outputDir, { recursive: true }, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/**
 * remove existing zip archives from past runs
 * @param {Config} config
 */
async function cleanupZips({ outputDir }) {
  const files = listDirContents(outputDir, [], false)
  try {
    for (const f of files) {
      if (f.endsWith('.zip')) {
        await fs.unlinkSync(f)
      }
    }
    return Promise.resolve()
  } catch (e) {
    return Promise.reject(e)
  }
}

/**
 * sync prod-build files into the xui directory
 * @param {Config} config
 * @returns {Promise<Rsync>}
 */
function copyFiles({ vueSrcDir, xuiSrcDir, exclude }) {
  return new Promise((resolve, reject) => {
    const rsync = new Rsync()
      .source(`${vueSrcDir}/*`)
      .recursive()
      .destination(`${xuiSrcDir}/static`)
      .delete()
      .exclude(exclude)
      .execute((error) => {
        if (error) reject(error)
        resolve()
      })
    resolve(rsync)
  })
}

/**
 * create a json metadata file listing contents of our xui
 * @param {Config} config
 */
function createXuiJson({
  xuiSrcDir,
  outputDir,
  name,
  id,
  extraMetadata,
  iconFilename
}) {
  // get file paths relative to xuiSrcDir
  let filePaths = []
  // listDirContents will mutate filePaths
  filePaths = listDirContents(xuiSrcDir, filePaths)
  filePaths = filePaths.map((f) => {
    return f.replace(`${xuiSrcDir}/`, '')
  })

  const xuiMetadata = {
    name,
    id,
    // set last_update to today's date in YYYY-MM-DD format
    last_updated: new Date().toISOString().split('T')[0],
    package_contents: filePaths,
    ...extraMetadata
  }

  if (iconFilename) {
    xuiMetadata.icon = iconFilename
  }

  const metadataString = JSON.stringify(xuiMetadata, null, 2)

  try {
    fs.writeFileSync(`${outputDir}/${name}.json`, metadataString)
    return Promise.resolve()
  } catch (e) {
    return Promise.reject(e)
  }
}

/**
 * list all files in a directory
 * @param {string} dir directory to list contents of
 * @param {string[]} fileList list of files to append to (gets mutated)
 * @param {bool} recurse whether to recurse into subdirectories
 * @returns {string[]} list of files
 */
function listDirContents(dir, fileList, recurse = true) {
  const dirContents = fs.readdirSync(dir, { withFileTypes: true })
  dirContents.forEach((f) => {
    if (f.isDirectory() && recurse) {
      const subDirContents = listDirContents(`${dir}/${f.name}`, fileList)
      fileList.concat(subDirContents)
    } else {
      fileList.push(`${dir}/${f.name}`)
    }
  })
  return fileList
}

/**
 * Create the Content Library zip archive
 * first, zip the folder with our xui files
 * then, zip that .zip and the metadata json file
 * @param {Config} config
 * @returns {Promise[string]} resolves to the path of the zip archive
 */
async function createContentLibraryZip(config) {
  const { outputDir, name } = config
  try {
    await zipXuiPackageFiles(config)
    const contentZipPath = await zipContentLibraryPackageFiles(config)

    // Clean up files we don't need anymore
    fs.unlinkSync(`${outputDir}/${name}.zip`)
    fs.unlinkSync(`${outputDir}/${name}.json`)

    return Promise.resolve(contentZipPath)
  } catch (e) {
    return Promise.reject(e)
  }
}

/**
 * Zip the directory containing our xui files.
 * @param {Config} config
 */
function zipXuiPackageFiles({ outputDir, xuiSrcDir, name }) {
  return new Promise((resolve, reject) => {
    const outputFilePath = `${outputDir}/${name}.zip`
    const output = fs.createWriteStream(outputFilePath)
    const archive = archiver('zip')

    archive.on('warning', function (err) {
      console.log(err)
      reject(err)
    })

    archive.on('error', function (err) {
      console.log(err)
      reject(err)
    })

    archive.pipe(output)

    archive.directory(xuiSrcDir, name)

    archive.finalize().then(() => resolve(outputFilePath))
  })
}

/**
 * Zip up our XUI zip, metadata json, and icon.
 * @param {Config} config
 * @returns {Promise[string]} resolves to the path of the zip archive
 */
function zipContentLibraryPackageFiles({
  outputDir,
  name,
  iconPath,
  iconFilename
}) {
  return new Promise((resolve, reject) => {
    const zipFile = `${outputDir}/${name}.zip`
    const metaFile = `${outputDir}/${name}.json`
    const buildShaShort = sha256File(zipFile).slice(0, 7)
    const outputFilePath = `${outputDir}/${name}-${buildShaShort}.zip`
    const output = fs.createWriteStream(outputFilePath)
    const archive = archiver('zip')

    archive.on('warning', function (err) {
      console.log(err)
      reject(err)
    })

    archive.on('error', function (err) {
      console.log(err)
      reject(err)
    })

    archive.pipe(output)

    archive.file(zipFile, { name: `${name}.zip` })
    archive.file(metaFile, { name: `${name}.json` })
    if (iconPath) {
      archive.file(iconPath, { name: iconFilename })
    }

    archive.finalize().then(() => resolve(outputFilePath))
  })
}

// Export functions for testing
module.exports = {
  checkConfigRequirements,
  cleanupZips,
  combineConfigs,
  copyFiles,
  createContentLibraryZip,
  createOutputDir,
  createXuiJson,
  listDirContents,
  main,
  parseConfig,
  parseConfigFromArgs,
  parseConfigFromPackageJson,
  zipContentLibraryPackageFiles,
  zipXuiPackageFiles
}
