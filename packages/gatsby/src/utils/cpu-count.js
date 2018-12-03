/**
 * Calculate CPU count
 * @param {boolean} [alwaysReturnADefault=true] If we can't calculate a CPU count, return default value.
 * @returns {(number|undefined)} Count of CPU or undefined
 */

const physical_cores = require(`physical-cpu-count`)
const logical_cores = require(`os`).cpus().length

const cpuCount = (alwaysReturnADefault = true) => {
  let cpuCount

  if (alwaysReturnADefault) {
    // Default CPU count === physical CPU count,
    // or default to 1 if we can't detect
    cpuCount = physical_cores || 1
  }

  if (process.env.GATSBY_CPU_COUNT) {
    switch (typeof process.env.GATSBY_CPU_COUNT) {
      case `string`:
        // Leave at Default CPU count
        // if process.env.GATSBY_CPU_COUNT === `physical_cores`)

        // CPU count === logical CPU count or default
        if (process.env.GATSBY_CPU_COUNT === `logical_cores`) {
          cpuCount = logical_cores || cpuCount
        }
        break

      case `number`:
        // CPU count === passed in count,
        cpuCount = parseInt(process.env.GATSBY_CPU_COUNT, 10)
        break

      default:
        break
    }
  }

  return cpuCount
}

module.exports = cpuCount
