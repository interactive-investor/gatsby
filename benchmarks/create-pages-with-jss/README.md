# createPages with JSS (processing load) benchmark

Stress tests creating lots of tiny pages but with JSS styles - that add extra processing load onto the process.

Defaults to building a site with 5k pages. Set the `NUM_PAGES` environment variable to change that e.g. `NUM_PAGES=25000 gatsby build`

# Running the benchmark

First install node modules required by package.json. This is needed only one time. Then run the build

```bash
npm install
npm run build
```
