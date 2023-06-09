import { describe, expect, test } from 'vitest'
import {
  checkConfigRequirements,
  combineConfigs,
  parseConfig
} from './index.js'

/* TODO: Write more tests that cover the fs read/write functions */

describe('parseConfig', () => {
  test('parses basic fields correctly', () => {
    const args = {
      vue_src: 'src',
      xui_src: 'xui',
      output: 'build',
      name: 'My App',
      exclude: 'node_modules',
      id: 'ABC-12345678'
    }
    const config = parseConfig(args)
    expect(config).toEqual({
      vue_src: 'src',
      xui_src: 'xui',
      output: 'build',
      name: 'My App',
      exclude: 'node_modules',
      id: 'ABC-12345678'
    })
  })

  test('adds icon path and filename if icon is specified', () => {
    const args = { icon: 'path/to/icon.png' }
    const config = parseConfig(args)
    expect(config).toEqual({
      iconPath: 'path/to/icon.png',
      iconFilename: 'icon.png'
    })
  })

  test('parses extra metadata correctly', () => {
    const args = {
      met_foo: 'bar',
      met_baz: 'qux'
    }
    const config = parseConfig(args)
    expect(config.extraMetadata).toEqual({
      foo: 'bar',
      baz: 'qux'
    })
  })

  test('returns an empty object if no arguments are provided', () => {
    const args = {}
    const config = parseConfig(args)
    expect(config).toEqual({})
  })
})

describe('combineConfigs', () => {
  test('combines two configs with no conflicts', () => {
    const config1 = { name: 'My App', id: 'ABC-12345678' }
    const config2 = { vueSrcDir: 'src', xuiSrcDir: 'xui' }
    const combined = combineConfigs(config1, config2)
    expect(combined).toEqual({
      name: 'My App',
      id: 'ABC-12345678',
      vueSrcDir: 'src',
      xuiSrcDir: 'xui',
      exclude: [],
      extraMetadata: {}
    })
  })

  test('combines two configs with conflicts', () => {
    const config1 = { name: 'My App', id: 'ABC-12345678' }
    const config2 = { id: 'DEF-87654321', exclude: ['node_modules'] }
    const combined = combineConfigs(config1, config2)
    expect(combined).toEqual({
      name: 'My App',
      id: 'DEF-87654321',
      exclude: ['node_modules'],
      extraMetadata: {}
    })
  })

  test('combines three configs with no conflicts', () => {
    const config1 = { name: 'My App', id: 'ABC-12345678' }
    const config2 = { vueSrcDir: 'src', xuiSrcDir: 'xui' }
    const config3 = { outputDir: 'build', extraMetadata: { foo: 'bar' } }
    const combined = combineConfigs(config1, config2, config3)
    expect(combined).toEqual({
      name: 'My App',
      id: 'ABC-12345678',
      vueSrcDir: 'src',
      xuiSrcDir: 'xui',
      outputDir: 'build',
      exclude: [],
      extraMetadata: { foo: 'bar' }
    })
  })

  test('combines three configs with conflicts', () => {
    const config1 = { name: 'My App', id: 'ABC-12345678' }
    const config2 = { id: 'DEF-87654321', exclude: ['node_modules'] }
    const config3 = { outputDir: 'build', extraMetadata: { foo: 'bar' } }
    const combined = combineConfigs(config1, config2, config3)
    expect(combined).toEqual({
      name: 'My App',
      id: 'DEF-87654321',
      exclude: ['node_modules'],
      outputDir: 'build',
      extraMetadata: { foo: 'bar' }
    })
  })
})

describe('checkConfigRequirements', () => {
  test('throws an error if id is missing', () => {
    const config = { name: 'Test Config' }
    expect(() => checkConfigRequirements(config)).toThrow('id is required')
  })

  test('throws an error if name is missing', () => {
    const config = { id: 'ABC-12345678' }
    expect(() => checkConfigRequirements(config)).toThrow('name is required')
  })

  test('throws an error if id is not in the correct format', () => {
    const config = { id: 'invalid-id', name: 'Test Config' }
    expect(() => checkConfigRequirements(config)).toThrow(
      'id must be in the format "XXX-xxxxxxxx" where "XXX" is any 3 uppercase letters (generally XUI or APL) and "x" is any number or lowercase letter. Received "invalid-id"'
    )
  })

  test('does not throw an error if id and name are present and id is in the correct format', () => {
    const config = { id: 'ABC-12345678', name: 'Test Config' }
    expect(() => checkConfigRequirements(config)).not.toThrow()
  })
})
