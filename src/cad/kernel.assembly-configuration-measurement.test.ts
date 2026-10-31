import { expect, it } from 'vitest'
import { configuredMeasurementBands, authenticateConfiguredMeasurement, measureConfiguredDirection, measureConfiguredSupport } from './kernel.assembly-configuration-measurement'
import { AssemblyConfigurationGeometrySnapshot, type AssemblyConfigurationGeometryInput, type AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import type { ConfiguredResolvedMate } from './kernel.assembly-configuration-relations'

it('retains explicitly requested physical bands without widening small positive values', () => {
  expect(configuredMeasurementBands({ lengthToleranceMm: 1e-12, angleToleranceRad: 1e-14 })).toEqual({ lengthToleranceMm: 1e-12, angleToleranceRad: 1e-14 })
  expect(configuredMeasurementBands()).toEqual({ lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8 })
})
it.each([0, -1, NaN, Infinity, -Infinity, Math.PI / 2, Math.PI])('rejects ambiguous or invalid angular band %s', value => {
  expect(() => configuredMeasurementBands({ angleToleranceRad: value })).toThrow()
})
it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid linear band %s', value => {
  expect(() => configuredMeasurementBands({ lengthToleranceMm: value })).toThrow()
})
it('rejects executable options without invoking their getter', () => {
  let reads = 0
  const value = Object.defineProperty({}, 'lengthToleranceMm', { enumerable: true, get() { reads++; return 1 } })
  expect(() => configuredMeasurementBands(value)).toThrow()
  expect(reads).toBe(0)
  expect(() => configuredMeasurementBands(Object.create({ lengthToleranceMm: 1 }))).toThrow()
  expect(() => configuredMeasurementBands(Object.defineProperty({}, 'angleToleranceRad', { value: 1 }))).toThrow()
  expect(() => configuredMeasurementBands({ extra: 1 } as never)).toThrow()
  expect(() => configuredMeasurementBands({ [Symbol('extra')]: 1 })).toThrow()
})
it('rejects structural native providers even when they expose no-op public authentication', () => {
  const fake = Object.create(AssemblyConfigurationGeometrySnapshot.prototype)
  fake.assertCurrent = () => undefined
  fake.assertWitness = (value: unknown) => value
  fake.assertResolvedMate = (value: unknown) => value
  const context = {} as AssemblyConfigurationGeometryInput
  const relation = {} as ConfiguredResolvedMate, witness = {} as AssemblyConfigurationWitness
  expect(() => authenticateConfiguredMeasurement(fake, context, relation)).toThrow()
  expect(() => measureConfiguredDirection(fake, context, witness)).toThrow()
  expect(() => measureConfiguredSupport(fake, context, witness, [0, 0, 0])).toThrow()
})
