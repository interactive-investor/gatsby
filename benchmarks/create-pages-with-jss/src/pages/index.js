import React from "react"
import injectSheet from "react-jss"

const styles = {
  container: {
    backgroundColor: `#dedede`,
    padding: 20,
  },
}

const HelloWorldPage = ({ classes }) => (
  <div className={classes.container}>
    <p>
      Hello
      <span>World</span>
    </p>
  </div>
)

export default injectSheet(styles)(HelloWorldPage)
