export const httpAdapter = String.raw`
import { appendFileSync } from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import os from 'node:os'

const require = createRequire(process.env.FINTOC_TEST_CLI)
const sdkRequire = createRequire(require.resolve('fintoc'))
const axios = sdkRequire('axios')

os.homedir = () => process.env.FINTOC_TEST_DIR
syncBuiltinESMExports()

axios.defaults.adapter = async (config) => {
  appendFileSync(
    process.env.FINTOC_TEST_REQUESTS,
    JSON.stringify({
      method: config.method,
      path: new URL(config.url).pathname,
      params: config.params,
      ...(config.data ? { body: JSON.parse(config.data) } : {}),
    }) + '\n',
  )
  const response = {
    data: JSON.parse(process.env.FINTOC_TEST_RESPONSE),
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
  if (process.env.FINTOC_TEST_API_ERROR) {
    response.status = 400
    throw new axios.AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
  }
  return response
}
`
