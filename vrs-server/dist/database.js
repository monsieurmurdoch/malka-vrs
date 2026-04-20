"use strict";

// Bridge compiled dist/lib services to the runtime database module that lives
// at vrs-server/database.js in the JS server path.
module.exports = require("../database");
