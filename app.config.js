// app.json holds the static config; the version comes from package.json so there is one place to bump it
const { version } = require("./package.json");

module.exports = ({ config }) => ({
  ...config,
  version,
});
