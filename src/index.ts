import { Command } from 'commander'

declare const __CLI_VERSION__: string

const versionString = `fintoc/${__CLI_VERSION__} ${process.platform} node-${process.version}`

const program = new Command()

program
  .name('fintoc')
  .description('Fintoc CLI — manage your Fintoc resources from the terminal')
  .version(versionString, '-v, --version')

program.parse()
