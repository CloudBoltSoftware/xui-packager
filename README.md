# CB XUI Packager

A helper tool that creates zip directories and metadata files necessary for turning a production build of a JS app into a XUI package for importing into CMP.

## How to publish a new version to CodeArtifact

1. Delete any local `types` and `lib` folder in this directory
1. Increment the version of the `package.json` for this project and do an install to be sure the `package-lock.json` is up to date as well.
   - The command `npm version patch` does this for you. It creates a git tag too.
1. Run the command `npm run build` which will create the `types` and `lib` folder for this version you are about to publish.
1. Run the command `npm publish` to publish this version to CodeArtifact
