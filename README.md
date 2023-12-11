# CloudBolt XUI Packager

A helper tool called `xui` for the terminal that creates zip directories and metadata files necessary for turning a production build of a JS app into a XUI package for CMP.

## Installation

Use as a global cli tool:

```bash
npm install -g @cloudbolt/xui-packager
```

Or as a dev dependency to use in npm scripts:

```bash
npm install --save-dev @cloudbolt/xui-packager
```

## Usage

### CLI Interface

Pass arguments like normal command line arguments, either `--flag=value` or `--flag value` like `xui --source=dist --name=${npm_package_config_xuiName} --exclude=index.html --exclude=vite.svg`. They are parsed with [minimist](https://www.npmjs.com/package/minimist)

Any argument is valid, but most are ignored. These are the expected ones (all others are ignored):

- `--name NAME` **Required** name for the xui's identifier and unpacked directory
- `--id ID` **Required** CUI Global id in the form of `XUI-xxxxxxxx` where x is any number or lowercase letter.
- `--vue_source DIRECTORY` Source files directory for built vue files. Defaults to `dist`
- `--xui_src DIRECTORY` Source for xui files like `views.py` and others. Defaults to `xui/src`
- `--additional_files_src DIRECTORY` Source for additional files to be bundled into the final zip. Defaults to `xui/additional_files`
- `--output DIRECTORY` Where the xui gets saved. Defaults to `xui/dist`
- `--exclude PATH` Can be added multiple times. Will ignore listed files in vue source directory (paths should be relative to it)
- `--icon PATH` Icon file to add to the zipped XUI and pointed to in the metadata.

In addition, any other argument that's prepended with `met` gets added to the metadata. Important examples and how the content library or CloudBolt uses them (note the underscores in the keys):

- `--met_description "TEXT"` Content Library Description. Make sure to quote arguments that have spaces in them.
- `--met_label LABEL` Human-readable version of the name.
- `--met_version VERSION` XUI version. By default, this is read from the package.json's `version` field.
- `--met_minimum_version_required VERSION` Minimum CloudBolt version number for the XUI
- `--met_maximum_version_required VERSION` Maximum CloudBolt version number for the XUI
- `--met_last_updated YYYY-MM-DD` Defaults to today unless specified
- `--met_inbound_web_hook_dependencies` Optional array of inbound web hook ZIP files that are dependencies for the XUI. ZIP files should be in `xui/additional_files` or the custom directory argument provided to `--additional_files_src` 

Paths are relative to the directory in which the command is run (this is the project root if run as an npm script) unless otherwise stated above.

### Package.json Interface

As a convenience, you can also supply arguments in a `configXui` field in `package.json` that will be read when used in npm scripts. Any arguments passed by command-line will take precidence, so these are good for defaults. They are loaded with [load-pkg](https://www.npmjs.com/package/load-pkg). Example `package.json` fragment:

```json
{
  ...
  "configXui": {
    "name": "cui",
    "id": "XUI-cui12345",
    "exclude": ["index.html", "vite.svg"],
    "icon": "xui/CUI.png",
    "met_description": "Next-Gen Consumer UI.\n\nAn end-user focused interface that brings a modern, responsive, snappy experience to CloudBolt's best-in-class functionality.\n\nCurrently in BETA.",
    "met_label": "CUI Beta",
    "met_maximum_version_required": "",
    "met_minimum_version_required": "2022.4.2",
    "met_inbound_web_hook_dependencies": [
      "inbound_web_hook_upload_file.zip",
      "inbound_web_hook_download_file.zip"
    ],
  },
  "scripts": {
    ...
    "makeXui": "xui --met_built_on \"$(date)\""
  }
}
```

## Development (for maintainers)

### How to publish a new version

1. Increment the version of the `package.json` for this project and do an install to be sure the `package-lock.json` is up to date as well.
   - The command `npm version patch` does this for you. It creates a git tag too.
   - `npm version prepatch --preid beta` will make a beta version.
   - `npm version custom-version` is also valid.
1. Run the command `npm publish --access public` to publish this version to npm
