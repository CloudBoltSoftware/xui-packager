#!/usr/bin/env node

const parseArgs = require('minimist')
const Rsync = require('rsync')
const fs = require('fs')
const archiver = require('archiver');
const sha256File = require('sha256-file');

// get arguments after first two elements in process.argv
const args = parseArgs(process.argv.splice(2));
const XUI_DIR = args?.xui_dir || 'xui'
const xuiPackageDir = `${XUI_DIR}/${args.name}`
const sourceDir = args.source

async function main() {
  if (!args?.name || args?.name?.length === 0) {
    console.error("name argument is required")
    return
  }

  if (!args?.source || args?.source?.length === 0) {
    console.error("source argument is required")
    return
  }

  try {
    await cleanupZips()
  } catch(e) {
    console.warn('Unable to cleanup previous zip archives. Continuing.', e)
  }

  try {
    await copyFiles()
    console.log(`Successfully copied files from ${sourceDir}.`)
  } catch (e) {
    console.error('Error copying files. Exiting.', e)
    return
  }

  try {
    await createXuiJson()
    console.log('Successfully created XUI metadata JSON file.')
  } catch (e) {
    console.error('Error creating json metdata file. Exiting.', e)
    return
  }

  try {
    await createZip()
    console.log('Successfully created zip archive')
  } catch(e) {
    console.error('Error creating zip archive.', e)
    return
  }
}
main()

// remove existing zip archives from past runs
async function cleanupZips() {
  const files = listDirContents(XUI_DIR, [], false)
  try {
    for(const f of files) {
      if(f.endsWith('.zip')) {
        await fs.unlinkSync(f)
      }
    }
    return Promise.resolve()
  } catch(e) {
    return Promise.reject(e)
  }
}

// sync prod-build files into the xui directory
function copyFiles() {
  return new Promise((resolve, reject) => {
    const rsync = new Rsync()
    .source(`${sourceDir}/*`)
    .recursive()
    .destination(`${xuiPackageDir}/static`)
    .delete()
    
    if(args?.exclude) {
      rsync.exclude(args.exclude)    
    }
    
    rsync.execute((error) => {
      if(!error) {
        resolve()
      } else {
        reject(error)
      }
    })
  })
}

// create a json metadata file listing contents of our xui
function createXuiJson() {
  let files = []
  files = listDirContents(xuiPackageDir, files)
  files = files.map(f => {
    return f.replace(`${XUI_DIR}/`, '')
  });

  const data = {
    "name": args.name,
    "id": "XUI-12345",
    "label": args?.label || '',
    "description": args?.description || '',
    "enabled": true,
    "package_contents": files
  }

  try {
    fs.writeFileSync(`${XUI_DIR}/${args.name}.json`, JSON.stringify(data))
    return Promise.resolve()
  } catch (e) {
    return Promise.reject(e)
  }
    
}

function listDirContents(dir, fileList, recurse = true) {
  try {
    const dirContents = fs.readdirSync(dir, {withFileTypes: true})
    dirContents.forEach(f => {
      if(f.isDirectory() && recurse) {
        const subDirContents = listDirContents(`${dir}/${f.name}`, fileList)
        fileList.concat(subDirContents)
      } else {
        fileList.push(`${dir}/${f.name}`)
      }
    })
    return fileList
  } catch(err) {
    throw err
  } 
}
// first, zip the folder with our xui files
// then, zip that .zip and the metadata json file  
async function createZip() {
  try {
    await zipDir(`${XUI_DIR}/${args.name}`, args.name)
    await zipFiles(args.name)
    fs.unlinkSync(`${XUI_DIR}/${args.name}.zip`) //remove unneeded subfolder zip
    return Promise.resolve()
  } catch(e) {
    return Promise.reject(e)
  }
 
}

function zipDir(dir, name) {
  return new Promise( async (resolve, reject) => {
    const output = fs.createWriteStream(`${dir}.zip`);
    const archive = archiver('zip')

    archive.on('warning', function(err) {
      console.log(err)
      reject(err)
    });

    archive.on('error', function(err){
      console.log(err)
      reject(err);
    });

    archive.pipe(output);

    archive.directory(dir, name)

    await archive.finalize()
    resolve()
  });
}

function zipFiles(name) {
  return new Promise( async (resolve, reject) => {
    const zipFile = `${XUI_DIR}/${name}.zip`
    const metaFile = `${XUI_DIR}/${name}.json`
    const buildSha = sha256File(zipFile)
    const output = fs.createWriteStream(`${XUI_DIR}/${buildSha}.zip`);
    const archive = archiver('zip')

    archive.on('warning', function(err) {
      console.log(err)
      reject(err)
    });

    archive.on('error', function(err){
      console.log(err)
      reject(err);
    });

    archive.pipe(output);

    archive.file(zipFile, {name: `${name}.zip`})
    archive.file(metaFile, {name: `${name}.json`})

    await archive.finalize()
    resolve()
  })
}
