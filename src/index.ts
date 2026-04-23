import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string
}

const versionString = `fintoc/${pkg.version} ${process.platform} node-${process.version}`

const program = new Command()

program
  .name('fintoc')
  .description('Fintoc CLI — manage your Fintoc resources from the terminal')
  .version(versionString, '-v, --version')

program.parse()

if (!process.argv.slice(2).length) {
  program.outputHelp()
}
