import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(
  readFileSync(new URL('../app.json', import.meta.url), 'utf8'),
)

test('manifest declares exactly the two public market origins', () => {
  const network = manifest.permissions.find(permission => permission.name === 'network')
  assert.ok(network, 'app.json must declare a network permission for the Even WebView gate')
  assert.deepEqual(network.whitelist, [
    'https://api.hyperliquid.xyz',
    'https://fapi.binance.com',
  ])
  assert.equal(manifest.permissions.length, 1)
})

test('manifest has no wallet, microphone or other permissions', () => {
  const names = manifest.permissions.map(permission => permission.name)
  assert.deepEqual(names, ['network'])
  assert.equal(manifest.package_id, 'com.matrixneo.hlglass')
  assert.equal(manifest.entrypoint, 'index.html')
  assert.equal(manifest.min_sdk_version, '0.0.10')
})
