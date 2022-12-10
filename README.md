# CB XUI Packager

A helper tool called `xui` for the terminal that creates zip directories and metadata files necessary for turning a production build of a JS app into a XUI package for importing into CMP.

Pass arguments like normal command line arguments, either `--flag=value` or `--flag value` like `xui --source=dist --name=${npm_package_config_xuiName} --exclude=index.html --exclude=vite.svg`. They are parsed with [minimist](https://www.npmjs.com/package/minimist)

Any argument is valid, but most are ignored. These are the expected ones (all others are ignored):

- `--name NAME` **Required** snake_case name for the xui's identifier and unpacked directory
- `--vue_source DIRECTORY` Source files directory for built vue files. Defaults to `dist`
- `--xui_src DIRECTORY` Source for xui files like `views.py` and others. Defaults to `xui/src`
- `--output DIRECTORY` Where the xui gets saved. Defaults to `xui/dist`
- `--exclude PATH` Can be added multiple times. Will ignore listed files in vue source directory (paths should be relative to it)
- `--icon PATH` Icon file to add to the zipped XUI and pointed to in the metadata.

In addition, any other argument that's prepended with `met` gets added to the metadata. Important examples and how the content library or CloudBolt uses them(note underscores):

- `--met-description "TEXT"` Content Library Description. Make sure to quote arguments that have spaces in them.
- `--met-label LABEL` Human-readable version of the name.
- `--met-version VERSION` XUI version number
- `--met-minimum_version_required VERSION` Minimum CloudBolt version number for the XUI
- `--met-maximum_version_required VERSION` Maximum CloudBolt version number for the XUI
- `--met-last_updated YYYY-MM-DD` Defaults to today unless specified

Paths are relative to the directory in which the command is run unless otherwise stated above.

## How to publish a new version to CodeArtifact

1. Delete any local `types` and `lib` folder in this directory
1. Increment the version of the `package.json` for this project and do an install to be sure the `package-lock.json` is up to date as well.
   - The command `npm version patch` does this for you. It creates a git tag too.
1. Run the command `npm publish` to publish this version to CodeArtifact
