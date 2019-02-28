import React from "react"
import { ThemeProvider } from "react-jss"

// remove the JSS style tag generated on the server to avoid conflicts with the one added on the client
export const onInitialClientRender = () => {
  const ssStyles = window.document.getElementById(`server-side-jss`)
  ssStyles && ssStyles.parentNode.removeChild(ssStyles)
}

// eslint-disable-next-line react/prop-types
export const wrapRootElement = ({ element }, options) => {
  const theme = options.theme || {}
  return <ThemeProvider theme={theme}>{element}</ThemeProvider>
}
