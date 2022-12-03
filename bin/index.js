#!/usr/bin/env node

const parseArgs = require("minimist");
const Rsync = require("rsync");
const fs = require("fs");
const archiver = require("archiver");
const sha256File = require("sha256-file");
const path = require("path");

/**
 * @typedef {Object} Config
 * @prop {string} name
 * @prop {string} source
 * @prop {string} vueSrcDir
 * @prop {string} xuiSrcDir
 * @prop {string} outputDir
 * @prop {object} extraMetadata
 * @prop {string[]} excludes
 * @prop {string} [iconFilename]
 * @prop {string} [iconPath]
 */

/**
 * @return {Config}
 */
function parseConfigFromArgs() {
  // get arguments after first two elements in process.argv
  // See minimist docs for more https://www.npmjs.com/package/minimist
  const args = parseArgs(process.argv.slice(2));

  if (!args?.name || args?.name?.length === 0) {
    console.error("name argument is required");
    return;
  }

  const vueSrcDir = args.vue_src || "dist";
  const xuiSrcDir = args.xui_src || "xui/src";
  const outputDir = args.output || "xui/dist";
  const name = args.name;
  const icon = args?.icon;
  const excludes = args?.exclude;

  // Metadata is any argument whose key begins with `met-`. Strip that and collect it.
  const extraMetadata = Object.entries(args).reduce(
    (metadata, [key, value]) => {
      if (key.startsWith("met-")) {
        const newKey = key.replace("met-", "");
        metadata[newKey] = value;
      }
      return metadata;
    },
    {}
  );

  const config = {
    vueSrcDir,
    xuiSrcDir,
    outputDir,
    name,
    excludes,
    extraMetadata,
  };

  if (icon) {
    config.iconPath = icon;
    config.iconFilename = path.basename(icon);
  }

  return config;
}

async function main() {
  const config = parseConfigFromArgs();

  try {
    await createOutputDir(config.outputDir);
  } catch (e) {
    console.error("Error creating output directory", e);
    return;
  }

  try {
    await cleanupZips(config);
  } catch (e) {
    console.warn("Unable to cleanup previous zip archives. Continuing.", e);
  }

  try {
    await copyFiles(config);
    console.log(`Successfully copied files from ${config.vueSrcDir}.`);
  } catch (e) {
    console.error("Error copying files. Exiting.", e);
    return;
  }

  try {
    await createXuiJson(config);
    console.log("Successfully created XUI metadata JSON file.");
  } catch (e) {
    console.error("Error creating json metdata file. Exiting.", e);
    return;
  }

  try {
    const zipLocation = await createContentLibraryZip(config);
    console.log(`Successfully created zip archive at ${zipLocation}.`);
  } catch (e) {
    console.error("Error creating zip archive.", e);
    return;
  }
}
main();

/**
 * @param {string} outputDir path to output directory
 * @returns {Promise<void>}
 */
function createOutputDir(outputDir) {
  return new Promise((resolve, reject) => {
    fs.mkdir(outputDir, { recursive: true }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * remove existing zip archives from past runs
 * @param {Config} config
 */
async function cleanupZips({ outputDir }) {
  const files = listDirContents(outputDir, [], false);
  try {
    for (const f of files) {
      if (f.endsWith(".zip")) {
        await fs.unlinkSync(f);
      }
    }
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
  }
}

/**
 * sync prod-build files into the xui directory
 * @param {Config} config
 */
function copyFiles({ vueSrcDir, xuiSrcDir, excludes }) {
  return new Promise((resolve, reject) => {
    const rsync = new Rsync()
      .source(`${vueSrcDir}/*`)
      .recursive()
      .destination(`${xuiSrcDir}/static`)
      .delete();

    rsync.exclude(excludes);
    rsync.execute((error) => {
      if (!error) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

/**
 * create a json metadata file listing contents of our xui
 * @param {Config} config
 */
function createXuiJson({
  xuiSrcDir,
  outputDir,
  name,
  extraMetadata,
  iconFilename,
}) {
  let files = [];
  files = listDirContents(xuiSrcDir, files);
  files = files.map((f) => {
    return f.replace(`${xuiSrcDir}/`, "");
  });

  const xuiMetadata = {
    name: name,
    id: "XUI-12345",
    enabled: true,
    package_contents: files,
    ...extraMetadata,
  };

  if (iconFilename) {
    xuiMetadata.icon = iconFilename;
  }

  const metadataString = JSON.stringify(xuiMetadata, null, 2);

  try {
    fs.writeFileSync(`${outputDir}/${name}.json`, metadataString);
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
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
  try {
    const dirContents = fs.readdirSync(dir, { withFileTypes: true });
    dirContents.forEach((f) => {
      if (f.isDirectory() && recurse) {
        const subDirContents = listDirContents(`${dir}/${f.name}`, fileList);
        fileList.concat(subDirContents);
      } else {
        fileList.push(`${dir}/${f.name}`);
      }
    });
    return fileList;
  } catch (err) {
    throw err;
  }
}

/**
 * Create the Content Library zip archive
 * first, zip the folder with our xui files
 * then, zip that .zip and the metadata json file
 * @param {Config} config
 * @returns {Promise[string]} resolves to the path of the zip archive
 */
async function createContentLibraryZip(config) {
  const { outputDir, name, iconFilename } = config;
  try {
    await zipXuiPackageFiles(config);
    const contentZipPath = await zipContentLibraryPackageFiles(config);

    // Clean up files we don't need anymore
    fs.unlinkSync(`${outputDir}/${name}.zip`);
    fs.unlinkSync(`${outputDir}/${name}.json`);

    return Promise.resolve(contentZipPath);
  } catch (e) {
    return Promise.reject(e);
  }
}

/**
 * Zip the directory containing our xui files.
 * @param {Config} config
 */
function zipXuiPackageFiles({ outputDir, xuiSrcDir, name }) {
  return new Promise(async (resolve, reject) => {
    const outputFilePath = `${outputDir}/${name}.zip`;
    const output = fs.createWriteStream(outputFilePath);
    const archive = archiver("zip");

    archive.on("warning", function (err) {
      console.log(err);
      reject(err);
    });

    archive.on("error", function (err) {
      console.log(err);
      reject(err);
    });

    archive.pipe(output);

    archive.directory(xuiSrcDir, name);

    await archive.finalize();
    resolve(outputFilePath);
  });
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
  iconFilename,
}) {
  return new Promise(async (resolve, reject) => {
    const zipFile = `${outputDir}/${name}.zip`;
    const metaFile = `${outputDir}/${name}.json`;
    const buildShaShort = sha256File(zipFile).slice(0, 7);
    const outputFilePath = `${outputDir}/${name}-${buildShaShort}.zip`;
    const output = fs.createWriteStream(outputFilePath);
    const archive = archiver("zip");

    archive.on("warning", function (err) {
      console.log(err);
      reject(err);
    });

    archive.on("error", function (err) {
      console.log(err);
      reject(err);
    });

    archive.pipe(output);

    archive.file(zipFile, { name: `${name}.zip` });
    archive.file(metaFile, { name: `${name}.json` });
    if (iconPath) {
      archive.file(iconPath, { name: iconFilename });
    }

    await archive.finalize();
    resolve(outputFilePath);
  });
}
