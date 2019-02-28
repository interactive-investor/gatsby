import React from "react"
import injectSheet from "react-jss"

const styles = {
  "@global": {
    body: {
      fontFamily: `Helvetica, Arial, sans-serif`,
      margin: 0,
      padding: 0,
    },
  },
  container: {
    backgroundColor: `#cccccc`,
    padding: 20,
  },
}

class Layout extends React.Component {
  render() {
    const { classes } = this.props

    return <div className={classes.container}>{this.props.children}</div>
  }
}

export default injectSheet(styles)(Layout)
