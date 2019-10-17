/* @flow */
const { difference } = require(`lodash`)
const path = require(`path`)
const report = require(`gatsby-cli/lib/reporter`)
const buildHTML = require(`./build-html`)
const buildProductionBundle = require(`./build-javascript`)
const bootstrap = require(`../bootstrap`)
const apiRunnerNode = require(`../utils/api-runner-node`)
const { copyStaticDirs } = require(`../utils/get-static-dir`)
const { initTracer, stopTracer } = require(`../utils/tracer`)
const db = require(`../db`)
const tracer = require(`opentracing`).globalTracer()
const signalExit = require(`signal-exit`)
const telemetry = require(`gatsby-telemetry`)
const { store, emitter } = require(`../redux`)
const queryUtil = require(`../query`)
const pageDataUtil = require(`../utils/page-data`)
const WorkerPool = require(`../utils/worker/pool`)
const handleWebpackError = require(`../utils/webpack-error-parser`)
const { readFromCache } = require(`../redux/persist.js`)

type BuildArgs = {
  directory: string,
  sitePackageJson: object,
  prefixPaths: boolean,
  noUglify: boolean,
  openTracingConfigFile: string,
}

const waitJobsFinished = () =>
  new Promise((resolve, reject) => {
    const onEndJob = () => {
      if (store.getState().jobs.active.length === 0) {
        resolve()
        emitter.off(`END_JOB`, onEndJob)
      }
    }
    emitter.on(`END_JOB`, onEndJob)
    onEndJob()
  })

module.exports = async function build(program: BuildArgs) {
  const publicDir = path.join(program.directory, `public`)
  const incrementalBuild =
    process.env.GATSBY_INCREMENTAL_BUILD === `true` || false
  initTracer(program.openTracingConfigFile)

  telemetry.trackCli(`BUILD_START`)
  signalExit(() => {
    telemetry.trackCli(`BUILD_END`)
  })

  const buildSpan = tracer.startSpan(`build`)
  buildSpan.setTag(`directory`, program.directory)

  const { graphqlRunner } = await bootstrap({
    ...program,
    parentSpan: buildSpan,
  })

  const queryIds = queryUtil.calcInitialDirtyQueryIds(store.getState())
  const { staticQueryIds, pageQueryIds } = queryUtil.groupQueryIds(queryIds)

  let activity = report.activityTimer(`run static queries`, {
    parentSpan: buildSpan,
  })
  activity.start()
  await queryUtil.processStaticQueries(staticQueryIds, {
    activity,
    state: store.getState(),
  })
  activity.end()

  await apiRunnerNode(`onPreBuild`, {
    graphql: graphqlRunner,
    parentSpan: buildSpan,
  })

  // Copy files from the static directory to
  // an equivalent static directory within public.
  copyStaticDirs()

  activity = report.activityTimer(
    `Building production JavaScript and CSS bundles`,
    { parentSpan: buildSpan }
  )
  activity.start()
  const stats = await buildProductionBundle(program, {
    parentSpan: activity.span,
  }).catch(err => {
    report.panic(handleWebpackError(`build-javascript`, err))
  })
  activity.end()

  const workerPool = WorkerPool.create()

  const webpackCompilationHash = stats.hash
  if (webpackCompilationHash !== store.getState().webpackCompilationHash) {
    store.dispatch({
      type: `SET_WEBPACK_COMPILATION_HASH`,
      payload: webpackCompilationHash,
    })

    activity = report.activityTimer(`Rewriting compilation hashes`, {
      parentSpan: buildSpan,
    })
    activity.start()

    // We need to update all page-data.json files with the new
    // compilation hash. As a performance optimization however, we
    // don't update the files for `pageQueryIds` (dirty queries),
    // since they'll be written after query execution.
    const cleanPagePaths = difference(
      [...store.getState().pages.keys()],
      pageQueryIds
    )
    await pageDataUtil.updateCompilationHashes(
      { publicDir, workerPool },
      cleanPagePaths,
      webpackCompilationHash
    )
    activity.end()
  }

  let newPageKeys = []
  if (incrementalBuild) {
    activity = report.activityTimer(`Comparing previous data set`)
    activity.start()
    newPageKeys = await pageDataUtil.getNewPageKeys(
      store.getState(),
      readFromCache()
    )
    activity.end()
  }

  activity = report.activityTimer(`run page queries`, {
    parentSpan: buildSpan,
  })
  activity.start()
  await queryUtil.processPageQueries(
    incrementalBuild ? newPageKeys : pageQueryIds,
    {
      activity,
    }
  )
  activity.end()

  require(`../redux/actions`).boundActionCreators.setProgramStatus(
    `BOOTSTRAP_QUERY_RUNNING_FINISHED`
  )

  activity = report.activityTimer(`Building static HTML for pages`, {
    parentSpan: buildSpan,
  })
  activity.start()
  try {
    await buildHTML.buildPages({
      program,
      stage: `build-html`,
      pagePaths: incrementalBuild
        ? newPageKeys
        : [...store.getState().pages.keys()],
      activity,
      workerPool,
    })
  } catch (err) {
    let id = `95313` // TODO: verify error IDs exist
    if (err.message === `ReferenceError: window is not defined`) {
      id = `95312`
    }

    report.panic({
      id,
      error: err,
      context: {
        errorPath: err.context && err.context.path,
      },
    })
  }
  activity.end()

  let deletedPageKeys = []
  if (incrementalBuild) {
    activity = report.activityTimer(`Delete previous page data`)
    activity.start()
    deletedPageKeys = await pageDataUtil.removePreviousPageData(
      program.directory,
      store.getState(),
      readFromCache()
    )
    activity.end()
  }

  activity = report.activityTimer(`Update cache for next build`, {
    parentSpan: buildSpan,
  })
  activity.start()
  await waitJobsFinished()
  await db.saveState()
  activity.end()

  await apiRunnerNode(`onPostBuild`, {
    graphql: graphqlRunner,
    parentSpan: buildSpan,
  })

  report.info(`Done building in ${process.uptime()} sec`)

  buildSpan.finish()
  await stopTracer()
  workerPool.end()

  if (process.argv.length && process.argv.indexOf(`--log-pages`)) {
    console.log(`incrementalBuildPages:`, newPageKeys)
    console.log(`incrementalBuildDeletedPages:`, deletedPageKeys)
  }
}
